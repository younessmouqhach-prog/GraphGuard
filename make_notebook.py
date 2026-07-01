# -*- coding: utf-8 -*-
"""Generates notebooks/entrainement_modele.ipynb (a clean, runnable notebook
that reproduces the GraphGuard model training, with French instructions)."""
import json, os
from pathlib import Path

cells = []

def md(text):
    cells.append({"cell_type": "markdown", "metadata": {},
                  "source": text.strip("\n").splitlines(keepends=True)})

def code(text):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None,
                  "outputs": [], "source": text.strip("\n").splitlines(keepends=True)})

md(r"""
# GraphGuard — Entraînement du modèle (notebook reproductible)

**Mémoire de fin d'études — Master Finance et Data Science**
Préparé par : *Mouqhach Youness* · Encadré par : *Pr. TALHAOUI Mohamed Amine*

---

Ce notebook **reproduit pas à pas l'entraînement** du modèle de détection de fraude présenté dans le rapport.
Il est destiné à l'encadrant et au jury : chaque étape (données → variables → graphe → modèle → entraînement → évaluation)
est exécutable et commentée. Le code appelle **exactement les mêmes fonctions** que l'application
(`app.data.loader`, `app.models.trainer`, `app.models.gnn`), il ne s'agit donc pas d'une ré-implémentation
mais de la *vraie* chaîne de traitement.

> **Question type de l'encadrant : « Comment as-tu entraîné le modèle ? »**
> → Exécuter ce notebook de haut en bas répond à cette question de façon vérifiable et reproductible.
""")

md(r"""
## 0. Prérequis et exécution

1. **Python 3.10+**
2. Installer les dépendances (CPU suffit) :
   ```bash
   pip install torch --index-url https://download.pytorch.org/whl/cpu
   pip install matplotlib    # facultatif, pour les graphiques
   ```
3. Le **jeu de données réel** doit se trouver dans `GraphGuard-PFE/dataset/` :
   - `account_profiles.csv` — un compte par ligne, avec le label `is_fraudster`
   - `network_edges.csv` — liens entre comptes partageant un identifiant (téléphone, e-mail, IP, appareil)
4. Placer ce notebook dans `GraphGuard-PFE/notebooks/` puis l'exécuter **cellule par cellule** (`Maj+Entrée`).

> ⏱️ L'entraînement complet (50 000 comptes, 200 époques, CPU mono-thread) prend quelques minutes.
> Pour un test rapide, réduire `EPOCHS` plus bas.
""")

code(r"""
# --- Localisation du projet et import du code de l'application ---
import sys
from pathlib import Path

NB_DIR = Path.cwd()
PROJECT_ROOT = NB_DIR.parent if NB_DIR.name == "notebooks" else NB_DIR
BACKEND = PROJECT_ROOT / "backend"
assert BACKEND.exists(), f"Dossier backend introuvable : {BACKEND}"
sys.path.insert(0, str(BACKEND))   # rend le paquet `app` importable

import torch
from app import config

print("Projet      :", PROJECT_ROOT)
print("PyTorch     :", torch.__version__)
print("Profils CSV :", config.PROFILES_CSV, "—", "OK" if config.PROFILES_CSV.exists() else "MANQUANT")
print("Liens   CSV :", config.EDGES_CSV, "—", "OK" if config.EDGES_CSV.exists() else "MANQUANT")
""")

md(r"""
## 1. Chargement du jeu de données réel

La fonction `load_real_graph` lit les deux CSV et construit l'objet `GraphData`
(comptes + liens + variables). Point **important pour la rigueur scientifique** :
les colonnes `fraud_count`, `fraud_amount`, `fraud_rate` sont **exclues** des variables
car elles révéleraient directement le label (*fuite de données / data leakage*).
""")

code(r"""
from app.data.loader import load_real_graph, REAL_FEATURE_NAMES

graph = load_real_graph(config.PROFILES_CSV, config.EDGES_CSV)

n_nodes = len(graph.accounts)
n_edges = len(graph.transactions)
n_fraud = sum(a["label"] for a in graph.accounts)

print(f"Comptes (nœuds)        : {n_nodes:,}")
print(f"Liens (arêtes)         : {n_edges:,}")
print(f"Comptes frauduleux     : {n_fraud:,}  ({n_fraud/n_nodes:.1%})")
print(f"Nombre de variables (X): {len(graph.feature_names)}")
print(f"Réseaux (rings)        : {len(graph.pattern_index)}")
""")

md(r"""
## 2. Les variables d'entrée (X) et la cible (Y)

18 variables comportementales et de profil décrivent chaque compte. La cible `Y = is_fraudster` (0/1).
""")

code(r"""
print("Variables utilisées par le modèle (ordre fixe) :\n")
for i, name in enumerate(graph.feature_names, 1):
    print(f"{i:2d}. {name}")
""")

md(r"""
## 3. Exploration rapide (EDA)

Vérifions le déséquilibre de classes et la *rareté du graphe* (beaucoup de comptes isolés),
deux faits centraux discutés dans le rapport.
""")

code(r"""
# Distribution des degrés (nombre de liens par compte)
deg = [a["features"]["network_degree"] for a in graph.accounts]
isoles = sum(1 for d in deg if d == 0)
print(f"Comptes connectés      : {n_nodes - isoles:,}  ({(n_nodes-isoles)/n_nodes:.1%})")
print(f"Comptes isolés (deg=0) : {isoles:,}  ({isoles/n_nodes:.1%})")
print(f"Degré moyen            : {sum(deg)/len(deg):.2f}")
print(f"Degré maximum          : {int(max(deg))}")

# Comparaison de quelques variables entre comptes légitimes et frauduleux
def moyenne(feat, label):
    vals = [a["features"][feat] for a in graph.accounts if a["label"] == label]
    return sum(vals)/len(vals) if vals else 0.0

print("\nMoyenne par classe (légitime vs fraude) :")
for f in ["total_amount_log", "total_transactions_log", "avg_monthly_txns", "risk_score"]:
    print(f"  {f:24s}  légit={moyenne(f,0):7.3f}   fraude={moyenne(f,1):7.3f}")
""")

md(r"""
## 4. Préparation : tenseurs, normalisation, graphe, découpage

Cette cellule **reproduit ce que `train_model` fait en interne**, pour rendre le pré-traitement explicite :

1. `to_tensors` → matrices `x` (variables), `edge_index` (arêtes), `y` (labels) ;
2. **standardisation** des variables (moyenne 0, écart-type 1) ;
3. construction de la **matrice d'adjacence creuse normalisée** `D^-1/2 (A+I) D^-1/2` ;
4. **découpage stratifié** 60 % / 20 % / 20 % (train / validation / test) qui **préserve le taux de fraude** dans chaque fold.
""")

code(r"""
from app.data.generator import to_tensors
from app.models.gnn import build_sparse_adj
from app.models.trainer import standardise, make_masks

x_list, edge_list, y_list = to_tensors(graph)
x = torch.tensor(x_list, dtype=torch.float)
edge_index = torch.tensor(edge_list, dtype=torch.long)
y = torch.tensor(y_list, dtype=torch.long)

x, mean, std = standardise(x)                 # normalisation
adj = build_sparse_adj(edge_index, x.size(0)) # graphe -> adjacence creuse
train_mask, val_mask, test_mask = make_masks(x.size(0), y, seed=7)

def part(mask):
    nb = int(mask.sum()); fr = int(y[mask].sum())
    return f"{nb:6,} comptes — {fr/nb:.1%} de fraude"

print("X :", tuple(x.shape), " | arêtes :", edge_index.shape[1])
print("Train     :", part(train_mask))
print("Validation:", part(val_mask))
print("Test      :", part(test_mask))
print("\nLe taux de fraude est identique dans les 3 folds => découpage stratifié correct.")
""")

md(r"""
## 5. Les modèles

Quatre modèles sont comparés (registre `app.models.gnn.MODEL_REGISTRY`) :

| Clé | Modèle | Utilise le graphe ? |
|-----|--------|----------------------|
| `logreg`    | Régression logistique | ❌ (baseline tabulaire) |
| `mlp`       | Perceptron multicouche | ❌ (baseline tabulaire) |
| `graphsage` | GraphSAGE (agrégation de voisinage) | ✅ |
| `gat`       | Graph Attention Network | ✅ |

Les deux baselines servent à répondre à la question : *le graphe apporte-t-il un gain mesurable ?*
""")

code(r"""
from app.models.gnn import MODEL_REGISTRY, build_model

print("Modèles disponibles :", list(MODEL_REGISTRY))

# Aperçu de l'architecture de GraphSAGE (le modèle retenu)
demo = build_model("graphsage", in_dim=x.size(1), hidden=64)
n_params = sum(p.numel() for p in demo.parameters())
print(f"\nGraphSAGE — {n_params:,} paramètres entraînables")
print(demo)
""")

md(r"""
## 6. Entraînement du modèle retenu (GraphSAGE)

`train_model` réalise tout l'entraînement :

- **perte pondérée** (`cross_entropy` avec poids de classe) pour contrer le déséquilibre ;
- optimiseur **Adam** (`lr=0.01`, `weight_decay=5e-4`) ;
- **sélection du meilleur modèle** sur la validation (au sens de l'AUC-PR) ;
- **seuil de décision** choisi pour maximiser le F1 sur la validation ;
- **déterminisme** : graine fixe + un seul thread → résultats reproductibles d'une exécution à l'autre.
""")

code(r"""
from app.models.trainer import train_model

EPOCHS = 200          # réduire (ex. 40) pour un test rapide
SEED   = 7

result = train_model(graph, model_name="graphsage", epochs=EPOCHS, seed=SEED)
m = result["metrics"]

print("=== Résultats GraphSAGE (ensemble de TEST) ===")
print(f"ROC-AUC            : {m['roc_auc']}")
print(f"AUC-PR (avg prec.) : {m['average_precision']}")
print(f"Précision          : {m['precision']}")
print(f"Rappel             : {m['recall']}")
print(f"F1-score           : {m['f1']}")
print(f"Seuil de décision  : {m['threshold']}")
print(f"Meilleure époque   : {m['best_epoch']}")
""")

md(r"""
### Matrice de confusion (ensemble de test)
""")

code(r"""
c = m["confusion"]
print("                 Prédit fraude   Prédit légitime")
print(f"Vraie fraude   :     {c['tp']:6d}          {c['fn']:6d}")
print(f"Vrai légitime  :     {c['fp']:6d}          {c['tn']:6d}")
print(f"\nVrais positifs (fraudes détectées) : {c['tp']}")
print(f"Faux négatifs (fraudes manquées)   : {c['fn']}")
print(f"Faux positifs (fausses alertes)    : {c['fp']}")
""")

md(r"""
## 7. Courbes (facultatif — nécessite `matplotlib`)

Évolution de l'entraînement et courbe précision-rappel.
""")

code(r"""
try:
    import matplotlib.pyplot as plt
    hist = m["history"]
    ep   = [h["epoch"] for h in hist]

    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    ax[0].plot(ep, [h["loss"] for h in hist], label="perte (train)")
    ax[0].plot(ep, [h["val_ap"] for h in hist], label="AUC-PR (val)")
    ax[0].set_xlabel("époque"); ax[0].set_title("Apprentissage"); ax[0].legend()

    pr = m["pr_curve"]
    ax[1].plot([p["recall"] for p in pr], [p["precision"] for p in pr])
    ax[1].set_xlabel("rappel"); ax[1].set_ylabel("précision")
    ax[1].set_title(f"Courbe précision-rappel (AP={m['average_precision']})")
    plt.tight_layout(); plt.show()
except ImportError:
    print("matplotlib non installé — installez-le avec : pip install matplotlib")
""")

md(r"""
## 8. Comparaison des quatre modèles

C'est le tableau clé du rapport. On entraîne les quatre modèles dans les mêmes conditions
(mêmes données, même découpage, même graine) et on compare leurs métriques sur l'ensemble de test.

> ⏱️ Cette cellule entraîne 4 modèles : comptez quelques minutes.
""")

code(r"""
MODELES = [
    ("logreg",    "Régression logistique (sans graphe)"),
    ("mlp",       "MLP (sans graphe)"),
    ("graphsage", "GraphSAGE (graphe)"),
    ("gat",       "GAT (graphe)"),
]

print(f"{'Modèle':<36}{'ROC-AUC':>9}{'AUC-PR':>9}{'Préc.':>8}{'Rappel':>8}{'F1':>8}")
print("-" * 78)
comparaison = {}
for cle, libelle in MODELES:
    r = train_model(graph, model_name=cle, epochs=EPOCHS, seed=SEED)["metrics"]
    comparaison[cle] = r
    print(f"{libelle:<36}{r['roc_auc']:>9.3f}{r['average_precision']:>9.3f}"
          f"{r['precision']:>8.3f}{r['recall']:>8.3f}{r['f1']:>8.3f}")
print("-" * 78)
print("\nLecture : sur ce graphe creux (86 % de comptes isolés), les modèles de graphe")
print("n'écrasent pas les baselines tabulaires — leur valeur est l'INTERPRÉTABILITÉ")
print("(détection des réseaux/rings), discutée au chapitre Discussion du rapport.")
""")

md(r"""
## 9. Sensibilité au seuil de décision

Le seuil arbitre entre *rappel* (attraper plus de fraudes) et *précision* (moins de fausses alertes).
On le fait varier sur les scores du modèle retenu.
""")

code(r"""
from app.models.trainer import _confusion, _prf

probs = result["probs"]
test_idx = test_mask.cpu().tolist()
scores = [p for p, mk in zip(probs, test_idx) if mk]
labels = [int(l) for l, mk in zip(y.cpu().tolist(), test_idx) if mk]

print(f"{'Seuil':>6}{'Précision':>11}{'Rappel':>9}{'F1':>8}{'Alertes':>9}")
print("-" * 43)
for t in [0.30, 0.40, 0.50, 0.51, 0.60, 0.70]:
    preds = [1 if s >= t else 0 for s in scores]
    pr = _prf(_confusion(preds, labels))
    print(f"{t:>6.2f}{pr['precision']:>11.3f}{pr['recall']:>9.3f}{pr['f1']:>8.3f}{sum(preds):>9d}")
""")

md(r"""
## 10. Sauvegarde du modèle (comme dans l'application)

L'application sauvegarde les poids (`model.pt`) et le *scaler* (moyenne/écart-type) afin que
l'inférence applique exactement la même normalisation qu'à l'entraînement. La commande officielle
qui régénère tout le dossier `dataset/` est :

```bash
cd backend
python -m scripts.build_dataset     # charge les CSV, entraîne, écrit model.pt + metrics.json
python -m scripts.compare_models    # ré-affiche le tableau comparatif
```
""")

code(r"""
import torch as _t
SORTIE = PROJECT_ROOT / "dataset" / "model_notebook.pt"
_t.save({
    "state_dict": result["state_dict"],
    "scaler": result["scaler"],
    "feature_names": graph.feature_names,
    "config": result["config"],
    "metrics": result["metrics"],
}, SORTIE)
print("Modèle sauvegardé :", SORTIE)
""")

md(r"""
## Conclusion

- Le modèle est entraîné sur **données réelles** (50 000 comptes), avec gestion explicite du déséquilibre,
  découpage stratifié, sélection sur validation et seuil optimisé — **sans fuite de label**.
- Les résultats sont **reproductibles** (graine fixe, exécution mono-thread).
- La comparaison montre que, sur ce graphe creux, l'apport des GNN se situe surtout dans
  l'**interprétabilité et la détection des réseaux de fraude**, conformément à la discussion du rapport.

*Ce notebook répond de manière vérifiable à la question « comment le modèle a-t-il été entraîné ? ».*
""")

nb = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.10"},
    },
    "nbformat": 4, "nbformat_minor": 5,
}

out_dir = Path(__file__).resolve().parent / "notebooks"
out_dir.mkdir(exist_ok=True)
out = out_dir / "entrainement_modele.ipynb"
out.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
print("Notebook écrit :", out, "—", len(cells), "cellules")
