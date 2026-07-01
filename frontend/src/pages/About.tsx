import {
  Network,
  Cpu,
  Activity,
  ShieldCheck,
  Database,
  Boxes,
  GitGraph,
  Radio,
} from "lucide-react";
import { useI18n } from "../i18n";
import PageHeader from "../components/PageHeader";

export default function About() {
  const { t } = useI18n();

  const steps = [
    { icon: GitGraph, text: t.about.step1 },
    { icon: Activity, text: t.about.step2 },
    { icon: Cpu, text: t.about.step3 },
    { icon: ShieldCheck, text: t.about.step4 },
  ];

  const stack = [
    { icon: Cpu, name: "Python · PyTorch" },
    { icon: Network, name: "GraphSAGE / GAT (GNN)" },
    { icon: Boxes, name: "PyTorch Geometric / DGL" },
    { icon: Database, name: "FastAPI · REST" },
    { icon: Radio, name: "Streaming data" },
    { icon: Activity, name: "React · TypeScript" },
  ];

  return (
    <div>
      <PageHeader title={t.about.title} subtitle={t.about.subtitle} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-600">
              <ShieldCheck className="h-7 w-7 text-fg" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-fg">{t.appName}</h2>
              <p className="text-sm text-slate-400">{t.tagline}</p>
            </div>
          </div>
          <p className="mt-5 leading-relaxed text-slate-300">{t.about.p1}</p>

          <h3 className="mt-6 mb-3 font-bold text-fg">{t.about.pipelineTitle}</h3>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-500/15 text-accent-300">
                  <s.icon className="h-4 w-4" />
                </div>
                <div>
                  <span className="mr-2 font-mono text-xs text-slate-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-slate-300">{s.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="mb-3 font-bold text-fg">{t.about.stackTitle}</h3>
            <div className="grid grid-cols-1 gap-2">
              {stack.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-3 rounded-xl border border-line/5 bg-ink-800/50 px-3 py-2 text-sm text-slate-300"
                >
                  <s.icon className="h-4 w-4 text-brand-400" />
                  {s.name}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
