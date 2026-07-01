"""REST API routes for GraphGuard."""

import csv
import random

from fastapi import APIRouter, HTTPException, Query

from .. import config
from ..i18n import t
from ..schemas import (GraphConfig, TrainConfig, StatusResponse, PredictRequest)
from ..services.store import store
from ..services import predictor

router = APIRouter(prefix="/api")

# raw account fields exposed by the simulator form / sample loader
SAMPLE_FIELDS = [
    "account_age_days", "credit_limit", "risk_score", "is_high_risk",
    "avg_txn_amount", "avg_monthly_txns", "has_2fa", "account_type",
    "total_transactions", "total_amount", "avg_amount", "max_amount",
    "pct_foreign", "avg_velocity", "unique_countries", "unique_categories",
    "avg_ip_risk",
]


@router.get("/status", response_model=StatusResponse)
def status():
    return StatusResponse(
        graph_ready=store.graph_ready,
        model_trained=store.model_trained,
        app=config.APP_NAME,
        version=config.APP_VERSION,
        summary=store.summary() or None,
    )


@router.post("/generate")
def generate(cfg: GraphConfig, lang: str = "en"):
    store.generate(cfg.model_dump())
    return {"message": t("graph_generated", lang), "summary": store.summary()}


@router.post("/train")
def train(cfg: TrainConfig, lang: str = "en"):
    metrics = store.train(cfg.model_dump())
    return {"message": t("training_started", lang), "metrics": metrics,
            "summary": store.summary()}


@router.get("/graph")
def graph(
    max_nodes: int = Query(350, ge=10, le=8000),
    only_suspicious: bool = False,
    focus: str | None = None,
    ring: str | None = None,
    lang: str = "en",
):
    if not store.graph_ready:
        raise HTTPException(409, t("graph_not_ready", lang))
    data = store.get_graph(max_nodes=max_nodes, only_suspicious=only_suspicious,
                           focus=focus, ring=ring)
    data["message"] = t("ok", lang)
    return data


@router.get("/alerts")
def alerts(limit: int = Query(100, ge=1, le=5000),
           min_score: float = Query(0.0, ge=0.0, le=1.0),
           max_score: float = Query(1.01, ge=0.0, le=1.01),
           lang: str = "en"):
    if not store.model_trained:
        raise HTTPException(409, t("model_not_trained", lang))
    return {"alerts": store.get_alerts(limit=limit, min_score=min_score,
                                       max_score=max_score)}


@router.get("/metrics")
def metrics(lang: str = "en"):
    if not store.model_trained:
        raise HTTPException(409, t("model_not_trained", lang))
    return store.metrics


@router.get("/account/{account_id}")
def account(account_id: str, lang: str = "en"):
    if not store.model_trained:
        raise HTTPException(409, t("model_not_trained", lang))
    exp = store.explain(account_id, lang=lang)
    if exp is None:
        raise HTTPException(404, t("account_not_found", lang))
    return exp


@router.post("/predict")
def predict(req: PredictRequest, lang: str = "en"):
    """Score a single hypothetical account (the simulator)."""
    if not predictor.available():
        raise HTTPException(409, t("model_not_trained", lang))
    threshold = store.metrics.get("threshold", 0.5) if store.metrics else 0.5
    return predictor.predict(req.model_dump(), threshold=threshold)


@router.get("/sample")
def sample(fraud: int = Query(0, ge=0, le=1), lang: str = "en"):
    """Return one real account's raw fields, to pre-fill the simulator form."""
    if not config.PROFILES_CSV.exists():
        raise HTTPException(404, "dataset not found")
    matches = []
    with open(config.PROFILES_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            is_fraud = 1 if float(row.get("is_fraudster") or 0) >= 0.5 else 0
            if is_fraud == fraud:
                matches.append(row)
                if len(matches) >= 400:
                    break
    if not matches:
        raise HTTPException(404, "no matching account")
    row = random.choice(matches)
    out = {}
    for k in SAMPLE_FIELDS:
        v = row.get(k, "")
        out[k] = v if k == "account_type" else (float(v) if v not in ("", None) else 0.0)
    out["account_id"] = row.get("account_id", "")
    return out


@router.get("/ring/{ring_id}")
def ring(ring_id: str, lang: str = "en"):
    if not store.graph_ready:
        raise HTTPException(409, t("graph_not_ready", lang))
    detail = store.ring_detail(ring_id)
    if detail is None:
        raise HTTPException(404, t("account_not_found", lang))
    return detail


@router.get("/rings")
def rings(lang: str = "en"):
    """Summary of every injected/detected fraud ring (for the audit view)."""
    if not store.graph_ready:
        raise HTTPException(409, t("graph_not_ready", lang))

    # count the shared-identifier types used inside each ring
    from collections import Counter
    ring_types = {}
    for tx in store.graph.transactions:
        rid = tx.get("ring")
        if rid:
            ring_types.setdefault(rid, Counter())[tx.get("kind", "")] += 1

    out = []
    for name, members in store.graph.pattern_index.items():
        accs = [store.graph.accounts[i] for i in members]
        ids = [a["id"] for a in accs]
        scores = [a.get("score", 0.0) for a in accs]
        n_fraud = sum(1 for a in accs if a["label"] == 1)
        amount = round(sum(a.get("fraud_amount", 0.0) for a in accs), 2)
        parts = name.split("_")              # e.g. ring_13_fan_in -> fan_in
        types = dict(ring_types.get(name, {}))
        primary = max(types, key=types.get) if types else (
            "_".join(parts[2:]) if len(parts) > 2 else "")
        out.append({
            "ring": name,
            "number": parts[1] if len(parts) > 1 else "",
            "kind": "_".join(parts[2:]) if len(parts) > 2 else name,
            "primary_type": primary,
            "types": types,
            "size": len(members),
            "n_fraud": n_fraud,
            "amount": amount,
            "accounts": ids,
            "avg_score": round(sum(scores) / len(scores), 4) if scores else 0.0,
            "detected": round(sum(1 for s in scores if s >= 0.5) / len(scores), 4)
            if scores else 0.0,
        })
    out.sort(key=lambda r: r["avg_score"], reverse=True)
    return {"rings": out}
