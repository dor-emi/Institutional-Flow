import { useEffect, useState } from "react";
import { Activity, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { getSources, postRefresh } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { MethodologyDialog } from "./MethodologyDialog";

const dot = (s) => (s === "ok" ? "bg-emerald-400" : s === "error" ? "bg-red-400" : "bg-amber-400 pulse-dot");

export const Header = ({ onRefreshed }) => {
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => getSources().then((d) => setSources(d.sources)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setBusy(true);
    try {
      await postRefresh();
      toast.success("Refresh queued for all sources");
      setTimeout(() => { load(); onRefreshed?.(); setBusy(false); }, 6000);
    } catch (e) {
      toast.error("Refresh failed");
      setBusy(false);
    }
  };

  const lastOk = sources.filter((s) => s.last_fetch).map((s) => s.last_fetch).sort().pop();

  return (
    <header data-testid="dashboard-header" className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[color:var(--line)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-blue-500/15 border border-blue-500/30 grid place-items-center text-blue-300">
          <Activity size={18} />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-50 leading-none">FII Flow Tracker <span className="text-blue-400">India</span></h1>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Where foreign institutional money is going — NSDL · NSE · Yahoo Finance</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div data-testid="source-health" className="hidden md:flex items-center gap-3 rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/50 px-3 py-1.5">
          {sources.map((s) => (
            <span key={s.id} data-testid={`source-status-${s.id}`} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400" title={`${s.name}\n${s.status}${s.error ? ": " + s.error : ""}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dot(s.status)}`} /> {s.id.replace("_", " ")}
            </span>
          ))}
          <span className="text-[10px] font-mono text-slate-600 border-l border-[color:var(--line)] pl-3">upd {fmtTime(lastOk)}</span>
        </div>
        <MethodologyDialog trigger={<button data-testid="methodology-dialog-trigger" className="seg-btn border-[color:var(--line)] flex items-center gap-1.5"><BookOpen size={12} /> Methodology</button>} />
        <button data-testid="refresh-all-button" onClick={refresh} disabled={busy} className="seg-btn border-[color:var(--line)] flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </header>
  );
};
