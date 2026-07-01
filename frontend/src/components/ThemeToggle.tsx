import { Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "Light mode" : "Dark mode"}
      aria-label="Toggle theme"
      className="relative flex h-7 w-12 items-center rounded-full border border-line/15 bg-ink-800 transition-colors"
    >
      <span
        className={`absolute grid h-5 w-5 place-items-center rounded-full bg-accent-500 text-white shadow transition-transform duration-200 ${
          dark ? "translate-x-1" : "translate-x-6"
        }`}
      >
        {dark ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </span>
    </button>
  );
}
