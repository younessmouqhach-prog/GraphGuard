"""Pydantic request/response schemas for the REST API."""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GraphConfig(BaseModel):
    n_accounts: int = Field(1200, ge=100, le=8000)
    n_legit_tx: int = Field(4500, ge=200, le=40000)
    n_fraud_rings: int = Field(14, ge=1, le=80)
    seed: int = 42


class TrainConfig(BaseModel):
    model_name: str = Field("graphsage", pattern="^(graphsage|gat)$")
    epochs: int = Field(200, ge=20, le=1000)
    lr: float = Field(0.01, gt=0, le=1.0)
    hidden: int = Field(64, ge=8, le=256)


class PredictRequest(BaseModel):
    account_age_days: float = 365
    credit_limit: float = 5000
    risk_score: float = 20
    is_high_risk: float = 0
    avg_txn_amount: float = 100
    avg_monthly_txns: float = 20
    has_2fa: float = 1
    account_type: str = "personal"
    total_transactions: float = 50
    total_amount: float = 5000
    avg_amount: float = 120
    max_amount: float = 500
    pct_foreign: float = 0.1
    avg_velocity: float = 1.5
    unique_countries: float = 2
    unique_categories: float = 5
    avg_ip_risk: float = 20
    network_degree: float = 0


class NodeOut(BaseModel):
    id: str
    index: int
    label: int
    score: float
    country: str
    in_degree: int
    out_degree: int
    total_received: float
    total_sent: float


class EdgeOut(BaseModel):
    id: str
    source: str
    target: str
    amount: float
    kind: str


class GraphResponse(BaseModel):
    nodes: List[NodeOut]
    edges: List[EdgeOut]
    message: str


class AlertOut(BaseModel):
    id: str
    score: float
    label: int
    risk: str
    country: str
    in_degree: int
    out_degree: int
    total_received: float
    total_sent: float
    ring: Optional[str] = None


class StatusResponse(BaseModel):
    graph_ready: bool
    model_trained: bool
    app: str
    version: str
    summary: Optional[Dict[str, Any]] = None


class ExplanationResponse(BaseModel):
    id: str
    score: float
    label: int
    risk: str
    top_features: List[Dict[str, Any]]
    neighbors: List[Dict[str, Any]]
    ring: Optional[str] = None
    narrative: str
