"""
Loader for the real CSV dataset (account_profiles + network_edges).
===================================================================

FR : Construit le graphe à partir des vraies données fournies dans `dataset/` :
     - account_profiles.csv : un compte par ligne, avec le label `is_fraudster`
     - network_edges.csv    : liens entre comptes partageant un identifiant
                              (téléphone, e-mail, IP, appareil) + ring_id

     IMPORTANT : les colonnes `fraud_count`, `fraud_amount`, `fraud_rate` sont
     EXCLUES des variables car elles révèlent directement le label (fuite de
     données). Le pays est constant (US) et donc ignoré.

EN : Builds the graph from the real data shipped in `dataset/`:
     - account_profiles.csv : one account per row, with the `is_fraudster` label
     - network_edges.csv    : links between accounts sharing an identifier
                              (phone, email, IP, device) + ring_id

     IMPORTANT: columns `fraud_count`, `fraud_amount`, `fraud_rate` are EXCLUDED
     from features because they leak the label. Country is constant (US) and
     ignored.
"""

from __future__ import annotations

import csv
import math
from typing import Dict, List

from .generator import GraphData

# Feature order used for the real dataset (no label leakage).
REAL_FEATURE_NAMES: List[str] = [
    "account_age_days",
    "credit_limit_log",
    "risk_score",
    "is_high_risk",
    "avg_txn_amount_log",
    "avg_monthly_txns",
    "has_2fa",
    "is_business",
    "total_transactions_log",
    "total_amount_log",
    "avg_amount_log",
    "max_amount_log",
    "pct_foreign",
    "avg_velocity",
    "unique_countries",
    "unique_categories",
    "avg_ip_risk",
    "network_degree",
]


def _f(row: dict, key: str, default: float = 0.0) -> float:
    val = row.get(key, "")
    if val is None or val == "":
        return default
    try:
        return float(val)
    except ValueError:
        return default


def build_features(row: dict, network_degree: float = 0.0) -> dict:
    """Compute the 18 model features from a raw account row.

    Shared by the loader (training) and the predictor (what-if simulation) so
    the exact same transforms are applied in both places.
    """
    is_business = 1.0 if row.get("account_type", "") == "business" else 0.0
    return {
        "account_age_days": _f(row, "account_age_days"),
        "credit_limit_log": math.log1p(_f(row, "credit_limit")),
        "risk_score": _f(row, "risk_score"),
        "is_high_risk": _f(row, "is_high_risk"),
        "avg_txn_amount_log": math.log1p(_f(row, "avg_txn_amount")),
        "avg_monthly_txns": _f(row, "avg_monthly_txns"),
        "has_2fa": _f(row, "has_2fa"),
        "is_business": is_business,
        "total_transactions_log": math.log1p(_f(row, "total_transactions")),
        "total_amount_log": math.log1p(_f(row, "total_amount")),
        "avg_amount_log": math.log1p(_f(row, "avg_amount")),
        "max_amount_log": math.log1p(_f(row, "max_amount")),
        "pct_foreign": _f(row, "pct_foreign"),
        "avg_velocity": _f(row, "avg_velocity"),
        "unique_countries": _f(row, "unique_countries"),
        "unique_categories": _f(row, "unique_categories"),
        "avg_ip_risk": _f(row, "avg_ip_risk"),
        "network_degree": float(network_degree),
    }


def load_real_graph(profiles_path, edges_path) -> GraphData:
    """Read the CSVs and return a GraphData ready for training."""
    accounts: List[dict] = []
    index_of: Dict[str, int] = {}

    with open(profiles_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            acc_id = row["account_id"]
            index_of[acc_id] = i
            label = 1 if _f(row, "is_fraudster") >= 0.5 else 0
            features = build_features(row, 0.0)   # degree filled after edges
            accounts.append({
                "id": acc_id,
                "index": i,
                "label": label,
                "country": row.get("home_country", "US"),
                "opened_days_ago": int(_f(row, "account_age_days")),
                "features": features,
                # UI convenience scalars (display only — NOT model features)
                "total_received": round(_f(row, "total_amount"), 2),
                "total_sent": round(_f(row, "max_amount"), 2),
                "fraud_amount": round(_f(row, "fraud_amount"), 2),
                "total_amount": round(_f(row, "total_amount"), 2),
                "in_degree": 0,
                "out_degree": int(_f(row, "total_transactions")),
            })

    # ---- edges (shared-identity links) ----
    transactions: List[dict] = []
    pattern_index: Dict[str, List[int]] = {}
    degree = [0] * len(accounts)
    eid = 0

    with open(edges_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            a, b = row["account_a"], row["account_b"]
            if a not in index_of or b not in index_of:
                continue
            ia, ib = index_of[a], index_of[b]
            shared = row.get("shared_type", "link")
            transactions.append({
                "id": f"E{eid:06d}",
                "source": a, "target": b,
                "source_index": ia, "target_index": ib,
                "amount": _f(row, "connection_count"),
                "hour": 0,
                "kind": shared,                   # phone | email_domain | ip_address | device_id
                "ring": row.get("ring_id", ""),
            })
            eid += 1
            degree[ia] += 1
            degree[ib] += 1
            ring = row.get("ring_id", "")
            if ring:
                pattern_index.setdefault(ring, [])
                if ia not in pattern_index[ring]:
                    pattern_index[ring].append(ia)
                if ib not in pattern_index[ring]:
                    pattern_index[ring].append(ib)

    # write degree back into features + UI scalars
    for i, acc in enumerate(accounts):
        acc["features"]["network_degree"] = float(degree[i])
        acc["in_degree"] = degree[i]

    return GraphData(
        accounts=accounts,
        transactions=transactions,
        pattern_index={k: sorted(v) for k, v in pattern_index.items()},
        feature_names=REAL_FEATURE_NAMES,
    )
