import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Share2,
  TriangleAlert,
  Spline,
  Trophy,
  FlaskConical,
  Gauge,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "../i18n";
import { useApp } from "../hooks/useApp";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";

export default function Layout() {
  const { t } = useI18n();
  const { status, offline } = useApp();
  const location = useLocation();

  const nav = [
    { to: "/", icon: LayoutDashboard, label: t.nav.dashboard, end: true },
    { to: "/graph", icon: Share2, label: t.nav.graph },
    { to: "/alerts", icon: TriangleAlert, label: t.nav.alerts },
    { to: "/rings", icon: Spline, label: t.nav.rings },
    { to: "/leaderboard", icon: Trophy, label: t.nav.leaderboard },
    { to: "/simulation", icon: FlaskConical, label: t.nav.simulation },
    { to: "/metrics", icon: Gauge, label: t.nav.metrics },
    { to: "/about", icon: Info, label: t.nav.about },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/[0.07] bg-ink-900/50 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-600">
            <ShieldCheck className="h-[18px] w-[18px] text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-fg">
              {t.appName}
            </div>
            <div className="text-[10px] text-slate-500">{t.tagline}</div>
          </div>
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-line/[0.05] text-fg"
                    : "text-slate-400 hover:bg-line/[0.03] hover:text-slate-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent-500 transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line/[0.07] px-5 py-4">
          <div className="flex items-center gap-2 text-2xs text-slate-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                offline ? "bg-rose-500" : "bg-emerald-500"
              }`}
            />
            {offline ? t.common.apiOffline : `${t.common.apiOnline} · v${status?.version ?? "—"}`}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line/[0.07] bg-ink-950/85 px-5 backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <ShieldCheck className="h-5 w-5 text-accent-400" />
            <span className="font-semibold text-fg">{t.appName}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-5 lg:p-8">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
