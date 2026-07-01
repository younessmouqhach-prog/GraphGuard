"""
Benchmark: non-graph baselines vs graph models on the real dataset.
Prints a comparison table (ROC-AUC, PR-AUC, precision, recall, F1) used in the
report's experimentation chapter.

Usage:  python -m scripts.compare_models
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config                       # noqa: E402
from app.data.loader import load_real_graph  # noqa: E402
from app.models.trainer import train_model   # noqa: E402

MODELS = [
    ("logreg", "Logistic Regression (no graph)"),
    ("mlp", "MLP (no graph)"),
    ("graphsage", "GraphSAGE (graph)"),
    ("gat", "GAT (graph)"),
]


def main() -> None:
    graph = load_real_graph(config.PROFILES_CSV, config.EDGES_CSV)
    print(f"Dataset: {graph.num_nodes} accounts, {graph.num_edges} links, "
          f"{graph.num_fraud} fraud ({graph.num_fraud / graph.num_nodes:.1%})\n")

    header = f"{'Model':<34}{'ROC-AUC':>9}{'PR-AUC':>9}{'Prec':>8}{'Recall':>8}{'F1':>8}"
    print(header)
    print("-" * len(header))
    rows = []
    for name, label in MODELS:
        r = train_model(graph, model_name=name, epochs=200)["metrics"]
        rows.append((label, r))
        print(f"{label:<34}{r['roc_auc']:>9.3f}{r['average_precision']:>9.3f}"
              f"{r['precision']:>8.3f}{r['recall']:>8.3f}{r['f1']:>8.3f}")
    print("-" * len(header))


if __name__ == "__main__":
    main()
