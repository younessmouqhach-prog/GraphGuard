import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight } from "lucide-react";
import { api, type RingInfo } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import Loader, { ErrorBanner } from "../components/Loader";
import { ringKindLabel } from "../lib/format";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const RANK = ["#fbbf24", "#cbd5e1", "#d97706"]; // gold / silver / bronze

function detColor(d: number) {
  if (d >= 0.8) return { bar: "bg-emerald-500/80", text: "text-emerald-50" };
  if (d >= 0.5) return { bar: "bg-amber-500/80", text: "text-amber-50" };
  return { bar: "bg-rose-500/80", text: "text-rose-50" };
}

export default function Leaderboard() {
  const { t, lang } = useI18n();
  const { offline, refreshKey, status } = useApp();
  const navigate = useNavigate();
  const [rings, setRings] = useState<RingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [order, setOrder] = useState<"most" | "least">("most");
  const [rankBy, setRankBy] = useState<
    "amount" | "avg_score" | "n_fraud" | "detected" | "size"
  >("amount");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .rings(lang)
      .then((r) => active && setRings(r.rings))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, refreshKey]);

  const sorted = useMemo(() => {
    const dir = order === "most" ? -1 : 1;
    return [...rings].sort((a, b) => ((a[rankBy] as number) - (b[rankBy] as number)) * dir);
  }, [rings, order, rankBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRings = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // reset to first page when the ranking/size changes
  useEffect(() => {
    setPage(0);
  }, [rankBy, order, pageSize]);

  const totals = useMemo(() => {
    const members = sorted.reduce((s, r) => s + r.size, 0);
    const fraud = sorted.reduce((s, r) => s + r.n_fraud, 0);
    const amount = sorted.reduce((s, r) => s + r.amount, 0);
    const det = sorted.length
      ? sorted.reduce((s, r) => s + r.detected, 0) / sorted.length
      : 0;
    return { members, fraud, amount, det };
  }, [sorted]);

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;

  const sm = status?.summary;

  return (
    <div>
      <PageHeader
        title={t.leaderboard.title}
        subtitle={t.leaderboard.subtitle}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="label">{t.leaderboard.rankBy}</span>
              <select
                value={rankBy}
                onChange={(e) => setRankBy(e.target.value as any)}
                className="rounded-lg border border-line/10 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500/60"
              >
                <option value="amount" className="bg-ink-900">{t.leaderboard.amountLost}</option>
                <option value="avg_score" className="bg-ink-900">{t.ringsPage.avgRisk}</option>
                <option value="n_fraud" className="bg-ink-900">{t.graph.confirmedFraud}</option>
                <option value="detected" className="bg-ink-900">{t.leaderboard.detection}</option>
                <option value="size" className="bg-ink-900">{t.leaderboard.members}</option>
              </select>
            </label>
            <div className="flex items-center rounded-lg border border-line/10 bg-ink-800 p-0.5 text-2xs font-semibold">
              {(["most", "least"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrder(o)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
                    order === o ? "bg-line/10 text-fg" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {o === "most" ? (
                    <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                  )}
                  {o === "most" ? t.leaderboard.most : t.leaderboard.least}
                </button>
              ))}
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-line/10 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500/60"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n} className="bg-ink-900">
                  {n} / {t.leaderboard.perPage}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading ? (
        <Loader />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Leaderboard table */}
          <div className="card overflow-hidden lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line/[0.07] text-left text-2xs uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">{t.leaderboard.rank}</th>
                    <th className="px-4 py-3">{t.ringsPage.ring}</th>
                    <th className="px-4 py-3">{t.leaderboard.type}</th>
                    <th className="px-4 py-3 text-right">{t.leaderboard.members}</th>
                    <th className="px-4 py-3 text-right">{t.graph.confirmedFraud}</th>
                    <th className="px-4 py-3 text-right">{t.leaderboard.amountLost}</th>
                    <th className="px-4 py-3 text-right">{t.leaderboard.detection}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRings.map((r, i) => {
                    const c = detColor(r.detected);
                    const rank = safePage * pageSize + i + 1;
                    return (
                      <tr
                        key={r.ring}
                        onClick={() => navigate(`/graph?ring=${r.ring}`)}
                        className="group cursor-pointer border-b border-line/[0.05] transition-colors hover:bg-line/[0.04]"
                        title={t.ringsPage.openInGraph}
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className="grid h-6 w-6 place-items-center rounded-full text-2xs font-bold"
                            style={
                              rank <= 3
                                ? { background: RANK[rank - 1], color: "#0a0b0e" }
                                : { color: "#64748b" }
                            }
                          >
                            {rank}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-200">{r.ring}</td>
                        <td className="px-4 py-2.5">
                          <span className="chip bg-accent-500/10 text-accent-300">
                            {ringKindLabel(r.primary_type, t)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                          {r.size}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-rose-300">
                          {r.n_fraud}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-fg">
                          {fmtMoney(r.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div
                            className={`relative ml-auto flex h-6 w-20 items-center justify-end overflow-hidden rounded-md ${c.bar}`}
                          >
                            <span
                              className={`relative z-10 pr-2 text-2xs font-bold ${c.text}`}
                            >
                              {(r.detected * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ChevronRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-accent-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line/10 bg-ink-800/40 text-2xs uppercase tracking-wider text-slate-400">
                    <td className="px-4 py-3" colSpan={3}>
                      {t.leaderboard.total}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                      {totals.members}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300">
                      {totals.fraud}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-fg">
                      {fmtMoney(totals.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                      {(totals.det * 100).toFixed(0)}%
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/[0.07] px-4 py-3 text-xs text-slate-400">
              <span>
                {t.alerts.showing}{" "}
                <b className="text-slate-300">
                  {sorted.length === 0 ? 0 : safePage * pageSize + 1}–
                  {Math.min(sorted.length, (safePage + 1) * pageSize)}
                </b>{" "}
                {t.alerts.of} {sorted.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="btn-ghost px-2 py-1 text-2xs disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t.leaderboard.prev}
                </button>
                <span className="px-1 font-mono text-slate-300">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="btn-ghost px-2 py-1 text-2xs disabled:opacity-40"
                >
                  {t.leaderboard.next}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Side panels */}
          <div className="space-y-4">
            <div className="card p-6">
              <div className="label">{t.leaderboard.totalLosses}</div>
              <div className="mt-1 text-xs text-slate-500">{t.leaderboard.totalLossesSub}</div>
              <div className="mt-3 text-4xl font-extrabold tracking-tight text-fg">
                {sm?.total_fraud_amount != null ? fmtMoney(sm.total_fraud_amount) : "—"}
              </div>
            </div>

            <div className="card flex flex-col items-center p-6">
              <div className="self-start label">{t.leaderboard.recovered}</div>
              <div className="self-start text-xs text-slate-500">
                {t.leaderboard.recoveredSub}
              </div>
              <Gauge value={sm?.amount_recovery ?? 0} color="#34d399" />
            </div>

            <div className="card flex flex-col items-center p-6">
              <div className="self-start label">{t.leaderboard.fraudCaught}</div>
              <div className="self-start text-xs text-slate-500">
                {t.leaderboard.fraudCaughtSub}
              </div>
              <Gauge value={sm?.recall ?? 0} color="#6366f1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Gauge({ value, color }: { value: number; color: string }) {
  const r = 56;
  const C = 2 * Math.PI * r;
  const sweep = 0.75; // 270° gauge with a gap at the bottom
  return (
    <div className="relative mt-3 h-36 w-36">
      <svg viewBox="0 0 140 140" className="h-full w-full">
        <g transform="rotate(135 70 70)">
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="#21242c"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${C * sweep} ${C}`}
          />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${C * sweep * value} ${C}`}
          />
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-3xl font-bold tabular-nums text-fg">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
