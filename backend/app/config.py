"""Central configuration for the GraphGuard backend."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent       # .../backend
PROJECT_ROOT = BASE_DIR.parent                          # .../GraphGuard-PFE

# Everything the model produces (data + weights + metrics) lives here.
DATASET_DIR = PROJECT_ROOT / "dataset"
DATASET_DIR.mkdir(exist_ok=True)
ARTIFACTS_DIR = DATASET_DIR                              # backward-compat alias

# --- Source data the user provides (READ-ONLY, never overwritten) ---
PROFILES_CSV = DATASET_DIR / "account_profiles.csv"     # accounts + label
EDGES_CSV = DATASET_DIR / "network_edges.csv"           # shared-identity links

# --- Files the model writes (safe names that never clash with source data) ---
MODEL_PATH = DATASET_DIR / "model.pt"                   # trained GNN weights
STATE_PATH = DATASET_DIR / "state.json"                 # graph + scores + metrics
SCORES_CSV = DATASET_DIR / "account_scores.csv"         # predictions output
METRICS_JSON = DATASET_DIR / "metrics.json"             # evaluation summary

# default graph generation parameters
# A larger graph gives a bigger fraud test fold, so metrics are stable run-to-run.
DEFAULT_GRAPH = {
    "n_accounts": 2200,
    "n_legit_tx": 8000,
    "n_fraud_rings": 26,
    "seed": 42,
}

# default training parameters
DEFAULT_TRAIN = {
    "model_name": "graphsage",
    "epochs": 200,
    "lr": 0.01,
    "hidden": 64,
}

APP_NAME = "GraphGuard"
APP_VERSION = "1.0.0"
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173",
                "http://localhost:4173", "http://localhost:3000"]
