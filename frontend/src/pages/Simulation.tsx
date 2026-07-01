import { useEffect, useState, useCallback } from "react";
import { Shuffle, RotateCcw, ShieldAlert, ShieldCheck, User, Activity, Share2 } from "lucide-react";
import { api, type AccountInput, type Prediction } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import { ErrorBanner } from "../components/Loader";

const DEFAULTS: AccountInput = {
  account_age_days: 365,
  credit_limit: 5000,
  risk_score: 20,
  is_high_risk: 0,
  avg_txn_amount: 100,
  avg_monthly_txns: 20,
  has_2fa: 1,
  account_type: "personal",
  total_transactions: 50,
  total_amount: 5000,
  avg_amount: 120,
  max_amount: 500,
  pct_foreign: 0.1,
  avg_velocity: 1.5,
  unique_countries: 2,
  unique_categories: 5,
  avg_ip_risk: 20,
  network_degree: 0,
};

const GROUPS: {
  key: string;
  icon: any;
  nums: (keyof AccountInput)[];
}[] = [
  {
    key: "groupProfile",
    icon: User,
    nums: ["account_age_days", "credit_limit", "risk_score"],
  },
  {
    key: "groupActivity",
    icon: Activity,
    nums: [
      "avg_txn_amount", "avg_monthly_txns", "total_transactions", "total_amount",
      "avg_amount", "max_amount", "pct_foreign", "avg_velocity",
      "unique_countries", "unique_categories", "avg_ip_risk",
    ],
  },
  { key: "groupNetwork", icon: Share2, nums: ["network_degree"] },
];

function bandColor(p: number) {
  if (p >= 0.75) return "#fb7185";
  if (p >= 0.5) return "#fb923c";
  if (p >= 0.25) return "#fbbf24";
  return "#34d399";
}

export default function Simulation() {
  const { t, lang } = useI18n();
  const { offline } = useApp();
  const [form, setForm] = useState<AccountInput>(DEFAULTS);
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState(false);

  const run = useCallback(
    (f: AccountInput) => {
      api.predict(lang, f).then((r) => { setResult(r); setError(false); }).catch(() => setError(true));
    },
    [lang]
  );

  useEffect(() => {
    const id = setTimeout(() => run(form), 250);
    return () => clearTimeout(id);
  }, [form, run]);

  const set = (k: keyof AccountInput, v: number | string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const loadSample = async (fraud: number) => {
    try {
      const s = await api.sample(lang, fraud);
      setForm({ ...DEFAULTS, ...s, network_degree: 0 });
    } catch { /* ignore */ }
  };

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;

  const fields = t.sim.fields as Record<string, string>;
  const featLabels = t.features as Record<string, string>;
  const groupTitles = t.sim as any;
  const p = result?.fraud_probability ?? 0;
  const isFraud = result?.prediction === 1;

  return (
    <div>
      <PageHeader
        title={t.sim.title}
        subtitle={t.sim.subtitle}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => loadSample(1)} className="btn-ghost">
              <Shuffle className="h-4 w-4" />
              {t.sim.loadFraud}
            </button>
            <button onClick={() => loadSample(0)} className="btn-ghost">
              <Shuffle className="h-4 w-4" />
              {t.sim.loadNormal}
            </button>
            <button onClick={() => setForm(DEFAULTS)} className="btn-ghost">
              <RotateCcw className="h-4 w-4" />
              {t.sim.reset}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Inputs */}
        <div className="space-y-4 lg:col-span-2">
          {GROUPS.map((g) => (
            <div key={g.key} className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent-500/10 text-accent-300">
                  <g.icon className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-semibold text-fg">{groupTitles[g.key]}</h2>
              </div>

              {g.key === "groupProfile" && (
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">{fields.account_type}</span>
                    <select
                      value={form.account_type}
                      onChange={(e) => set("account_type", e.target.value)}
                      className="input mt-1"
                    >
                      <option value="personal" className="bg-ink-900">{t.sim.personal}</option>
                      <option value="business" className="bg-ink-900">{t.sim.business}</option>
                    </select>
                  </label>
                  {(["has_2fa", "is_high_risk"] as (keyof AccountInput)[]).map((k) => {
                    const on = !!form[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => set(k, on ? 0 : 1)}
                        className="mt-auto flex h-[42px] items-center justify-between self-end rounded-lg border border-line/10 bg-ink-800 px-3 text-left"
                      >
                        <span className="label">{fields[k]}</span>
                        <span
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                            on ? "bg-accent-500" : "bg-ink-600"
                          }`}
                        >
                          <span
                            className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                              on ? "left-6" : "left-1"
                            }`}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.nums.map((k) => (
                  <label key={k} className="block">
                    <span className="label">{fields[k]}</span>
                    <input
                      type="number"
                      value={form[k] as number}
                      step="any"
                      onChange={(e) => set(k, e.target.value === "" ? 0 : Number(e.target.value))}
                      className="input mt-1 tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Result (sticky) */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          {error ? (
            <ErrorBanner message={t.common.noData} />
          ) : (
            <div className="space-y-4">
              <div
                className="card flex flex-col items-center p-6"
                style={{ boxShadow: `inset 0 2px 0 0 ${bandColor(p)}66` }}
              >
                <div className="self-start label">{t.sim.probability}</div>
                <Gauge value={p} color={bandColor(p)} />
                <div
                  className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    isFraud ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {isFraud ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {isFraud ? t.sim.verdictFraud : t.sim.verdictLegit}
                </div>
                <div className="mt-2 text-2xs text-slate-500">
                  {t.sim.threshold}: {((result?.threshold ?? 0.5) * 100).toFixed(0)}%
                </div>
              </div>

              <div className="card p-5">
                <div className="label mb-3">{t.sim.topFactors}</div>
                <div className="space-y-2.5">
                  {result?.top_factors.map((f) => {
                    const mag = Math.min(1, Math.abs(f.z_score) / 4);
                    const up = f.z_score >= 0;
                    return (
                      <div key={f.feature}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">{featLabels[f.feature] ?? f.feature}</span>
                          <span className={`flex items-center gap-1 ${up ? "text-rose-300" : "text-emerald-300"}`}>
                            {up ? "↑" : "↓"} {up ? t.sim.raises : t.sim.lowers}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                          <div
                            className={`h-full rounded-full ${up ? "bg-rose-400" : "bg-emerald-400"}`}
                            style={{ width: `${mag * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Gauge({ value, color }: { value: number; color: string }) {
  const r = 56;
  const C = 2 * Math.PI * r;
  const sweep = 0.75;
  return (
    <div className="relative my-2 h-44 w-44">
      <svg viewBox="0 0 140 140" className="h-full w-full">
        <g transform="rotate(135 70 70)">
          <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(var(--ink-700))" strokeWidth="13"
            strokeLinecap="round" strokeDasharray={`${C * sweep} ${C}`} />
          <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="13"
            strokeLinecap="round" strokeDasharray={`${C * sweep * value} ${C}`}
            style={{ transition: "stroke-dasharray 0.45s ease, stroke 0.3s ease" }} />
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums text-fg">{(value * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}
