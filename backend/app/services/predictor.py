"""
Single-account fraud predictor (the "what-if" simulator).
=========================================================

Loads the trained GNN once and scores one account from raw feature inputs,
applying the exact same transforms + standardisation as training. The account
is scored as an isolated node (self-loop), so it is a feature-driven what-if —
useful for exploring how each factor moves the fraud probability.
"""

from __future__ import annotations

from typing import Dict

import torch
import torch.nn.functional as F

from .. import config
from ..data.loader import build_features
from ..models.gnn import build_model, build_sparse_adj

_cache: Dict = {}


def reset() -> None:
    _cache.clear()


def _load() -> Dict:
    if "model" in _cache:
        return _cache
    ckpt = torch.load(config.MODEL_PATH, map_location="cpu", weights_only=False)
    cfg = ckpt["config"]
    feature_names = ckpt["feature_names"]
    model = build_model(cfg["model_name"], in_dim=len(feature_names),
                        hidden=cfg.get("hidden", 64))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    _cache.update(
        model=model,
        feature_names=feature_names,
        mean=torch.tensor(ckpt["scaler"]["mean"], dtype=torch.float),
        std=torch.tensor(ckpt["scaler"]["std"], dtype=torch.float),
    )
    return _cache


def available() -> bool:
    return config.MODEL_PATH.exists()


def _band(p: float) -> str:
    if p >= 0.75:
        return "critical"
    if p >= 0.5:
        return "high"
    if p >= 0.25:
        return "medium"
    return "low"


def predict(raw: dict, threshold: float = 0.5) -> dict:
    c = _load()
    names = c["feature_names"]
    feats = build_features(raw, raw.get("network_degree", 0) or 0)

    x = torch.tensor([[feats[n] for n in names]], dtype=torch.float)
    xs = (x - c["mean"]) / c["std"]                # standardised (= z-scores)

    edge_index = torch.empty((2, 0), dtype=torch.long)
    adj = build_sparse_adj(edge_index, 1)
    with torch.no_grad():
        logits = c["model"](xs, adj, edge_index)
        prob = F.softmax(logits, dim=1)[0, 1].item()

    z = xs[0].tolist()
    factors = sorted(
        [{"feature": n, "value": round(feats[n], 3), "z_score": round(z[i], 2)}
         for i, n in enumerate(names)],
        key=lambda d: abs(d["z_score"]), reverse=True,
    )
    return {
        "fraud_probability": round(prob, 4),
        "risk": _band(prob),
        "prediction": 1 if prob >= threshold else 0,
        "threshold": round(threshold, 4),
        "top_factors": factors[:6],
    }
