"""
Command-line training / evaluation script.
===========================================

FR : Entraîne le GNN hors-ligne et affiche le rapport de métriques. Utile pour
     reproduire les résultats du rapport scientifique.
EN : Trains the GNN offline and prints the metrics report. Useful to reproduce
     the figures of the scientific report.

Usage:
    python -m scripts.train_model --model graphsage --epochs 200
    python -m scripts.train_model --model gat --rings 20 --accounts 1500
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.data.generator import generate_graph          # noqa: E402
from app.models.trainer import train_model             # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Train the GraphGuard GNN.")
    p.add_argument("--model", default="graphsage", choices=["graphsage", "gat"])
    p.add_argument("--epochs", type=int, default=200)
    p.add_argument("--lr", type=float, default=0.01)
    p.add_argument("--hidden", type=int, default=64)
    p.add_argument("--accounts", type=int, default=1200)
    p.add_argument("--legit", type=int, default=4500)
    p.add_argument("--rings", type=int, default=14)
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    print(f"\n[1/3] Generating graph: {args.accounts} accounts, "
          f"{args.rings} fraud rings ...")
    graph = generate_graph(n_accounts=args.accounts, n_legit_tx=args.legit,
                           n_fraud_rings=args.rings, seed=args.seed)
    print(f"      -> {graph.num_nodes} nodes, {graph.num_edges} edges, "
          f"{graph.num_fraud} fraud accounts "
          f"({graph.num_fraud / graph.num_nodes:.1%})")

    print(f"\n[2/3] Training {args.model} for {args.epochs} epochs ...")
    result = train_model(graph, model_name=args.model, epochs=args.epochs,
                         lr=args.lr, hidden=args.hidden)

    m = result["metrics"]
    print("\n[3/3] Test-set results")
    print("      " + "-" * 40)
    for key in ["roc_auc", "average_precision", "precision", "recall", "f1"]:
        print(f"      {key:<20}: {m[key]}")
    print(f"      threshold           : {m['threshold']}")
    print(f"      confusion (test)    : {json.dumps(m['confusion'])}")
    print("      " + "-" * 40)
    print("\nDone. Run the API with:  uvicorn app.main:app --reload\n")


if __name__ == "__main__":
    main()
