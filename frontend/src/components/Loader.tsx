import { useI18n } from "../i18n";

export default function Loader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand-400 border-r-accent-400" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-accent-500/20" />
      </div>
      <span className="text-sm">{label ?? t.common.loading}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="card border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
      {message}
    </div>
  );
}
