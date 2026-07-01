import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ChevronRight, ArrowUp, ArrowDown, Search } from "lucide-react";
import { api, type Alert } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import PageHeader from "../components/PageHeader";
import RiskBadge from "../components/RiskBadge";
import Loader, { ErrorBanner } from "../components/Loader";
import { ringLabel } from "../lib/format";

type Band = "critical" | "high" | "medium" | "low";
type SortKey =
  | "score"
  | "id"
  | "in_degree"
  | "out_degree"
  | "total_received"
  | "label"
  | "ring";

const BAND_STYLE: Record<Band, string> = {
  critical: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  high: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  medium: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  low: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
};

// score range fetched from the backend per band (matches the risk_band cutoffs)
const BAND_RANGES: Record<Band | "all", [number, number]> = {
  all: [0, 1.01],
  critical: [0.75, 1.01],
  high: [0.5, 0.75],
  medium: [0.25, 0.5],
  low: [0, 0.25],
};

export default function Alerts() {
  const { t, lang } = useI18n();
  const { offline, refreshKey, status } = useApp();
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [minScore, setMinScore] = useState(0);
  const [band, setBand] = useState<Band | "all">("all");
  const [truth, setTruth] = useState<"all" | "fraud" | "legit">("all");
  const [ring, setRing] = useState<"all" | "yes" | "no">("all");
  const [query, setQuery] = useState("");
  // sort
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // each band fetches its own score range from the backend, so Medium/Low
  // are populated too (not just the global top-by-score list).
  useEffect(() => {
    let active = true;
    setLoading(true);
    const [mn, mx] = BAND_RANGES[band];
    api
      .alerts(lang, 3000, mn, mx)
      .then((a) => active && setAlerts(a.alerts))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, refreshKey, band]);

  const bands = status?.summary?.risk_bands;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "id" || key === "ring" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let rows = alerts.filter((a) => {
      if (a.score < minScore) return false;
      if (truth === "fraud" && a.label !== 1) return false;
      if (truth === "legit" && a.label !== 0) return false;
      if (ring === "yes" && !a.ring) return false;
      if (ring === "no" && a.ring) return false;
      if (q && !a.id.toUpperCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "id") {
        av = a.id;
        bv = b.id;
      } else if (sortKey === "ring") {
        av = a.ring ?? "";
        bv = b.ring ?? "";
      } else {
        av = (a as any)[sortKey] ?? 0;
        bv = (b as any)[sortKey] ?? 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [alerts, minScore, band, truth, ring, query, sortKey, sortDir]);

  const open = (id: string) => navigate(`/graph?focus=${id}`);

  const resetFilters = () => {
    setMinScore(0);
    setBand("all");
    setTruth("all");
    setRing("all");
    setQuery("");
  };

  const exportCsv = () => {
    const header = [
      "account", "score", "risk", "ground_truth", "country",
      "in_degree", "out_degree", "total_received", "total_sent", "ring",
    ];
    const rows = filtered.map((a) =>
      [a.id, a.score, a.risk, a.label, a.country, a.in_degree, a.out_degree,
       a.total_received, a.total_sent, a.ring ?? ""].join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "graphguard_alerts.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;

  const activeFilters =
    minScore > 0 || band !== "all" || truth !== "all" || ring !== "all" || query !== "";

  return (
    <div>
      <PageHeader
        title={t.alerts.title}
        subtitle={t.alerts.subtitle}
        right={
          <button onClick={exportCsv} className="btn-ghost">
            <Download className="h-4 w-4" />
            {t.alerts.export}
          </button>
        }
      />

      {/* Risk breakdown over ALL accounts — clickable to filter by band */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["critical", "high", "medium", "low"] as Band[]).map((b) => {
          const count = bands?.[b] ?? 0;
          const total = bands
            ? bands.critical + bands.high + bands.medium + bands.low
            : 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const active = band === b;
          return (
            <button
              key={b}
              onClick={() => setBand(active ? "all" : b)}
              className={`card card-hover p-3 text-left ${
                active ? "ring-1 ring-accent-500/60" : ""
              }`}
            >
              <div className={`chip border ${BAND_STYLE[b]}`}>{t.risk[b]}</div>
              <div className="mt-2 text-xl font-semibold text-fg tabular-nums">
                {count.toLocaleString()}
              </div>
              <div className="text-2xs text-slate-500">
                {pct}% {t.alerts.ofAccounts}
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar: search + filters */}
      <div className="mb-4 card flex flex-wrap items-center gap-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common.search}
            className="input w-44 pl-9"
          />
        </div>

        <Select
          label={t.alerts.label}
          value={truth}
          onChange={(v) => setTruth(v as any)}
          options={[
            { v: "all", l: t.common.all },
            { v: "fraud", l: t.alerts.isFraud },
            { v: "legit", l: t.alerts.isLegit },
          ]}
        />
        <Select
          label={t.common.ring}
          value={ring}
          onChange={(v) => setRing(v as any)}
          options={[
            { v: "all", l: t.common.all },
            { v: "yes", l: t.alerts.inRing },
            { v: "no", l: t.alerts.noRing },
          ]}
        />

        <div className="flex items-center gap-2">
          <span className="label">{t.alerts.minScore}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-32 accent-accent-500"
          />
          <span className="w-9 font-mono text-xs text-slate-400">
            {(minScore * 100).toFixed(0)}%
          </span>
        </div>

        {activeFilters && (
          <button onClick={resetFilters} className="btn-ghost px-2 py-1 text-2xs">
            {t.alerts.reset}
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500">
          <b className="text-slate-300">{filtered.length.toLocaleString()}</b>{" "}
          {t.alerts.of} {alerts.length.toLocaleString()}
        </span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">{t.alerts.noResults}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line/[0.07] text-left text-2xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">{t.alerts.rank}</th>
                  <Th k="id" {...{ sortKey, sortDir, toggleSort }}>{t.common.account}</Th>
                  <Th k="score" {...{ sortKey, sortDir, toggleSort }}>{t.common.score}</Th>
                  <Th k="ring" {...{ sortKey, sortDir, toggleSort }}>{t.common.ring}</Th>
                  <th className="px-4 py-3">{t.common.country}</th>
                  <Th k="in_degree" right {...{ sortKey, sortDir, toggleSort }}>
                    {t.alerts.inDeg}
                  </Th>
                  <Th k="out_degree" right {...{ sortKey, sortDir, toggleSort }}>
                    {t.alerts.outDeg}
                  </Th>
                  <Th k="total_received" right {...{ sortKey, sortDir, toggleSort }}>
                    {t.alerts.received}
                  </Th>
                  <Th k="label" {...{ sortKey, sortDir, toggleSort }}>{t.alerts.label}</Th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((a, i) => (
                  <tr
                    key={a.id}
                    onClick={() => open(a.id)}
                    className="group cursor-pointer border-b border-line/[0.05] transition-colors hover:bg-line/[0.04]"
                    title={t.graph.openInGraph}
                  >
                    <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{a.id}</td>
                    <td className="px-4 py-3">
                      <RiskBadge score={a.score} />
                    </td>
                    <td className="px-4 py-3">
                      {a.ring ? (
                        <span className="chip bg-accent-500/10 text-accent-300">
                          {ringLabel(a.ring, t)}
                        </span>
                      ) : (
                        <span className="text-slate-600">{t.common.none}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{a.country}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                      {a.in_degree}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                      {a.out_degree}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                      {a.total_received.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {a.label === 1 ? (
                        <span className="chip bg-rose-500/15 text-rose-300">{t.alerts.isFraud}</span>
                      ) : (
                        <span className="chip bg-slate-500/10 text-slate-400">
                          {t.alerts.isLegit}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-accent-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 500 && (
              <div className="border-t border-line/[0.05] px-4 py-2 text-center text-2xs text-slate-500">
                {t.alerts.truncated.replace("{n}", "500")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
