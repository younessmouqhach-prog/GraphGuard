# 🛡️ GraphGuard — Intelligent Graph-Based Financial Fraud Detection

> **Master's thesis project — Finance & Data Science**
> *Mémoire de fin d'études — Master Finance & Data Science*
>
> Détection intelligente de fraude financière organisée à l'aide de réseaux de
> neurones sur graphes (Graph Neural Networks).

GraphGuard models financial transactions as a **graph** (accounts = nodes,
transfers = edges) and uses a **Graph Neural Network** (GraphSAGE / GAT) to
detect *organised* fraud — money-laundering rings that rule-based engines miss
because they only score transactions in isolation.

---

## ✨ Features / Fonctionnalités

| | |
|---|---|
| 🧠 **GNN model** | GraphSAGE + GAT implemented in pure PyTorch (no heavy deps) + optional PyTorch Geometric variant |
| 🕸️ **Graph generator** | Synthetic AML transaction network with realistic fraud patterns (fan-out / fan-in / laundering cycles) |
| 📊 **Interactive UI** | Bilingual (🇫🇷/🇬🇧) React dashboard: force-directed graph explorer, ranked alerts, live metrics |
| 🔍 **Explainability** | Per-account risk explanation (top anomalous factors, ring membership, connected accounts) |
| ⚖️ **Imbalance-aware** | Class-weighted training, evaluated with fraud-appropriate metrics (PR-AUC, recall, F1) |
| 🔌 **REST API** | FastAPI backend with auto-generated OpenAPI docs |

---

## 🏗️ Architecture

```
┌─────────────────────────┐         REST / JSON          ┌──────────────────────────┐
│   Frontend (React TS)   │  ───────────────────────►    │   Backend (FastAPI)      │
│  Vite · Tailwind · i18n │  ◄───────────────────────    │                          │
│                         │                              │  ┌────────────────────┐  │
│  • Dashboard            │                              │  │ Graph generator     │  │
│  • Graph Explorer       │                              │  │ (synthetic AML)     │  │
│  • Alerts table         │                              │  └─────────┬──────────┘  │
│  • Model & Metrics      │                              │            ▼             │
│  • About                │                              │  ┌────────────────────┐  │
└─────────────────────────┘                              │  │ GNN (GraphSAGE/GAT)│  │
                                                         │  │ PyTorch            │  │
                                                         │  └─────────┬──────────┘  │
                                                         │            ▼             │
                                                         │  ┌────────────────────┐  │
                                                         │  │ Scoring · alerts · │  │
                                                         │  │ explanations       │  │
                                                         │  └────────────────────┘  │
                                                         └──────────────────────────┘
```

---

## 🚀 Quick start / Démarrage rapide

### 1. Backend (Python ≥ 3.10)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
# PyTorch (CPU) on Windows, if not already installed:
pip install torch --index-url https://download.pytorch.org/whl/cpu

uvicorn app.main:app --reload --port 8000
```

On first launch the API **auto-generates a graph and trains the model**, so the
UI immediately has data. Swagger docs: <http://127.0.0.1:8000/docs>

> 🇫🇷 Au premier démarrage, l'API génère automatiquement un graphe et entraîne
> le modèle ; l'interface dispose donc immédiatement de données.

### 2. Frontend (Node ≥ 18)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5180>. The dev server proxies `/api` to the backend.

---

## 🧪 Train from the command line / Entraînement en ligne de commande

```bash
cd backend
python -m scripts.train_model --model graphsage --epochs 200
python -m scripts.train_model --model gat --rings 20 --accounts 1500
```

Prints ROC-AUC, PR-AUC, precision, recall, F1 and the confusion matrix on the
held-out test fold.

---

## 📡 API reference / Référence API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/status` | Service status + summary KPIs |
| `POST` | `/api/generate` | Regenerate the transaction graph |
| `GET`  | `/api/graph` | Graph slice for visualisation (`max_nodes`, `only_suspicious`, `focus`) |
| `GET`  | `/api/alerts` | Accounts ranked by fraud score (`limit`, `min_score`) |
| `GET`  | `/api/metrics` | Full evaluation metrics + training history |
| `GET`  | `/api/account/{id}` | Per-account explanation |
| `GET`  | `/api/rings` | Detected fraud-ring summary |

All endpoints accept `?lang=fr` or `?lang=en` for localised messages.

---

## 📁 Project structure / Structure du projet

```
GraphGuard-PFE/
├── backend/
│   ├── app/
│   │   ├── data/generator.py     # synthetic AML graph
│   │   ├── models/gnn.py         # GraphSAGE + GAT (pure PyTorch)
│   │   ├── models/gnn_pyg.py     # optional PyTorch Geometric variant
│   │   ├── models/trainer.py     # training + metrics
│   │   ├── services/store.py     # state, scoring, explanations
│   │   ├── api/routes.py         # REST endpoints
│   │   └── main.py               # FastAPI app
│   ├── scripts/train_model.py    # CLI trainer
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/                # Dashboard, GraphExplorer, Alerts, Metrics, About
        ├── components/           # Layout, StatCard, RiskBadge, …
        ├── i18n/                 # FR / EN dictionary
        └── api/client.ts         # typed API client

```

---

## 💼 Business model / Modèle économique

- **SaaS B2B** for banks, payment service providers and fintechs
- **Volume-based billing** (per transaction analysed)
- **Anti-fraud audit** & regulatory compliance reporting (AML / LCB-FT)

---

## 📦 Deliverables / Livrables

1. ✅ **GNN model** — `backend/app/models/`
2. ✅ **Visualisation interface** — `frontend/`
3. ✅ **Scientific report** — [`docs/RAPPORT_SCIENTIFIQUE.md`](docs/RAPPORT_SCIENTIFIQUE.md)

---

## 📊 Data

GraphGuard trains on the **real labelled dataset** placed in `dataset/`:

| File | What it is |
|------|-----------|
| `account_profiles.csv` | 50,000 accounts + the `is_fraudster` label (26.7 % fraud) |
| `network_edges.csv` | 7,411 shared-identity links (phone/email/IP/device) in 200 rings — **the graph** |
| `transactions.csv` | 1,000,000 labelled transactions (reference) |

The loader (`app/data/loader.py`) builds the graph from these files and
**excludes leakage columns** (`fraud_count`, `fraud_amount`, `fraud_rate`).
Model outputs are written next to the data with safe names
(`account_scores.csv`, `model.pt`, `state.json`, `metrics.json`) — the source
CSVs are never overwritten.

Rebuild everything with:

```bash
cd backend
python -m scripts.build_dataset
```

> A **synthetic generator** (`app/data/generator.py`, AMLSim/Elliptic-style) is
> also included as a controlled testbed and as a fallback when the real CSV is
> absent.

**Measured results (real data, held-out test set):** GraphSAGE — ROC-AUC 0.85,
PR-AUC 0.72, recall 0.72, F1 0.64.

---

## 📜 License

Academic / educational use — Master's thesis project, 2026.
