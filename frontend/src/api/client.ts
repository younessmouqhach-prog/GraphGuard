// Typed API client for the GraphGuard backend.

export interface Summary {
  n_accounts: number;
  n_transactions: number;
  n_fraud_accounts: number;
  n_rings: number;
  fraud_ratio: number;
  flagged_accounts?: number;
  roc_auc?: number;
  average_precision?: number;
  recall?: number;
  f1?: number;
  risk_bands?: { critical: number; high: number; medium: number; low: number };
  total_fraud_amount?: number;
  caught_fraud_amount?: number;
  amount_recovery?: number;
}

export interface Status {
  graph_ready: boolean;
  model_trained: boolean;
  app: string;
  version: string;
  summary?: Summary;
}

export interface GraphNode {
  id: string;
  index: number;
  label: number;
  score: number;
  country: string;
  in_degree: number;
  out_degree: number;
  total_received: number;
  total_sent: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  amount: number;
  kind: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Alert {
  id: string;
  score: number;
  label: number;
  risk: string;
  country: string;
  in_degree: number;
  out_degree: number;
  total_received: number;
  total_sent: number;
  ring?: string | null;
}

export interface Metrics {
  model: string;
  roc_auc: number;
  average_precision: number;
  precision: number;
  recall: number;
  f1: number;
  threshold: number;
  confusion: { tp: number; tn: number; fp: number; fn: number };
  best_epoch: number;
  n_nodes: number;
  n_edges: number;
  n_fraud: number;
  fraud_ratio: number;
  pr_curve: { recall: number; precision: number }[];
  history: { epoch: number; loss: number; val_auc: number; val_ap: number }[];
  feature_names: string[];
}

export interface Explanation {
  id: string;
  score: number;
  label: number;
  risk: string;
  top_features: { feature: string; value: number; z_score: number }[];
  neighbors: {
    id: string;
    direction: string;
    amount: number;
    kind: string;
    score: number;
  }[];
  ring?: string | null;
  narrative: string;
}

export interface RingDetail {
  ring: string;
  size: number;
  n_fraud: number;
  n_flagged: number;
  detected: number;
  avg_score: number;
  types: Record<string, number>;
  members: { id: string; score: number; label: number; risk: string }[];
}

export interface RingInfo {
  ring: string;
  number: string;
  kind: string;
  primary_type: string;
  types: Record<string, number>;
  size: number;
  n_fraud: number;
  amount: number;
  accounts: string[];
  avg_score: number;
  detected: number;
}

export interface Prediction {
  fraud_probability: number;
  risk: string;
  prediction: number;
  threshold: number;
  top_factors: { feature: string; value: number; z_score: number }[];
}

export type AccountInput = {
  account_age_days: number;
  credit_limit: number;
  risk_score: number;
  is_high_risk: number;
  avg_txn_amount: number;
  avg_monthly_txns: number;
  has_2fa: number;
  account_type: string;
  total_transactions: number;
  total_amount: number;
  avg_amount: number;
  max_amount: number;
  pct_foreign: number;
  avg_velocity: number;
  unique_countries: number;
  unique_categories: number;
  avg_ip_risk: number;
  network_degree: number;
};

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

export const api = {
  status: (lang: string) => req<Status>(`/status?lang=${lang}`),
  graph: (
    lang: string,
    maxNodes = 350,
    onlySuspicious = false,
    focus?: string,
    ring?: string
  ) =>
    req<GraphData>(
      `/graph?lang=${lang}&max_nodes=${maxNodes}&only_suspicious=${onlySuspicious}` +
        (focus ? `&focus=${focus}` : "") +
        (ring ? `&ring=${ring}` : "")
    ),
  alerts: (lang: string, limit = 200, minScore = 0, maxScore = 1.01) =>
    req<{ alerts: Alert[] }>(
      `/alerts?lang=${lang}&limit=${limit}&min_score=${minScore}&max_score=${maxScore}`
    ),
  metrics: (lang: string) => req<Metrics>(`/metrics?lang=${lang}`),
  account: (id: string, lang: string) =>
    req<Explanation>(`/account/${id}?lang=${lang}`),
  rings: (lang: string) => req<{ rings: RingInfo[] }>(`/rings?lang=${lang}`),
  ring: (id: string, lang: string) => req<RingDetail>(`/ring/${id}?lang=${lang}`),
  predict: (lang: string, body: AccountInput) =>
    req<Prediction>(`/predict?lang=${lang}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sample: (lang: string, fraud: number) =>
    req<Record<string, any>>(`/sample?lang=${lang}&fraud=${fraud}`),
  train: (lang: string, body: object) =>
    req<{ message: string; metrics: Metrics; summary: Summary }>(
      `/train?lang=${lang}`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  generate: (lang: string, body: object) =>
    req<{ message: string; summary: Summary }>(`/generate?lang=${lang}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
