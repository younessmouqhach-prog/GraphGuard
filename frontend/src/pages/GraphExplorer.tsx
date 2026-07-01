import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ForceGraph3D from "react-force-graph-3d";
import {
  Search,
  X,
  Crosshair,
  Eye,
  Plus,
  Minus,
  Maximize2,
  ChevronLeft,
} from "lucide-react";
import { api, type GraphData, type Explanation, type RingDetail } from "../api/client";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import { useTheme } from "../hooks/useTheme";
import PageHeader from "../components/PageHeader";
import RiskBadge from "../components/RiskBadge";
import Loader, { ErrorBanner } from "../components/Loader";
import { ringLabel, ringKindLabel } from "../lib/format";

function scoreColor(score: number, label: number): string {
  if (label === 1 && score < 0.5) return "#a855f7"; // a real fraud the model missed
  if (score >= 0.75) return "#fb7185";
  if (score >= 0.5) return "#fb923c";
  if (score >= 0.25) return "#fbbf24";
  return "#34d399";
}

const LINK_COLORS: Record<string, string> = {
  legit: "rgba(120,130,150,0.16)",
  fan_out: "#fb7185",
  fan_in: "#fb923c",
  cycle: "#818cf8",
  phone: "#22d3ee",
  email_domain: "#8b93f8",
  ip_address: "#fb7185",
  device_id: "#34d399",
};

export default function GraphExplorer() {
  const { t, lang } = useI18n();
  const { offline, refreshKey } = useApp();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus") || undefined;
  const ringId = searchParams.get("ring") || undefined;

  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const [maxNodes, setMaxNodes] = useState(250);
  const [selected, setSelected] = useState<Explanation | null>(null);
  const [ringInfo, setRingInfo] = useState<RingDetail | null>(null);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [width, setWidth] = useState(800);
  const centeredFor = useRef<string | null>(null);

  // ---- data fetch (honours the ?focus= deep link) ----
  useEffect(() => {
    let active = true;
    setLoading(true);
    centeredFor.current = null; // re-center once the new graph settles
    api
      .graph(lang, maxNodes, onlySuspicious, focusId, ringId)
      .then((g) => active && setData(g))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, maxNodes, onlySuspicious, focusId, ringId, refreshKey]);

  // ---- when deep-linked to an account, open its details automatically ----
  const inspect = useCallback(
    async (id: string) => {
      try {
        setSelected(await api.account(id, lang));
      } catch {
        /* ignore */
      }
    },
    [lang]
  );

  useEffect(() => {
    if (focusId) inspect(focusId);
  }, [focusId, inspect, refreshKey]);

  // ring detail for the side panel when viewing a ring
  useEffect(() => {
    if (!ringId) {
      setRingInfo(null);
      return;
    }
    setSelected(null);
    api
      .ring(ringId, lang)
      .then(setRingInfo)
      .catch(() => setRingInfo(null));
  }, [ringId, lang, refreshKey]);

  // re-fetch the open account in the new language when the user switches FR/EN
  useEffect(() => {
    setSelected((cur) => {
      if (cur) inspect(cur.id);
      return cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ---- responsive width ----
  useEffect(() => {
    const update = () => {
      if (wrapRef.current) setWidth(wrapRef.current.clientWidth);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        kind: e.kind,
        amount: e.amount,
      })),
    };
  }, [data]);

  const linkKinds = useMemo(
    () => Array.from(new Set((data?.edges ?? []).map((e) => e.kind))).slice(0, 6),
    [data]
  );

  // performance: drop animated particles & lower detail on big graphs
  const bigGraph = graphData.nodes.length > 500;

  const centerOnNode = useCallback((node: any) => {
    if (!fgRef.current || node.x == null) return;
    // Place the camera a FIXED offset away from the node and look at it.
    // (Multiplying the node position by a ratio overshoots when the node is
    // near the origin — that made the node fly out of view.)
    const off = 70;
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const nz = node.z ?? 0;
    fgRef.current.cameraPosition(
      { x: nx + off, y: ny + off, z: nz + off },
      { x: nx, y: ny, z: nz },
      900
    );
  }, []);

  const zoomBy = useCallback((factor: number) => {
    if (!fgRef.current) return;
    const cam = fgRef.current.cameraPosition();
    fgRef.current.cameraPosition(
      { x: cam.x * factor, y: cam.y * factor, z: cam.z * factor },
      undefined,
      250
    );
  }, []);

  const goToAccount = useCallback(
    (id: string) => {
      setSearchParams({ focus: id });
    },
    [setSearchParams]
  );

  // center on a node already in the current view (used by the ring member list)
  const centerById = useCallback(
    (id: string) => {
      const node: any = (graphData.nodes as any[]).find((n) => n.id === id);
      if (node) centerOnNode(node);
      inspect(id);
    },
    [graphData, centerOnNode, inspect]
  );

  const clearFocus = useCallback(() => {
    setSearchParams({});
    setSelected(null);
  }, [setSearchParams]);

  const handleSearch = useCallback(() => {
    const q = query.trim().toUpperCase();
    if (q) goToAccount(q);
  }, [query, goToAccount]);

  if (offline) return <ErrorBanner message={t.common.backendOffline} />;

  return (
    <div>
      <PageHeader
        title={t.graph.title}
        subtitle={t.graph.subtitle}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t.common.search}
                className="input w-48 pl-9"
              />
            </div>
            <label className="btn-ghost cursor-pointer">
              <input
                type="checkbox"
                checked={onlySuspicious}
                onChange={(e) => setOnlySuspicious(e.target.checked)}
                className="accent-accent-500"
              />
              <Eye className="h-4 w-4" />
              {t.graph.onlySuspicious}
            </label>
          </div>
        }
      />

      {/* focus / ring banner */}
      {(focusId || ringId) && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-accent-500/30 bg-accent-500/[0.07] px-3 py-2 text-sm animate-fade-in">
          <span className="text-slate-300">
            {ringId ? t.graph.viewingRing : t.graph.viewingNeighborhood}{" "}
            <span className="font-mono font-semibold text-accent-300">
              {ringId ?? focusId}
            </span>
          </span>
          <button onClick={clearFocus} className="btn-ghost px-2 py-1 text-2xs">
            <X className="h-3.5 w-3.5" />
            {t.graph.clearFocus}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 3D graph canvas */}
        <div className="card relative overflow-hidden lg:col-span-2" style={{ height: 600 }}>
          <div ref={wrapRef} className="h-full w-full">
            {loading ? (
              <Loader />
            ) : (
              <ForceGraph3D
                ref={fgRef}
                width={width}
                height={600}
                graphData={graphData as any}
                backgroundColor={theme === "light" ? "#eef2f7" : "#0a0b0e"}
                showNavInfo={false}
                nodeRelSize={5}
                nodeVal={(n: any) =>
                  (n.id === focusId ? 3 : 1) + (n.in_degree + n.out_degree) * 0.25
                }
                nodeColor={(n: any) => scoreColor(n.score, n.label)}
                nodeOpacity={0.95}
                nodeResolution={bigGraph ? 6 : 14}
                nodeLabel={(n: any) =>
                  `<div style="background:#0e1014;border:1px solid rgba(255,255,255,0.12);
                     padding:6px 10px;border-radius:8px;font-family:Inter,sans-serif;font-size:12px;color:#e2e8f0">
                     <b>${n.id}</b> · ${n.country}<br/>
                     ${t.common.score}: <b style="color:${scoreColor(n.score, n.label)}">${(
                    n.score * 100
                  ).toFixed(0)}%</b>
                   </div>`
                }
                onNodeClick={(n: any) => {
                  centerOnNode(n);
                  inspect(n.id);
                }}
                linkColor={(l: any) => LINK_COLORS[l.kind] ?? LINK_COLORS.legit}
                linkWidth={(l: any) => (l.kind === "legit" ? 0.3 : 1.4)}
                linkOpacity={0.55}
                linkDirectionalParticles={(l: any) =>
                  bigGraph || l.kind === "legit" ? 0 : 2
                }
                linkDirectionalParticleWidth={1.8}
                linkDirectionalParticleSpeed={0.006}
                enableNodeDrag={false}
                // Perf: don't pre-run the layout synchronously on big graphs
                // (that froze the page). Let it settle quickly and animate.
                warmupTicks={bigGraph ? 0 : 40}
                cooldownTicks={bigGraph ? 40 : 120}
                cooldownTime={bigGraph ? 6000 : 15000}
                d3AlphaDecay={bigGraph ? 0.08 : 0.0228}
                d3VelocityDecay={bigGraph ? 0.5 : 0.4}
                onEngineStop={() => {
                  if (ringId && centeredFor.current !== "ring:" + ringId) {
                    fgRef.current?.zoomToFit(700, 60);
                    centeredFor.current = "ring:" + ringId;
                  } else if (focusId && centeredFor.current !== focusId) {
                    const node: any = (graphData.nodes as any[]).find(
                      (n) => n.id === focusId
                    );
                    if (node) {
                      centerOnNode(node);
                      centeredFor.current = focusId;
                    }
                  }
                }}
              />
            )}
          </div>

          {/* camera controls */}
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <button onClick={() => zoomBy(0.7)} className="ctrl-btn" title={t.graph.zoomIn}>
              <Plus className="h-4 w-4" />
            </button>
            <button onClick={() => zoomBy(1.4)} className="ctrl-btn" title={t.graph.zoomOut}>
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => fgRef.current?.zoomToFit(700, 40)}
              className="ctrl-btn"
              title={t.graph.resetView}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>

          {/* legends */}
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-1.5">
            <div className="card flex flex-wrap items-center gap-2.5 px-3 py-1.5 text-2xs">
              <span className="label">{t.graph.riskLegend}</span>
              <LegendDot color="#34d399" label={t.graph.legit} />
              <LegendDot color="#fb923c" label={t.graph.suspicious} />
              <LegendDot color="#fb7185" label={t.risk.critical} />
              <LegendDot color="#a855f7" label={t.graph.missed} />
            </div>
            {linkKinds.length > 0 && (
              <div className="card flex flex-wrap items-center gap-2.5 px-3 py-1.5 text-2xs">
                <span className="label">{t.graph.linkLegend}</span>
                {linkKinds.map((k) => (
                  <LegendLine
                    key={k}
                    color={LINK_COLORS[k] ?? LINK_COLORS.legit}
                    label={ringKindLabel(k, t)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-ink-900/80 px-2.5 py-1 text-2xs text-slate-400 backdrop-blur">
            {t.graph.controls}
          </div>
        </div>

        {/* Inspector / Ring panel */}
        <div className="card p-5">
          {selected ? (
            <Inspector
              exp={selected}
              onClose={() => setSelected(null)}
              onFocus={goToAccount}
              backToRing={ringId ? () => setSelected(null) : undefined}
            />
          ) : ringInfo ? (
            <RingPanel info={ringInfo} onMember={centerById} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-ink-800">
                <Crosshair className="h-7 w-7 text-slate-600" />
              </div>
              <p className="max-w-[15rem] text-sm">{t.graph.clickHint}</p>
            </div>
          )}
        </div>
      </div>

      {/* max nodes control */}
      <div className="mt-4 card p-4">
        <div className="flex items-center gap-4">
          <span className="label whitespace-nowrap">{t.graph.maxNodes}</span>
          <input
            type="range"
            min={50}
            max={6800}
            step={50}
            value={maxNodes}
            onChange={(e) => setMaxNodes(Number(e.target.value))}
            className="flex-1 accent-accent-500"
          />
          <input
            type="number"
            min={50}
            max={6800}
            value={maxNodes}
            onChange={(e) => {
              const n = Number(e.target.value) || 0;
              setMaxNodes(Math.max(10, Math.min(6800, n)));
            }}
            className="input w-24 tabular-nums"
            title={t.graph.maxNodes}
          />
          <button
            onClick={() => setMaxNodes(6800)}
            className="btn-ghost shrink-0 px-2 py-1 text-2xs"
          >
            {t.graph.showAll}
          </button>
        </div>
        <p className="mt-2 text-2xs text-slate-500">{t.graph.maxNodesHint}</p>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function RingPanel({
  info,
  onMember,
}: {
  info: RingDetail;
  onMember: (id: string) => void;
}) {
  const { t } = useI18n();
  const totalLinks = Object.values(info.types).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="animate-fade-in">
      <div className="label">{t.graph.viewingRing}</div>
      <div className="mt-1 font-mono text-lg font-bold text-fg">{info.ring}</div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label={t.ringsPage.size} value={info.size} />
        <Metric
          label={t.graph.confirmedFraud}
          value={`${info.n_fraud}/${info.size}`}
          tone="rose"
        />
        <Metric
          label={t.graph.flaggedByModel}
          value={`${(info.detected * 100).toFixed(0)}%`}
          tone="emerald"
        />
        <Metric
          label={t.ringsPage.avgRisk}
          value={`${(info.avg_score * 100).toFixed(0)}%`}
        />
      </div>

      <div className="mt-4">
        <div className="label mb-2">{t.graph.sharedIds}</div>
        <div className="space-y-1.5">
          {Object.entries(info.types)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{ringKindLabel(k, t)}</span>
                  <span className="tabular-nums text-slate-500">{n}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-accent-500"
                    style={{ width: `${(n / totalLinks) * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="label mb-2">
          {t.graph.ringMembers} ({info.members.length})
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {info.members.map((m) => (
            <button
              key={m.id}
              onClick={() => onMember(m.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-line/5"
              title={t.graph.openInGraph}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: scoreColor(m.score, m.label) }}
                />
                <span className="font-mono text-slate-300">{m.id}</span>
                {m.label === 1 && (
                  <span className="chip bg-rose-500/15 text-rose-300">
                    {t.alerts.isFraud}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-slate-500">
                {(m.score * 100).toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "rose" | "emerald";
}) {
  const color =
    tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : "text-fg";
  return (
    <div className="rounded-lg border border-line/5 bg-ink-800/50 p-2.5">
      <div className="text-2xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Inspector({
  exp,
  onClose,
  onFocus,
  backToRing,
}: {
  exp: Explanation;
  onClose: () => void;
  onFocus: (id: string) => void;
  backToRing?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-fade-in">
      {backToRing && (
        <button
          onClick={backToRing}
          className="mb-3 inline-flex items-center gap-1 text-2xs text-slate-400 hover:text-accent-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t.graph.backToRing}
        </button>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="label">{t.graph.inspect}</div>
          <div className="mt-1 font-mono text-lg font-bold text-fg">{exp.id}</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-line/5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RiskBadge score={exp.score} />
        {exp.label === 1 && (
          <span className="chip bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30">
            {t.alerts.isFraud}
          </span>
        )}
        {exp.ring && (
          <span className="chip bg-accent-500/10 text-accent-300">{ringLabel(exp.ring, t)}</span>
        )}
      </div>

      <p className="mt-3 rounded-lg bg-ink-800/70 p-3 text-sm leading-relaxed text-slate-300">
        {exp.narrative}
      </p>

      <div className="mt-4">
        <div className="label mb-2">{t.graph.topFactors}</div>
        <div className="space-y-2">
          {exp.top_features.map((f) => {
            const mag = Math.min(1, Math.abs(f.z_score) / 4);
            const pos = f.z_score >= 0;
            return (
              <div key={f.feature}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">
                    {(t.features as Record<string, string>)[f.feature] ?? f.feature}
                  </span>
                  <span className={pos ? "text-rose-300" : "text-emerald-300"}>
                    {f.z_score > 0 ? "+" : ""}
                    {f.z_score}σ
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className={`h-full rounded-full ${pos ? "bg-rose-400" : "bg-emerald-400"}`}
                    style={{ width: `${mag * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="label mb-2">{t.graph.neighbors}</div>
        {exp.neighbors.length === 0 ? (
          <p className="text-xs text-slate-500">{t.graph.noNeighbors}</p>
        ) : (
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {exp.neighbors.map((nb, i) => (
              <button
                key={i}
                onClick={() => onFocus(nb.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-line/5"
                title={t.graph.openInGraph}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`chip ${
                      nb.direction === "in"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-orange-500/10 text-orange-300"
                    }`}
                  >
                    {nb.direction === "in" ? "←" : "→"}
                  </span>
                  <span className="font-mono text-slate-300">{nb.id}</span>
                </span>
                <span className="flex items-center gap-2 text-slate-500">
                  <span className="tabular-nums">{nb.amount.toLocaleString()}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: scoreColor(nb.score, 0) }}
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
