"""
Build the dataset and train the model into the top-level `dataset/` folder.
===========================================================================

FR : Génère un nouveau graphe transactionnel, entraîne le GNN, puis écrit dans
     le dossier `dataset/` : les données (accounts.csv, transactions.csv), les
     poids du modèle (model.pt), l'état complet (state.json) et les métriques
     (metrics.json).

EN : Generates a fresh transaction graph, trains the GNN, then writes into the
     `dataset/` folder: the data (accounts.csv, transactions.csv), model weights
     (model.pt), full state (state.json) and metrics (metrics.json).

Usage:
    python -m scripts.build_dataset
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config                       # noqa: E402
from app.services.store import store         # noqa: E402


def main() -> None:
    print(f"\nDataset folder: {config.DATASET_DIR}")
    if store.load_real():
        print("[1/2] Loaded REAL dataset (account_profiles.csv + network_edges.csv)")
    else:
        print("[1/2] Real CSV not found -> using synthetic generator")
        store.generate(config.DEFAULT_GRAPH)

    print(f"[2/2] Training {config.DEFAULT_TRAIN['model_name']} ...")
    m = store.train(config.DEFAULT_TRAIN)     # trains + saves + exports predictions

    s = store.summary()
    print("\nFiles written by the model:")
    for p in (config.SCORES_CSV, config.MODEL_PATH, config.STATE_PATH,
              config.METRICS_JSON):
        size = p.stat().st_size if p.exists() else 0
        print(f"   {p.name:<20} {size/1024:7.1f} KB")

    print("\nSummary:")
    print(f"   accounts      : {s['n_accounts']}")
    print(f"   transactions  : {s['n_transactions']}")
    print(f"   fraud accounts: {s['n_fraud_accounts']} ({s['fraud_ratio']:.1%})")
    print(f"   rings         : {s['n_rings']}")
    print(f"   ROC-AUC       : {m['roc_auc']}")
    print(f"   PR-AUC        : {m['average_precision']}")
    print(f"   recall / F1   : {m['recall']} / {m['f1']}")
    print("\nDone.\n")


if __name__ == "__main__":
    main()
