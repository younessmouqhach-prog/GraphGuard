import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api, type Status } from "../api/client";
import { useI18n } from "../i18n";

interface AppCtx {
  status: Status | null;
  offline: boolean;
  busy: "idle" | "training" | "generating";
  refreshKey: number;
  refreshStatus: () => Promise<void>;
  regenerate: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<"idle" | "training" | "generating">("idle");
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status(lang);
      setStatus(s);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [lang]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);



  const regenerate = useCallback(async () => {
    setBusy("generating");
    try {
      await api.generate(lang, {
        n_accounts: 1200,
        n_legit_tx: 4500,
        n_fraud_rings: 14,
        seed: Math.floor(Math.random() * 100000),
      });
      await api.train(lang, {
        model_name: "graphsage",
        epochs: 200,
        lr: 0.01,
        hidden: 64,
      });
      await refreshStatus();
      setRefreshKey((k) => k + 1);
    } catch {
      setOffline(true);
    } finally {
      setBusy("idle");
    }
  }, [lang, refreshStatus]);

  return (
    <Ctx.Provider
      value={{ status, offline, busy, refreshKey, refreshStatus, regenerate }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
