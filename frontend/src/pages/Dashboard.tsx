import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  ArrowLeftRight,
  Flag,
  Network,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { api, type Alert, type RingInfo } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import RiskBadge from "../components/RiskBadge";
import Loader, { ErrorBanner } from "../components/Loader";
import { ringLabel, ringKindLabel } from "../lib/format";

const BAND_COLORS: Record<string, string> = {
  critical: "#fb7185",
  high: "#fb923c",
  medium: "#fbbf24",
  low: "#34d399",
};

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { status, offline, refreshKey } = useApp();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rings, setRings] = useState<RingInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.alerts(lang, 8), api.rings(lang)])
      .then(([a, r]) => {
        if (!active) return;
        setAlerts(a.alerts);
        setRings(r.rings.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, refreshKey]);

  // risk distribution over ALL accounts (computed server-side, honest counts)
  const dist = useMemo(() => {
    const rb = status?.summary?.risk_bands;
    return (["critical", "high", "medium", "low"] as const).map((b) => ({
      band: t.risk[b],
      count: rb?.[b] ?? 0,
      key: b,
    }));
  }, [status, t]);

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;
  const s = status?.summary;

  return (
    <div>
      <PageHeader title={t.dashboard.title} subtitle={t.dashboard.subtitle} />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t.dashboard.accounts}
          value={s?.n_accounts?.toLocaleString() ?? "—"}
          icon={<Users className="h-5 w-5" />}
          accent="brand"
          to="/alerts"
        />
        <StatCard
          label={t.dashboard.transactions}
          value={s?.n_transactions?.toLocaleString() ?? "—"}
          icon={<ArrowLeftRight className="h-5 w-5" />}
          accent="accent"
          to="/graph"
        />
        <StatCard
          label={t.dashboard.flagged}
          value={s?.flagged_accounts?.toLocaleString() ?? "—"}
          hint={s ? `${(s.fraud_ratio * 100).toFixed(1)}% ${t.dashboard.fraudRatio}` : ""}
          icon={<Flag className="h-5 w-5" />}
          accent="rose"
          to="/alerts"
        />
        <StatCard
          label={t.dashboard.rings}
          value={s?.n_rings ?? "—"}
          icon={<Network className="h-5 w-5" />}
          accent="amber"
          to="/leaderboard"
        />
      </div>

      {/* Detection quality */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { k: t.dashboard.rocAuc, v: s?.roc_auc },
          { k: t.dashboard.avgPrecision, v: s?.average_precision },
          { k: t.dashboard.recall, v: s?.recall },
          { k: t.dashboard.f1, v: s?.f1 },
        ].map((m) => (
          <Link key={m.k} to="/metrics" className="card card-hover block p-4">
            <div className="label">{m.k}</div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-xl font-bold text-fg tabular-nums">
                {m.v != null ? m.v.toFixed(3) : "—"}
              </span>
              <div className="mb-1 h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                <div
                  className="h-full rounded-full bg-accent-500"
                  style={{ width: `${(m.v ?? 0) * 100}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top alerts */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-fg">{t.dashboard.topAlerts}</h2>
            <Link
              to="/alerts"
              className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
            >
              {t.dashboard.viewAll} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {loading ? (
            <Loader />
          ) : (
            <div className="space-y-1.5">
              {alerts.map((a) => (
                <Link
                  to={`/graph?focus=${a.id}`}
                  key={a.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-line/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-slate-300">{a.id}</span>
                    {a.ring && (
                      <span className="chip bg-accent-500/10 text-accent-300">
                        {ringLabel(a.ring, t)}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{a.country}</span>
                  </div>
                  <RiskBadge score={a.score} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Risk distribution */}
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-fg">{t.dashboard.riskDistribution}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dist as any}>
              <XAxis dataKey="band" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.06)" }}
                contentStyle={{
                  background: "#0e1014",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                  fontSize: 12,
                }}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {(dist as any[]).map((d, i) => (
                  <Cell key={i} fill={BAND_COLORS[d.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ring exposure */}
      <div className="mt-4 card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-fg">{t.dashboard.ringExposure}</h2>
          <Link
            to="/leaderboard"
            className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            {t.dashboard.viewAll} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rings.map((r) => (
            <Link
              to={`/graph?ring=${r.ring}`}
              key={r.ring}
              className="rounded-xl border border-line/5 bg-ink-800/50 p-4 transition-colors hover:border-accent-500/40 hover:bg-ink-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200">
                  {ringKindLabel(r.kind, t)}
                  {r.number ? ` #${r.number}` : ""}
                </span>
                <span className="chip bg-accent-500/10 text-accent-300">
                  {r.size} {t.dashboard.accounts.toLowerCase()}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-fg">
                    {(r.detected * 100).toFixed(0)}%
                  </div>
                  <div className="text-[11px] text-slate-500">{t.dashboard.ringDetected}</div>
                </div>
                <div className="h-12 w-12 shrink-0">
                  <RingDial value={r.detected} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function RingDial({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#21242c" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="url(#dialgrad)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
      />
      <defs>
        <linearGradient id="dialgrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b93f8" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
    </svg>
  );
}
