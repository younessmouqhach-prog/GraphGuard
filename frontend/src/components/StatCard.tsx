import { ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  accent?: "brand" | "accent" | "rose" | "emerald" | "amber";
  to?: string;
}

const ICON_TINT: Record<string, string> = {
  brand: "bg-accent-500/10 text-accent-300",
  accent: "bg-accent-500/10 text-accent-300",
  rose: "bg-rose-500/10 text-rose-300",
  emerald: "bg-emerald-500/10 text-emerald-300",
  amber: "bg-amber-500/10 text-amber-300",
};

export default function StatCard({ label, value, icon, hint, accent = "brand", to }: Props) {
  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className={`grid h-8 w-8 place-items-center rounded-lg ${ICON_TINT[accent]}`}>
            {icon}
          </div>
        )}
        <div className="label">{label}</div>
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none text-fg tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card card-hover block p-4 animate-fade-in">
        {inner}
      </Link>
    );
  }
  return <div className="card card-hover p-4 animate-fade-in">{inner}</div>;
}
