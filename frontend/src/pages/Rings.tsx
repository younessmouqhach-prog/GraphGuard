import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ArrowUp, ArrowDown, Network, Search } from "lucide-react";
import { api, type RingInfo } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import Loader, { ErrorBanner } from "../components/Loader";
import { ringKindLabel } from "../lib/format";

type SortKey = "avg_score" | "detected" | "size" | "ring";
type Det = "all" | "high" | "medium" | "low";

export default function Rings() {
  const { t, lang } = useI18n();
  const { offline, refreshKey } = useApp();
  const navigate = useNavigate();
  const [rings, setRings] = useState<RingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("avg_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // filters
  const [query, setQuery] = useState("");
  const [det, setDet] = useState<Det>("all");
  const [type, setType] = useState<string>("all");

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

  const types = useMemo(
    () => Array.from(new Set(rings.map((r) => r.primary_type).filter(Boolean))),
    [rings]
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "ring" ? "asc" : "desc");
    }
  };

  const view = useMemo(() => {
    const q = query.trim().toUpperCase();
    let rows = rings.filter((r) => {
      if (q && !r.ring.toUpperCase().includes(q)) return false;
      if (type !== "all" && r.primary_type !== type) return false;
      if (det === "high" && r.detected < 0.8) return false;
      if (det === "medium" && (r.detected < 0.5 || r.detected >= 0.8)) return false;
      if (det === "low" && r.detected >= 0.5) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [rings, query, type, det, sortKey, sortDir]);

  const totals = useMemo(() => {
    const accounts = rings.reduce((s, r) => s + r.size, 0);
    const avgDet = rings.length
      ? rings.reduce((s, r) => s + r.detected, 0) / rings.length
      : 0;
    return { count: rings.length, accounts, avgDet };
  }, [rings]);

  const activeFilters = query !== "" || det !== "all" || type !== "all";

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;

  return (
    <div>
      <PageHeader title={t.ringsPage.title} subtitle={t.ringsPage.subtitle} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t.ringsPage.totalRings} value={totals.count} />
        <Stat label={t.ringsPage.inRings} value={totals.accounts.toLocaleString()} />
        <Stat
          label={t.ringsPage.avgDetection}
          value={`${(totals.avgDet * 100).toFixed(0)}%`}
        />
      </div>

      {/* filter bar */}
      <div className="mb-4 card flex flex-wrap items-center gap-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.ringsPage.searchRing}
            className="input w-44 pl-9"
          />
        </div>
        <Select
          label={t.ringsPage.linkType}
          value={type}
          onChange={setType}
          options={[
            { v: "all", l: t.common.all },
            ...types.map((ty) => ({ v: ty, l: ringKindLabel(ty, t) })),
          ]}
        />
        <Select
          label={t.ringsPage.flagged}
          value={det}
          onChange={(v) => setDet(v as Det)}
          options={[
            { v: "all", l: t.common.all },
            { v: "high", l: t.ringsPage.detHigh },
            { v: "medium", l: t.ringsPage.detMedium },
            { v: "low", l: t.ringsPage.detLow },
          ]}
        />
        {activeFilters && (
          <button
            onClick={() => {
              setQuery("");
              setDet("all");
              setType("all");
            }}
            className="btn-ghost px-2 py-1 text-2xs"
          >
            {t.alerts.reset}
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          <b className="text-slate-300">{view.length}</b> {t.alerts.of} {rings.length}
        </span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Loader />
        ) : view.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">{t.alerts.noResults}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/[0.07] text-left text-2xs uppercase tracking-wider text-slate-500">
                  <Th k="ring" {...{ sortKey, sortDir, toggleSort }}>{t.ringsPage.ring}</Th>
                  <th className="px-4 py-3">{t.ringsPage.linkType}</th>
                  <Th k="size" right {...{ sortKey, sortDir, toggleSort }}>
                    {t.ringsPage.size}
                  </Th>
                  <Th k="avg_score" {...{ sortKey, sortDir, toggleSort }}>
                    {t.ringsPage.avgRisk}
                  </Th>
                  <Th k="detected" {...{ sortKey, sortDir, toggleSort }}>
                    {t.ringsPage.flagged}
                  </Th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr
                    key={r.ring}
                    onClick={() => navigate(`/graph?ring=${r.ring}`)}
                    className="group cursor-pointer border-b border-line/[0.05] transition-colors hover:bg-line/[0.04]"
                    title={t.ringsPage.openInGraph}
                  >
                    <td className="px-4 py-3 font-mono text-slate-200">{r.ring}</td>
                    <td className="px-4 py-3">
                      <span className="chip bg-accent-500/10 text-accent-300">
                        {ringKindLabel(r.primary_type, t)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                      {r.size}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-700">
                          <div
                            className="h-full rounded-full bg-accent-500"
                            style={{ width: `${r.avg_score * 100}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-slate-400">
                          {(r.avg_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`tabular-nums ${
                          r.detected >= 0.8
                            ? "text-emerald-300"
                            : r.detected >= 0.5
                            ? "text-amber-300"
                            : "text-rose-300"
                        }`}
                      >
                        {(r.detected * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-2xs text-slate-600 transition-colors group-hover:text-accent-400">
                        <Network className="h-3.5 w-3.5" />
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-fg tabular-nums">{value}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line/10 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500/60"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-ink-900">
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({
  k,
  children,
  right,
  sortKey,
  sortDir,
  toggleSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  right?: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-200 ${
          active ? "text-slate-200" : ""
        } ${right ? "flex-row-reverse" : ""}`}
      >
        {children}
        {active &&
          (sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
