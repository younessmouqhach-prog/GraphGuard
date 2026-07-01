"""
Synthetic transactional-graph generator with realistic money-laundering patterns.
=================================================================================

FR : Générateur de graphe transactionnel synthétique reproduisant des schémas
     de fraude organisée (smurfing, collecte par comptes mules, cycles de
     blanchiment). Inspiré de la logique d'AMLSim (IBM) mais auto-contenu :
     aucune donnée externe n'est requise.

EN : Synthetic transaction-graph generator reproducing organised-fraud patterns
     (smurfing / fan-out, mule collection / fan-in, laundering cycles).
     Inspired by IBM's AMLSim logic but fully self-contained: no external data.

The generator returns:
  * accounts      : list[dict]   -> node-level features + ground-truth label
  * transactions  : list[dict]   -> directed edges (sender -> receiver)
  * pattern_index : dict         -> which accounts belong to which fraud ring
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

# --------------------------------------------------------------------------- #
# Feature schema (kept in one place so the API, model and UI stay in sync)
# --------------------------------------------------------------------------- #
FEATURE_NAMES: List[str] = [
    "in_degree",            # number of incoming transactions
    "out_degree",           # number of outgoing transactions
    "total_received",       # sum of incoming amounts (log-scaled)
    "total_sent",           # sum of outgoing amounts (log-scaled)
    "mean_amount",          # average transaction amount (log-scaled)
    "amount_std",           # volatility of transaction amounts
    "flow_ratio",           # sent / (received + 1) -> pass-through behaviour
    "distinct_peers",       # number of distinct counterparties
    "velocity",             # transactions per active day
    "night_ratio",          # share of transactions during 0h-6h
    "rapid_movement",       # share of funds moved out < 24h after entry
    "high_risk_geo",        # exposure to high-risk jurisdictions (0..1)
]
NUM_FEATURES = len(FEATURE_NAMES)


@dataclass
class GraphData:
    """Container returned by the generator/loader (framework-agnostic)."""
    accounts: List[dict]
    transactions: List[dict]
    pattern_index: Dict[str, List[int]] = field(default_factory=dict)
    feature_names: List[str] = field(default_factory=lambda: list(FEATURE_NAMES))

    @property
    def num_nodes(self) -> int:
        return len(self.accounts)

    @property
    def num_edges(self) -> int:
        return len(self.transactions)

    @property
    def num_fraud(self) -> int:
        return sum(a["label"] for a in self.accounts)


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
def _amount(rng: random.Random, lo: float, hi: float) -> float:
    """Log-uniform amount so the distribution looks like real transfers."""
    return round(math.exp(rng.uniform(math.log(lo), math.log(hi))), 2)


def _hour(rng: random.Random, nightly: bool = False) -> int:
    return rng.randint(0, 5) if nightly else rng.randint(6, 23)


# --------------------------------------------------------------------------- #
# Main generator
# --------------------------------------------------------------------------- #
def generate_graph(
    n_accounts: int = 1200,
    n_legit_tx: int = 4500,
    n_fraud_rings: int = 14,
    seed: int = 42,
) -> GraphData:
    """Generate a labelled transactional graph.

    The fraud accounts are a small minority (~3-8 %) — a deliberately
    imbalanced setting, exactly as in real anti-money-laundering data.
    """
    rng = random.Random(seed)

    accounts: List[dict] = []
    for i in range(n_accounts):
        accounts.append(
            {
                "id": f"ACC{i:05d}",
                "index": i,
                "label": 0,                       # 0 = legitimate, 1 = fraud
                "country": rng.choice(
                    ["FR", "DE", "ES", "IT", "BE", "NL", "US", "GB"]
                ),
                "opened_days_ago": rng.randint(30, 3000),
                "_raw_tx": [],                    # filled below, removed at end
            }
        )

    transactions: List[dict] = []
    tx_id = 0

    def add_tx(src: int, dst: int, amount: float, hour: int, kind: str) -> None:
        nonlocal tx_id
        tx = {
            "id": f"TX{tx_id:06d}",
            "source": accounts[src]["id"],
            "target": accounts[dst]["id"],
            "source_index": src,
            "target_index": dst,
            "amount": amount,
            "hour": hour,
            "kind": kind,                          # legit | fan_out | fan_in | cycle
        }
        transactions.append(tx)
        accounts[src]["_raw_tx"].append(("out", amount, hour))
        accounts[dst]["_raw_tx"].append(("in", amount, hour))
        tx_id += 1

    # ---- 1a. Legitimate hubs = HARD NEGATIVES.
    # Real networks contain merchants (massive fan-in) and payroll/PSP accounts
    # (massive fan-out). Structurally they resemble fraud rings, so without them
    # the task is trivially separable. They keep the problem realistic.
    merchants = set(rng.sample(range(n_accounts), max(1, int(0.03 * n_accounts))))
    distributors = set(
        rng.sample(
            [i for i in range(n_accounts) if i not in merchants],
            max(1, int(0.015 * n_accounts)),
        )
    )
    for m in merchants:                       # many customers pay one merchant
        for _ in range(rng.randint(10, 30)):
            payer = rng.randrange(n_accounts)
            if payer != m:
                add_tx(payer, m, _amount(rng, 8, 600), _hour(rng), "legit")
    for d in distributors:                    # one payroll account pays many
        for _ in range(rng.randint(10, 25)):
            payee = rng.randrange(n_accounts)
            if payee != d:
                add_tx(d, payee, _amount(rng, 800, 6000), _hour(rng), "legit")

    # ---- 1b. Background legitimate activity (Barabasi-like preferential pick)
    hub_pool: List[int] = list(range(n_accounts))
    for _ in range(n_legit_tx):
        src, dst = rng.sample(hub_pool, 2)
        add_tx(src, dst, _amount(rng, 5, 4000), _hour(rng), "legit")
        # preferential attachment: active nodes become more likely to be picked
        hub_pool.append(src)
        if len(hub_pool) > n_accounts * 6:
            hub_pool = hub_pool[: n_accounts * 3]

    pattern_index: Dict[str, List[int]] = {}

    # ---- 2. Inject organised-fraud rings
    all_mules: List[int] = []

    def pick_mules(k: int) -> List[int]:
        chosen = rng.sample(range(n_accounts), k)
        for c in chosen:
            accounts[c]["label"] = 1
            all_mules.append(c)
            # weak skew towards high-risk geographies / fresh accounts (not a
            # giveaway — many legit accounts share these traits)
            if rng.random() < 0.3:
                accounts[c]["country"] = rng.choice(["US", "GB", "RU", "CY"])
            if rng.random() < 0.3:
                accounts[c]["opened_days_ago"] = rng.randint(5, 200)
        return chosen

    for r in range(n_fraud_rings):
        kind = rng.choice(["fan_out", "fan_in", "cycle"])
        ring_members: List[int] = []

        # rings operate at night only part of the time, and use amounts that
        # OVERLAP legitimate hub activity — so the model cannot rely on a single
        # tell-tale feature (this is what keeps the benchmark realistic).
        nightly = rng.random() < 0.6

        if kind == "fan_out":  # smurfing: one source splits into many mules
            source = pick_mules(1)[0]
            mules = pick_mules(rng.randint(4, 9))
            ring_members = [source] + mules
            big = _amount(rng, 12000, 45000)
            split = big / len(mules)
            for m in mules:
                add_tx(source, m, round(split * rng.uniform(0.7, 1.3), 2),
                       _hour(rng, nightly=nightly), "fan_out")

        elif kind == "fan_in":  # collection: many mules feed one collector
            collector = pick_mules(1)[0]
            mules = pick_mules(rng.randint(4, 9))
            ring_members = [collector] + mules
            for m in mules:
                add_tx(m, collector, _amount(rng, 600, 5000),
                       _hour(rng, nightly=nightly), "fan_in")

        else:  # cycle: layering — money loops back close to its origin
            members = pick_mules(rng.randint(3, 6))
            ring_members = members
            amt = _amount(rng, 8000, 35000)
            for a, b in zip(members, members[1:] + members[:1]):
                amt = round(amt * rng.uniform(0.9, 0.99), 2)  # small "fees"
                add_tx(a, b, amt, _hour(rng, nightly=nightly), "cycle")

        pattern_index[f"ring_{r:02d}_{kind}"] = sorted(set(ring_members))

    # ---- 2b. Blend: mules also conduct ordinary transactions so they are not
    # "ring-only" accounts. This is what makes real mules hard to spot.
    for c in set(all_mules):
        for _ in range(rng.randint(0, 2)):
            other = rng.randrange(n_accounts)
            if other == c:
                continue
            if rng.random() < 0.5:
                add_tx(c, other, _amount(rng, 5, 3000), _hour(rng), "legit")
            else:
                add_tx(other, c, _amount(rng, 5, 3000), _hour(rng), "legit")

    # ---- 3. Materialise node features from the raw transaction lists
    for acc in accounts:
        raw = acc.pop("_raw_tx")
        ins = [a for d, a, _ in raw if d == "in"]
        outs = [a for d, a, _ in raw if d == "out"]
        amounts = ins + outs
        hours = [h for _, _, h in raw]

        in_deg, out_deg = len(ins), len(outs)
        total_in, total_out = sum(ins), sum(outs)
        mean_amt = (sum(amounts) / len(amounts)) if amounts else 0.0
        std_amt = (
            statistics_std(amounts) if len(amounts) > 1 else 0.0
        )
        active_days = max(1, acc["opened_days_ago"] / 30)
        night = sum(1 for h in hours if h < 6)
        flow_ratio = total_out / (total_in + 1.0)
        # "rapid movement" proxy: pass-through accounts move ~everything they get
        rapid = min(1.0, total_out / (total_in + 1.0)) if total_in > 0 else 0.0
        high_risk = 1.0 if acc["country"] in ("RU", "CY", "US", "GB") else 0.0

        acc["features"] = {
            "in_degree": float(in_deg),
            "out_degree": float(out_deg),
            "total_received": math.log1p(total_in),
            "total_sent": math.log1p(total_out),
            "mean_amount": math.log1p(mean_amt),
            "amount_std": math.log1p(std_amt),
            "flow_ratio": float(flow_ratio),
            "distinct_peers": float(in_deg + out_deg),
            "velocity": (in_deg + out_deg) / active_days,
            "night_ratio": (night / len(hours)) if hours else 0.0,
            "rapid_movement": float(rapid),
            "high_risk_geo": high_risk,
        }
        # convenience scalars used directly by the UI / alerts table
        acc["total_received"] = round(total_in, 2)
        acc["total_sent"] = round(total_out, 2)
        acc["in_degree"] = in_deg
        acc["out_degree"] = out_deg

    return GraphData(accounts=accounts, transactions=transactions,
                     pattern_index=pattern_index)


def statistics_std(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return math.sqrt(var)


def to_tensors(graph: GraphData) -> Tuple["list", "list", "list"]:
    """Return (x, edge_index, y) as plain Python lists.

    Kept torch-free here so the generator has zero heavy dependencies; the
    model layer converts these to tensors.  edge_index is [2, E].
    """
    names = graph.feature_names or FEATURE_NAMES
    x = [
        [acc["features"][name] for name in names]
        for acc in graph.accounts
    ]
    src = [t["source_index"] for t in graph.transactions]
    dst = [t["target_index"] for t in graph.transactions]
    edge_index = [src, dst]
    y = [acc["label"] for acc in graph.accounts]
    return x, edge_index, y
