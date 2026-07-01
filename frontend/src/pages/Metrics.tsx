import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { api, type Metrics as M } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import Loader, { ErrorBanner } from "../components/Loader";

const tooltipStyle = {
  background: "#0e1014",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  color: "#e2e8f0",
  fontSize: 12,
};

export default function Metrics() {
  const { t, lang } = useI18n();
  const { offline, refreshKey } = useApp();
  const [m, setM] = useState<M | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .metrics(lang)
      .then((d) => active && setM(d))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, refreshKey]);

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;
  if (loading) return <Loader />;
  if (!m) return <ErrorBanner message={t.common.noData} />;

  const c = m.confusion;
  const cells = [
    { label: t.metrics.tn, value: c.tn, tone: "emerald" },
    { label: t.metrics.fp, value: c.fp, tone: "amber" },
    { label: t.metrics.fn, value: c.fn, tone: "rose" },
    { label: t.metrics.tp, value: c.tp, tone: "brand" },
  ];
  const toneBg: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    brand: "bg-brand-500/10 text-brand-300 ring-brand-500/20",
  };

  return (
    <div>
      <PageHeader
        title={t.metrics.title}
        subtitle={t.metrics.subtitle}
        right={
          <span className="chip bg-accent-500/10 text-accent-300 ring-1 ring-accent-500/30">
            {t.metrics.model}: {m.model.toUpperCase()}
          </span>
        }
      />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { k: "ROC-AUC", v: m.roc_auc },
          { k: "PR-AUC", v: m.average_precision },
          { k: t.dashboard.recall, v: m.recall },
          { k: "Precision", v: m.precision },
          { k: "F1", v: m.f1 },
        ].map((x) => (
          <div key={x.k} className="card p-4 text-center">
            <div className="label">{x.k}</div>
            <div className="mt-2 text-2xl font-semibold text-fg tabular-nums">
              {x.v.toFixed(3)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Training curve */}
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-fg">{t.metrics.trainingCurve}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={m.history}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="epoch" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} domain={[0, 1]} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ stroke: "rgba(255,255,255,0.15)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="val_auc"
                name="ROC-AUC"
                stroke="#8b93f8"
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="val_ap"
                name="PR-AUC"
                stroke="#34d399"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* PR curve */}
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-fg">{t.metrics.prCurve}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={m.pr_curve}>
              <defs>
                <linearGradient id="prFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="1" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="recall"
                type="number"
                domain={[0, 1]}
                tick={{ fill: "#64748b", fontSize: 11 }}
                label={{ value: t.dashboard.recall, fill: "#64748b", fontSize: 11, dy: 12 }}
              />
              <YAxis
                dataKey="precision"
                domain={[0, 1]}
                tick={{ fill: "#64748b", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8" }}
                cursor={{ stroke: "rgba(255,255,255,0.15)" }}
              />
              <Area
                type="monotone"
                dataKey="precision"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#prFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Confusion matrix */}
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-fg">{t.metrics.confusion}</h2>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <span className="-rotate-90 whitespace-nowrap text-[11px] uppercase tracking-wider text-slate-500">
                {t.metrics.actual}
              </span>
            </div>
            <div className="flex-1">
              <div className="mb-2 grid grid-cols-2 gap-2 pl-16 text-center text-[11px] text-slate-500">
                <span>{t.metrics.legitClass}</span>
                <span>{t.metrics.fraudClass}</span>
              </div>
              <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                <span className="text-right text-[11px] text-slate-500">
                  {t.metrics.legitClass}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <ConfCell {...cells[0]} cls={toneBg.emerald} />
                  <ConfCell {...cells[1]} cls={toneBg.amber} />
                </div>
                <span className="text-right text-[11px] text-slate-500">
                  {t.metrics.fraudClass}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <ConfCell {...cells[2]} cls={toneBg.rose} />
                  <ConfCell {...cells[3]} cls={toneBg.brand} />
                </div>
              </div>
              <div className="mt-2 text-center text-[11px] uppercase tracking-wider text-slate-500">
                {t.metrics.predicted}
              </div>
            </div>
          </div>
        </div>

        {/* Config */}
        <div className="card p-5">
          <h2 className="mb-4 font-bold text-fg">{t.metrics.hyperparams}</h2>
          <dl className="space-y-3 text-sm">
            <Row k={t.metrics.model} v={m.model.toUpperCase()} />
            <Row k={t.metrics.threshold} v={m.threshold.toFixed(3)} />
            <Row k={t.metrics.bestEpoch} v={String(m.best_epoch)} />
            <Row k="Nodes / Edges" v={`${m.n_nodes} / ${m.n_edges}`} />
            <Row
              k={t.dashboard.fraudRatio}
              v={`${m.n_fraud} (${(m.fraud_ratio * 100).toFixed(1)}%)`}
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ConfCell({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl p-4 text-center ring-1 ${cls}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] opacity-80">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/5 pb-2">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-mono text-slate-200">{v}</dd>
    </div>
  );
}
