"""
In-memory application store with disk persistence.
==================================================

Holds the current transaction graph, the per-node fraud scores produced by the
trained GNN, and the evaluation metrics. Exposes the query helpers consumed by
the REST API (graph slice, ranked alerts, per-account explanation).

FR : Magasin applicatif (graphe + scores + métriques) avec persistance disque.
EN : Application store (graph + scores + metrics) with disk persistence.
"""

from __future__ import annotations

import csv
import json
from typing import Dict, List, Optional

import torch

from .. import config
from ..data.generator import generate_graph, GraphData, FEATURE_NAMES
from ..data.loader import load_real_graph
from ..models.trainer import train_model


def _risk_band(score: float) -> str:
    if score >= 0.75:
        return "critical"
    if score >= 0.5:
        return "high"
    if score >= 0.25:
        return "medium"
    return "low"


class Store:
    def __init__(self) -> None:
        self.graph: Optional[GraphData] = None
        self.probs: List[float] = []
        self.metrics: Dict = {}
        self.config: Dict = {}
        self._node_by_id: Dict[str, dict] = {}
        self._ring_of: Dict[str, str] = {}     # account id -> ring name

    # ------------------------------------------------------------------ #
    # State management
    # ------------------------------------------------------------------ #
    @property
    def graph_ready(self) -> bool:
        return self.graph is not None

    @property
    def model_trained(self) -> bool:
        return bool(self.probs) and bool(self.metrics)

    def _reindex(self) -> None:
        self._node_by_id = {a["id"]: a for a in self.graph.accounts}
        self._ring_of = {}
        for ring, members in self.graph.pattern_index.items():
            for idx in members:
                self._ring_of[self.graph.accounts[idx]["id"]] = ring

    def generate(self, cfg: Dict) -> None:
        self.graph = generate_graph(**cfg)
        self.probs = []
        self.metrics = {}
        self._reindex()

    def load_real(self) -> bool:
        """Build the graph from the real CSV dataset (account_profiles + edges)."""
        if not (config.PROFILES_CSV.exists() and config.EDGES_CSV.exists()):
            return False
        self.graph = load_real_graph(config.PROFILES_CSV, config.EDGES_CSV)
        self.probs = []
        self.metrics = {}
        self._reindex()
        return True

    def train(self, cfg: Dict) -> Dict:
        if not self.graph_ready:
            self.generate(config.DEFAULT_GRAPH)
        result = train_model(self.graph, **cfg)
        self.probs = result["probs"]
        self.metrics = result["metrics"]
        self.config = result["config"]
        # attach score to each account for convenience
        for acc, p in zip(self.graph.accounts, self.probs):
            acc["score"] = round(float(p), 4)
        torch.save(
            {"state_dict": result["state_dict"], "scaler": result["scaler"],
             "config": result["config"],
             "feature_names": self.graph.feature_names},
            config.MODEL_PATH,
        )
        self.save()
        self.export_csv()
        from . import predictor
        predictor.reset()
        return self.metrics

    def export_csv(self) -> None:
        """Write the model's predictions (one row per account).

        Deliberately uses a dedicated filename so it never overwrites the
        source data files (account_profiles.csv / transactions.csv).
        """
        if not self.graph_ready:
            return
        with open(config.SCORES_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["account_id", "fraud_score", "predicted_fraud",
                        "true_label", "ring"])
            threshold = self.metrics.get("threshold", 0.5) if self.metrics else 0.5
            for a in self.graph.accounts:
                score = a.get("score", 0.0)
                w.writerow([a["id"], score, 1 if score >= threshold else 0,
                            a["label"], self._ring_of.get(a["id"], "")])
        if self.metrics:
            config.METRICS_JSON.write_text(
                json.dumps(self.metrics, indent=2), encoding="utf-8"
            )

    # ------------------------------------------------------------------ #
    # Persistence
    # ------------------------------------------------------------------ #
    def save(self) -> None:
        if not self.graph_ready:
            return
        snapshot = {
            "accounts": self.graph.accounts,
            "transactions": self.graph.transactions,
            "pattern_index": self.graph.pattern_index,
            "feature_names": self.graph.feature_names,
            "probs": self.probs,
            "metrics": self.metrics,
            "config": self.config,
        }
        config.STATE_PATH.write_text(json.dumps(snapshot), encoding="utf-8")

    def load(self) -> bool:
        if not config.STATE_PATH.exists():
            return False
        try:
            data = json.loads(config.STATE_PATH.read_text(encoding="utf-8"))
            self.graph = GraphData(
                accounts=data["accounts"],
                transactions=data["transactions"],
                pattern_index=data.get("pattern_index", {}),
                feature_names=data.get("feature_names") or list(FEATURE_NAMES),
            )
            self.probs = data.get("probs", [])
            self.metrics = data.get("metrics", {})
            self.config = data.get("config", {})
            self._reindex()
            return True
        except Exception:
            return False

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #
    def summary(self) -> Dict:
        if not self.graph_ready:
            return {}
        s = {
            "n_accounts": self.graph.num_nodes,
            "n_transactions": self.graph.num_edges,
            "n_fraud_accounts": self.graph.num_fraud,
            "n_rings": len(self.graph.pattern_index),
            "fraud_ratio": round(self.graph.num_fraud / max(1, self.graph.num_nodes), 4),
        }
        if self.model_trained:
            thr = self.metrics.get("threshold", 0.5)
            flagged = sum(1 for p in self.probs if p >= thr)
            # risk-band counts over ALL accounts (so the dashboard chart is honest)
            bands = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for p in self.probs:
                bands[_risk_band(p)] += 1
            # monetary view: total fraud losses, and how much the model would catch
            total_loss = 0.0
            caught_loss = 0.0
            for acc, p in zip(self.graph.accounts, self.probs):
                fa = acc.get("fraud_amount", 0.0)
                total_loss += fa
                if acc["label"] == 1 and p >= thr:
                    caught_loss += fa
            s.update({
                "flagged_accounts": flagged,
                "roc_auc": self.metrics.get("roc_auc"),
                "average_precision": self.metrics.get("average_precision"),
                "recall": self.metrics.get("recall"),
                "f1": self.metrics.get("f1"),
                "risk_bands": bands,
                "total_fraud_amount": round(total_loss, 2),
                "caught_fraud_amount": round(caught_loss, 2),
                "amount_recovery": round(caught_loss / total_loss, 4) if total_loss else 0.0,
            })
        return s

    def node_dict(self, acc: dict) -> dict:
        return {
            "id": acc["id"],
            "index": acc["index"],
            "label": acc["label"],
            "score": acc.get("score", 0.0),
            "country": acc["country"],
            "in_degree": acc.get("in_degree", 0),
            "out_degree": acc.get("out_degree", 0),
            "total_received": acc.get("total_received", 0.0),
            "total_sent": acc.get("total_sent", 0.0),
        }

    def get_graph(self, max_nodes: int = 350, only_suspicious: bool = False,
                  focus: Optional[str] = None, ring: Optional[str] = None) -> Dict:
        """Return a graph slice suitable for visualisation.

        Modes:
          * ring            -> all members of one fraud ring + their neighbours
          * focus           -> one account + its direct neighbourhood
          * only_suspicious -> the highest-risk accounts + their links
          * default         -> a representative slice of the *connected* network
        """
        keep_ids: set = set()

        if ring and ring in self.graph.pattern_index:
            members = {self.graph.accounts[i]["id"]
                       for i in self.graph.pattern_index[ring]}
            keep_ids |= members
            for t in self.graph.transactions:
                if len(keep_ids) >= max_nodes * 2:
                    break
                if t["source"] in members or t["target"] in members:
                    keep_ids.add(t["source"])
                    keep_ids.add(t["target"])

        elif focus and focus in self._node_by_id:
            keep_ids.add(focus)
            for t in self.graph.transactions:
                if t["source"] == focus:
                    keep_ids.add(t["target"])
                elif t["target"] == focus:
                    keep_ids.add(t["source"])

        elif only_suspicious:
            scored = sorted(self.graph.accounts,
                            key=lambda a: a.get("score", 0.0), reverse=True)
            for a in scored:
                if a.get("score", 0) >= 0.5 and len(keep_ids) < max_nodes:
                    keep_ids.add(a["id"])
            # add direct neighbours so rings stay connected
            for t in self.graph.transactions:
                if len(keep_ids) >= max_nodes * 2:
                    break
                if t["source"] in keep_ids or t["target"] in keep_ids:
                    keep_ids.add(t["source"])
                    keep_ids.add(t["target"])

        else:
            # Default: the real CONNECTED network only (no isolated dots, which
            # would float far away and look misleading). We sample edges with a
            # stride so the view spans many rings — including the legitimate
            # accounts that fraudsters are linked to — instead of just the first
            # few rings. Every node shown therefore has at least one visible link.
            edges = self.graph.transactions
            stride = max(1, len(edges) // max(1, max_nodes))
            i = 0
            while len(keep_ids) < max_nodes and i < len(edges):
                t = edges[i]
                keep_ids.add(t["source"])
                keep_ids.add(t["target"])
                i += stride
            # fill any remaining budget from the start of the edge list
            for t in edges:
                if len(keep_ids) >= max_nodes:
                    break
                keep_ids.add(t["source"])
                keep_ids.add(t["target"])

        nodes = [self.node_dict(self._node_by_id[i]) for i in keep_ids
                 if i in self._node_by_id]
        edges = [
            {"id": t["id"], "source": t["source"], "target": t["target"],
             "amount": t["amount"], "kind": t["kind"]}
            for t in self.graph.transactions
            if t["source"] in keep_ids and t["target"] in keep_ids
        ]
        return {"nodes": nodes, "edges": edges}

    def get_alerts(self, limit: int = 100, min_score: float = 0.0,
                   max_score: float = 1.01) -> List[dict]:
        rows = []
        for acc in self.graph.accounts:
            score = acc.get("score", 0.0)
            if score < min_score or score >= max_score:
                continue
            rows.append({
                "id": acc["id"],
                "score": score,
                "label": acc["label"],
                "risk": _risk_band(score),
                "country": acc["country"],
                "in_degree": acc.get("in_degree", 0),
                "out_degree": acc.get("out_degree", 0),
                "total_received": acc.get("total_received", 0.0),
                "total_sent": acc.get("total_sent", 0.0),
                "ring": self._ring_of.get(acc["id"]),
            })
        rows.sort(key=lambda r: r["score"], reverse=True)
        return rows[:limit]

    def ring_detail(self, ring_id: str) -> Optional[dict]:
        """Full breakdown of one fraud ring for the inspector panel."""
        members_idx = self.graph.pattern_index.get(ring_id)
        if not members_idx:
            return None
        from collections import Counter
        members = [self.graph.accounts[i] for i in members_idx]

        types: Counter = Counter()
        for tx in self.graph.transactions:
            if tx.get("ring") == ring_id:
                types[tx.get("kind", "")] += 1

        rows = sorted(
            ({"id": a["id"], "score": a.get("score", 0.0), "label": a["label"],
              "risk": _risk_band(a.get("score", 0.0))} for a in members),
            key=lambda r: r["score"], reverse=True,
        )
        scores = [a.get("score", 0.0) for a in members]
        n_fraud = sum(1 for a in members if a["label"] == 1)
        n_flagged = sum(1 for s in scores if s >= 0.5)
        return {
            "ring": ring_id,
            "size": len(members),
            "n_fraud": n_fraud,
            "n_flagged": n_flagged,
            "detected": round(n_flagged / len(members), 4) if members else 0.0,
            "avg_score": round(sum(scores) / len(scores), 4) if scores else 0.0,
            "types": dict(types),
            "members": rows,
        }

    def explain(self, account_id: str, lang: str = "en") -> Optional[dict]:
        acc = self._node_by_id.get(account_id)
        if acc is None:
            return None

        # feature attribution via population z-scores (interpretable & cheap)
        feats = acc["features"]
        pop = self.graph.accounts
        contribs = []
        for name in self.graph.feature_names:
            vals = [a["features"][name] for a in pop]
            mu = sum(vals) / len(vals)
            var = sum((v - mu) ** 2 for v in vals) / max(1, len(vals) - 1)
            std = var ** 0.5 or 1.0
            z = (feats[name] - mu) / std
            contribs.append({"feature": name, "value": round(feats[name], 3),
                             "z_score": round(z, 2)})
        contribs.sort(key=lambda c: abs(c["z_score"]), reverse=True)
        top = contribs[:5]

        # suspicious neighbours
        neighbors = []
        for t in self.graph.transactions:
            other = None
            direction = None
            if t["source"] == account_id:
                other, direction = t["target"], "out"
            elif t["target"] == account_id:
                other, direction = t["source"], "in"
            if other:
                o = self._node_by_id[other]
                neighbors.append({"id": other, "direction": direction,
                                  "amount": t["amount"], "kind": t["kind"],
                                  "score": o.get("score", 0.0)})
        neighbors.sort(key=lambda x: x["score"], reverse=True)

        score = acc.get("score", 0.0)
        ring = self._ring_of.get(account_id)
        narrative = self._narrative(acc, top, ring, score, lang)
        return {
            "id": account_id,
            "score": score,
            "label": acc["label"],
            "risk": _risk_band(score),
            "top_features": top,
            "neighbors": neighbors[:12],
            "ring": ring,
            "narrative": narrative,
        }

    FEATURE_LABELS = {
        "en": {
            # synthetic features
            "in_degree": "incoming transfers", "out_degree": "outgoing transfers",
            "total_received": "total received", "total_sent": "total sent",
            "mean_amount": "average amount", "amount_std": "amount variability",
            "flow_ratio": "money passing straight through",
            "distinct_peers": "number of partners", "velocity": "transactions per day",
            "night_ratio": "night-time activity", "rapid_movement": "funds moved out fast",
            "high_risk_geo": "high-risk country",
            # real-dataset features
            "account_age_days": "account age", "credit_limit_log": "credit limit",
            "risk_score": "risk score", "is_high_risk": "high-risk flag",
            "avg_txn_amount_log": "average transaction", "avg_monthly_txns": "monthly transactions",
            "has_2fa": "two-factor auth", "is_business": "business account",
            "total_transactions_log": "total transactions", "total_amount_log": "total amount",
            "avg_amount_log": "average amount", "max_amount_log": "largest transaction",
            "pct_foreign": "foreign transactions", "avg_velocity": "transaction velocity",
            "unique_countries": "countries used", "unique_categories": "merchant categories",
            "avg_ip_risk": "IP risk", "network_degree": "shared-identity links",
        },
        "fr": {
            # variables synthétiques
            "in_degree": "virements reçus", "out_degree": "virements émis",
            "total_received": "total reçu", "total_sent": "total envoyé",
            "mean_amount": "montant moyen", "amount_std": "variabilité des montants",
            "flow_ratio": "argent qui ne fait que passer",
            "distinct_peers": "nombre de partenaires", "velocity": "transactions par jour",
            "night_ratio": "activité nocturne", "rapid_movement": "fonds ressortis rapidement",
            "high_risk_geo": "pays à risque",
            # variables du vrai jeu de données
            "account_age_days": "ancienneté du compte", "credit_limit_log": "plafond de crédit",
            "risk_score": "score de risque", "is_high_risk": "marqueur à risque",
            "avg_txn_amount_log": "transaction moyenne", "avg_monthly_txns": "transactions mensuelles",
            "has_2fa": "double authentification", "is_business": "compte professionnel",
            "total_transactions_log": "nombre de transactions", "total_amount_log": "montant total",
            "avg_amount_log": "montant moyen", "max_amount_log": "plus grosse transaction",
            "pct_foreign": "transactions étrangères", "avg_velocity": "vélocité des transactions",
            "unique_countries": "pays utilisés", "unique_categories": "catégories de marchands",
            "avg_ip_risk": "risque IP", "network_degree": "liens d'identité partagés",
        },
    }

    @staticmethod
    def _narrative(acc, top, ring, score, lang) -> str:
        raw = top[0]["feature"] if top else ""
        labels = Store.FEATURE_LABELS.get(lang, Store.FEATURE_LABELS["en"])
        feat = labels.get(raw, raw)
        if lang == "fr":
            base = (f"Le compte {acc['id']} obtient un score de risque de "
                    f"{score:.0%}. ")
            if ring:
                kind = ring.split('_')[-1]
                pat = {"out": "distribution (smurfing)", "in": "collecte par mules",
                       "cycle": "cycle de blanchiment"}.get(kind)
                if pat:
                    base += f"Il appartient à un schéma de {pat} détecté. "
                else:
                    base += f"Il fait partie du réseau de fraude {ring}. "
            base += (f"Le facteur le plus atypique est « {feat} » "
                     f"(écart de {top[0]['z_score']:.1f} σ par rapport à la moyenne).")
            return base
        base = f"Account {acc['id']} has a fraud risk score of {score:.0%}. "
        if ring:
            kind = ring.split('_')[-1]
            pat = {"out": "fan-out / smurfing", "in": "fan-in / mule collection",
                   "cycle": "laundering cycle"}.get(kind)
            if pat:
                base += f"It belongs to a detected {pat} pattern. "
            else:
                base += f"It is part of fraud ring {ring}. "
        base += (f"Its most anomalous factor is '{feat}' "
                 f"({top[0]['z_score']:.1f} σ from the population mean).")
        return base


store = Store()
