"""
Optional PyTorch Geometric variant of the fraud-detection models.
=================================================================

FR : Variante utilisant la stack RECOMMANDÉE par le cahier des charges
     (PyTorch Geometric). Elle n'est pas requise pour exécuter le projet :
     le modèle PyTorch pur de gnn.py suffit. Installez torch-geometric puis
     basculez dessus via la variable d'environnement GRAPHGUARD_BACKEND=pyg.

EN : Variant using the stack RECOMMENDED by the project brief (PyTorch
     Geometric). Not required to run the project — the pure-PyTorch model in
     gnn.py is enough. Install torch-geometric and switch with the env var
     GRAPHGUARD_BACKEND=pyg.

This module imports torch_geometric lazily so the rest of the app keeps working
even when PyG is not installed.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch_geometric.nn import SAGEConv, GATConv  # type: ignore
    PYG_AVAILABLE = True
except Exception:  # pragma: no cover
    PYG_AVAILABLE = False


if PYG_AVAILABLE:

    class GraphSAGE_PyG(nn.Module):
        def __init__(self, in_dim, hidden=64, num_classes=2, dropout=0.3):
            super().__init__()
            self.conv1 = SAGEConv(in_dim, hidden)
            self.conv2 = SAGEConv(hidden, hidden)
            self.bn1 = nn.BatchNorm1d(hidden)
            self.bn2 = nn.BatchNorm1d(hidden)
            self.head = nn.Linear(hidden, num_classes)
            self.dropout = dropout

        def forward(self, x, edge_index):
            x = F.relu(self.bn1(self.conv1(x, edge_index)))
            x = F.dropout(x, p=self.dropout, training=self.training)
            x = F.relu(self.bn2(self.conv2(x, edge_index)))
            return self.head(x)

    class GAT_PyG(nn.Module):
        def __init__(self, in_dim, hidden=64, num_classes=2, heads=4, dropout=0.3):
            super().__init__()
            self.conv1 = GATConv(in_dim, hidden, heads=heads, dropout=dropout)
            self.conv2 = GATConv(hidden * heads, hidden, heads=1, dropout=dropout)
            self.head = nn.Linear(hidden, num_classes)
            self.dropout = dropout

        def forward(self, x, edge_index):
            x = F.elu(self.conv1(x, edge_index))
            x = F.dropout(x, p=self.dropout, training=self.training)
            x = F.elu(self.conv2(x, edge_index))
            return self.head(x)

    PYG_REGISTRY = {"graphsage": GraphSAGE_PyG, "gat": GAT_PyG}
else:
    PYG_REGISTRY = {}
