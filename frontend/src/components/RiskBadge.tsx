import { useI18n } from "../i18n";

const STYLES: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  high: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  low: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
};

export function riskBand(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 0.75) return "critical";
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export default function RiskBadge({ score }: { score: number }) {
  const { t } = useI18n();
  const band = riskBand(score);
  return (
    <span className={`chip ${STYLES[band]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t.risk[band]} · {(score * 100).toFixed(0)}%
    </span>
  );
}
