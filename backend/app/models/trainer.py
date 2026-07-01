"""
Training / evaluation pipeline for the fraud-detection GNN.
===========================================================

FR : Entraînement du GNN sur le graphe transactionnel, avec gestion du
     fort déséquilibre de classes (perte pondérée), découpage train/val/test
     et calcul de métriques adaptées à la fraude (AUC-PR, rappel, F1).
     Toutes les métriques sont calculées en Python pur (pas de scikit-learn).

EN : Trains the GNN on the transaction graph with class-imbalance handling
     (weighted loss), train/val/test split, and fraud-appropriate metrics
     (AUC-PR, recall, F1). All metrics computed in pure Python (no sklearn).
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

import torch
import torch.nn.functional as F

from ..data.generator import GraphData, to_tensors, FEATURE_NAMES
from .gnn import build_model, build_sparse_adj


# --------------------------------------------------------------------------- #
# Metrics (pure python so we avoid a scikit-learn dependency)
# --------------------------------------------------------------------------- #
def _roc_auc(scores: List[float], labels: List[int]) -> float:
    """Rank-based AUC (Mann-Whitney U)."""
    pos = [s for s, y in zip(scores, labels) if y == 1]
    neg = [s for s, y in zip(scores, labels) if y == 0]
    if not pos or not neg:
        return 0.0
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg_rank
        i = j + 1
    sum_pos = sum(r for r, y in zip(ranks, labels) if y == 1)
    n_pos, n_neg = len(pos), len(neg)
    return (sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def _pr_curve(scores: List[float], labels: List[int]) -> Tuple[List[float], List[float], float]:
    """Return (recall_points, precision_points, average_precision)."""
    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    total_pos = sum(labels) or 1
    tp = fp = 0
    recalls, precisions = [], []
    ap, prev_recall = 0.0, 0.0
    for idx in order:
        if labels[idx] == 1:
            tp += 1
        else:
            fp += 1
        recall = tp / total_pos
        precision = tp / (tp + fp)
        recalls.append(recall)
        precisions.append(precision)
        ap += precision * (recall - prev_recall)
        prev_recall = recall
    return recalls, precisions, ap


def _confusion(preds: List[int], labels: List[int]) -> Dict[str, int]:
    tp = sum(1 for p, y in zip(preds, labels) if p == 1 and y == 1)
    tn = sum(1 for p, y in zip(preds, labels) if p == 0 and y == 0)
    fp = sum(1 for p, y in zip(preds, labels) if p == 1 and y == 0)
    fn = sum(1 for p, y in zip(preds, labels) if p == 0 and y == 1)
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn}


def _prf(conf: Dict[str, int]) -> Dict[str, float]:
    tp, fp, fn = conf["tp"], conf["fp"], conf["fn"]
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"precision": precision, "recall": recall, "f1": f1}


# --------------------------------------------------------------------------- #
# Feature standardisation (kept with the model so inference matches training)
# --------------------------------------------------------------------------- #
def standardise(x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    mean = x.mean(0, keepdim=True)
    std = x.std(0, keepdim=True)
    std[std < 1e-6] = 1.0
    return (x - mean) / std, mean, std


def make_masks(n: int, y: torch.Tensor, seed: int = 7,
               ratios=(0.6, 0.2, 0.2)) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Stratified split so each fold keeps the fraud ratio."""
    g = torch.Generator().manual_seed(seed)
    train = torch.zeros(n, dtype=torch.bool)
    val = torch.zeros(n, dtype=torch.bool)
    test = torch.zeros(n, dtype=torch.bool)
    for cls in (0, 1):
        idx = (y == cls).nonzero(as_tuple=True)[0]
        idx = idx[torch.randperm(idx.numel(), generator=g)]
        n_tr = int(ratios[0] * idx.numel())
        n_va = int(ratios[1] * idx.numel())
        train[idx[:n_tr]] = True
        val[idx[n_tr:n_tr + n_va]] = True
        test[idx[n_tr + n_va:]] = True
    return train, val, test


# --------------------------------------------------------------------------- #
# Training entry point
# --------------------------------------------------------------------------- #
def train_model(
    graph: GraphData,
    model_name: str = "graphsage",
    epochs: int = 200,
    lr: float = 0.01,
    weight_decay: float = 5e-4,
    hidden: int = 64,
    seed: int = 7,
    device: str = "cpu",
) -> Dict:
    """Train and return everything the API needs (model state, metrics, scores)."""
    # Determinism: single-threaded + fixed seed so results reproduce run-to-run.
    torch.manual_seed(seed)
    torch.set_num_threads(1)
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except Exception:
        pass

    x_list, edge_list, y_list = to_tensors(graph)
    x = torch.tensor(x_list, dtype=torch.float, device=device)
    edge_index = torch.tensor(edge_list, dtype=torch.long, device=device)
    y = torch.tensor(y_list, dtype=torch.long, device=device)
    n = x.size(0)

    x, mean, std = standardise(x)
    adj = build_sparse_adj(edge_index, n).to(device)
    train_mask, val_mask, test_mask = make_masks(n, y, seed=seed)

    model = build_model(model_name, in_dim=x.size(1), hidden=hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

    # class weights to counter the heavy imbalance
    n_pos = int(y.sum().item())
    n_neg = n - n_pos
    weight = torch.tensor(
        [1.0, max(1.0, n_neg / max(1, n_pos))], dtype=torch.float, device=device
    )

    history: List[Dict] = []
    best_val_ap, best_state, best_epoch = -1.0, None, 0

    for epoch in range(1, epochs + 1):
        model.train()
        opt.zero_grad()
        logits = model(x, adj, edge_index)
        loss = F.cross_entropy(logits[train_mask], y[train_mask], weight=weight)
        loss.backward()
        opt.step()

        if epoch % 5 == 0 or epoch == 1:
            model.eval()
            with torch.no_grad():
                logits = model(x, adj, edge_index)
                probs = F.softmax(logits, dim=1)[:, 1]
            vp = probs[val_mask].cpu().tolist()
            vy = y[val_mask].cpu().tolist()
            val_auc = _roc_auc(vp, vy)
            _, _, val_ap = _pr_curve(vp, vy)
            history.append(
                {"epoch": epoch, "loss": float(loss.item()),
                 "val_auc": val_auc, "val_ap": val_ap}
            )
            if val_ap > best_val_ap:
                best_val_ap = val_ap
                best_epoch = epoch
                best_state = {k: v.clone() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)

    # ---- final evaluation on the held-out test fold
    model.eval()
    with torch.no_grad():
        logits = model(x, adj, edge_index)
        probs = F.softmax(logits, dim=1)[:, 1].cpu().tolist()

    test_idx = test_mask.cpu().tolist()
    tp_scores = [p for p, m in zip(probs, test_idx) if m]
    tp_labels = [l for l, m in zip(y.cpu().tolist(), test_idx) if m]

    # choose an operating threshold that maximises F1 on validation
    threshold = _best_threshold(
        [p for p, m in zip(probs, val_mask.cpu().tolist()) if m],
        [l for l, m in zip(y.cpu().tolist(), val_mask.cpu().tolist()) if m],
    )
    test_preds = [1 if p >= threshold else 0 for p in tp_scores]
    conf = _confusion(test_preds, tp_labels)
    prf = _prf(conf)
    recalls, precisions, ap = _pr_curve(tp_scores, tp_labels)

    metrics = {
        "model": model_name,
        "roc_auc": round(_roc_auc(tp_scores, tp_labels), 4),
        "average_precision": round(ap, 4),
        "precision": round(prf["precision"], 4),
        "recall": round(prf["recall"], 4),
        "f1": round(prf["f1"], 4),
        "threshold": round(threshold, 4),
        "confusion": conf,
        "best_epoch": best_epoch,
        "n_nodes": n,
        "n_edges": edge_index.size(1),
        "n_fraud": n_pos,
        "fraud_ratio": round(n_pos / n, 4),
        "pr_curve": _downsample(recalls, precisions, 60),
        "history": history,
        "feature_names": graph.feature_names,
    }

    return {
        "model": model,
        "state_dict": model.state_dict(),
        "scaler": {"mean": mean.cpu().tolist(), "std": std.cpu().tolist()},
        "probs": probs,                     # fraud score for *every* node
        "metrics": metrics,
        "config": {"model_name": model_name, "hidden": hidden,
                   "epochs": epochs, "lr": lr},
    }


def _best_threshold(scores: List[float], labels: List[int]) -> float:
    if not scores:
        return 0.5
    best_t, best_f1 = 0.5, -1.0
    for t in [i / 100 for i in range(5, 96, 2)]:
        preds = [1 if s >= t else 0 for s in scores]
        f1 = _prf(_confusion(preds, labels))["f1"]
        if f1 > best_f1:
            best_f1, best_t = f1, t
    return best_t


def _downsample(xs: List[float], ys: List[float], k: int) -> List[Dict[str, float]]:
    if len(xs) <= k:
        return [{"recall": round(a, 4), "precision": round(b, 4)} for a, b in zip(xs, ys)]
    step = len(xs) / k
    out = []
    for i in range(k):
        idx = min(len(xs) - 1, int(i * step))
        out.append({"recall": round(xs[idx], 4), "precision": round(ys[idx], 4)})
    return out
