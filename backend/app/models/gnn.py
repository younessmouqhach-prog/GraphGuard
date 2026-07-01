"""
Graph Neural Network models for node-level fraud classification.
================================================================

FR : Implémentation auto-contenue de GraphSAGE et d'une couche d'attention
     (GAT-like) en PyTorch *pur* (aucune dépendance à torch-geometric), afin
     de garantir l'exécution sur n'importe quelle machine. Une variante
     PyTorch Geometric est fournie séparément (gnn_pyg.py) pour la stack
     recommandée dans le cahier des charges.

EN : Self-contained GraphSAGE and attention (GAT-like) layers in *pure*
     PyTorch (no torch-geometric dependency) so it runs anywhere. A PyTorch
     Geometric variant is provided separately (gnn_pyg.py) for the
     recommended stack.

Message passing uses a sparse adjacency built once per graph; aggregation is
the symmetric-normalised neighbour mean (GraphSAGE-mean) or attention-weighted
sum (GAT).  Both are standard, well-cited formulations.
"""

from __future__ import annotations

from typing import List

import torch
import torch.nn as nn
import torch.nn.functional as F


# --------------------------------------------------------------------------- #
# Adjacency helper
# --------------------------------------------------------------------------- #
def build_sparse_adj(edge_index: torch.Tensor, num_nodes: int,
                     add_self_loops: bool = True) -> torch.Tensor:
    """Build a symmetric-normalised sparse adjacency  D^-1/2 (A+I) D^-1/2.

    edge_index : LongTensor [2, E] (directed edges; we symmetrise for diffusion)
    """
    src, dst = edge_index[0], edge_index[1]
    # symmetrise: a transaction connects both accounts for diffusion purposes
    row = torch.cat([src, dst])
    col = torch.cat([dst, src])

    if add_self_loops:
        loop = torch.arange(num_nodes, device=edge_index.device)
        row = torch.cat([row, loop])
        col = torch.cat([col, loop])

    deg = torch.zeros(num_nodes, device=edge_index.device)
    deg.index_add_(0, row, torch.ones_like(row, dtype=torch.float))
    deg_inv_sqrt = deg.pow(-0.5)
    deg_inv_sqrt[torch.isinf(deg_inv_sqrt)] = 0.0

    values = deg_inv_sqrt[row] * deg_inv_sqrt[col]
    indices = torch.stack([row, col])
    adj = torch.sparse_coo_tensor(indices, values, (num_nodes, num_nodes))
    return adj.coalesce()


# --------------------------------------------------------------------------- #
# GraphSAGE-mean convolution
# --------------------------------------------------------------------------- #
class SAGEConv(nn.Module):
    """GraphSAGE convolution with mean aggregation (Hamilton et al., 2017)."""

    def __init__(self, in_dim: int, out_dim: int):
        super().__init__()
        self.lin_self = nn.Linear(in_dim, out_dim)
        self.lin_neigh = nn.Linear(in_dim, out_dim)

    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        neigh = torch.sparse.mm(adj, x)          # aggregated neighbourhood
        return self.lin_self(x) + self.lin_neigh(neigh)


# --------------------------------------------------------------------------- #
# Lightweight Graph-Attention convolution (GAT-style, single head)
# --------------------------------------------------------------------------- #
class GATConv(nn.Module):
    """Attention-weighted aggregation over the edge list (Velickovic, 2018)."""

    def __init__(self, in_dim: int, out_dim: int, heads: int = 2,
                 dropout: float = 0.2):
        super().__init__()
        self.heads = heads
        self.out_dim = out_dim
        self.lin = nn.Linear(in_dim, out_dim * heads, bias=False)
        self.att_src = nn.Parameter(torch.empty(1, heads, out_dim))
        self.att_dst = nn.Parameter(torch.empty(1, heads, out_dim))
        self.dropout = dropout
        nn.init.xavier_uniform_(self.att_src)
        nn.init.xavier_uniform_(self.att_dst)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        n = x.size(0)
        # add self loops so every node attends to itself
        loop = torch.arange(n, device=x.device)
        src = torch.cat([edge_index[0], edge_index[1], loop])
        dst = torch.cat([edge_index[1], edge_index[0], loop])

        h = self.lin(x).view(n, self.heads, self.out_dim)
        alpha_src = (h * self.att_src).sum(-1)   # [n, heads]
        alpha_dst = (h * self.att_dst).sum(-1)

        e = F.leaky_relu(alpha_src[src] + alpha_dst[dst], 0.2)  # [E, heads]
        # softmax over incoming edges of each destination node
        e = e - e.max()
        e = e.exp()
        denom = torch.zeros(n, self.heads, device=x.device)
        denom.index_add_(0, dst, e)
        alpha = e / (denom[dst] + 1e-16)
        alpha = F.dropout(alpha, p=self.dropout, training=self.training)

        msg = h[src] * alpha.unsqueeze(-1)        # [E, heads, out_dim]
        out = torch.zeros(n, self.heads, self.out_dim, device=x.device)
        out.index_add_(0, dst, msg)
        return out.mean(dim=1)                     # average heads


# --------------------------------------------------------------------------- #
# Full models
# --------------------------------------------------------------------------- #
class GraphSAGE(nn.Module):
    def __init__(self, in_dim: int, hidden: int = 64, num_classes: int = 2,
                 layers: int = 2, dropout: float = 0.3):
        super().__init__()
        self.convs = nn.ModuleList()
        self.convs.append(SAGEConv(in_dim, hidden))
        for _ in range(layers - 2):
            self.convs.append(SAGEConv(hidden, hidden))
        self.convs.append(SAGEConv(hidden, hidden))
        self.bns = nn.ModuleList([nn.BatchNorm1d(hidden) for _ in self.convs])
        self.head = nn.Linear(hidden, num_classes)
        self.dropout = dropout

    def encode(self, x, adj, edge_index):
        for conv, bn in zip(self.convs, self.bns):
            x = conv(x, adj)
            x = bn(x)
            x = F.relu(x)
            x = F.dropout(x, p=self.dropout, training=self.training)
        return x

    def forward(self, x, adj, edge_index):
        return self.head(self.encode(x, adj, edge_index))


class GAT(nn.Module):
    def __init__(self, in_dim: int, hidden: int = 64, num_classes: int = 2,
                 heads: int = 2, dropout: float = 0.3):
        super().__init__()
        self.conv1 = GATConv(in_dim, hidden, heads=heads, dropout=dropout)
        self.conv2 = GATConv(hidden, hidden, heads=heads, dropout=dropout)
        self.bn1 = nn.BatchNorm1d(hidden)
        self.bn2 = nn.BatchNorm1d(hidden)
        self.head = nn.Linear(hidden, num_classes)
        self.dropout = dropout

    def encode(self, x, adj, edge_index):
        x = F.relu(self.bn1(self.conv1(x, edge_index)))
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = F.relu(self.bn2(self.conv2(x, edge_index)))
        return x

    def forward(self, x, adj, edge_index):
        return self.head(self.encode(x, adj, edge_index))


class LogReg(nn.Module):
    """Logistic regression baseline — features only, no graph (ignores adj)."""

    def __init__(self, in_dim: int, hidden: int = 64, num_classes: int = 2, **_):
        super().__init__()
        self.head = nn.Linear(in_dim, num_classes)

    def encode(self, x, adj, edge_index):
        return x

    def forward(self, x, adj, edge_index):
        return self.head(x)


class MLP(nn.Module):
    """Multi-layer perceptron baseline — features only, no graph (ignores adj)."""

    def __init__(self, in_dim: int, hidden: int = 64, num_classes: int = 2,
                 dropout: float = 0.3, **_):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.BatchNorm1d(hidden), nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden), nn.BatchNorm1d(hidden), nn.ReLU(),
            nn.Dropout(dropout),
        )
        self.head = nn.Linear(hidden, num_classes)

    def encode(self, x, adj, edge_index):
        return self.net(x)

    def forward(self, x, adj, edge_index):
        return self.head(self.net(x))


MODEL_REGISTRY = {
    "logreg": LogReg, "mlp": MLP, "graphsage": GraphSAGE, "gat": GAT,
}


def build_model(name: str, in_dim: int, **kwargs) -> nn.Module:
    name = name.lower()
    if name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model '{name}'. Choose from {list(MODEL_REGISTRY)}")
    return MODEL_REGISTRY[name](in_dim=in_dim, **kwargs)
