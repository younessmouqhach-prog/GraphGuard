import { useI18n } from "../i18n";

export default function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center rounded-lg border border-line/10 bg-ink-800 p-0.5 text-2xs font-semibold">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-md px-2 py-1 transition-colors ${
            lang === l
              ? "bg-line/10 text-fg"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
