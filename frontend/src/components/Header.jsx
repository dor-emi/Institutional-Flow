import { Activity, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { postRefresh } from "@/lib/api";
import { MethodologyDialog } from "./MethodologyDialog";

export const Header = ({ onRefreshed, alertsSlot }) => {
  const [busy, setBusy] = React.useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await postRefresh();
      toast.success("Refresh queued for all sources");
      setTimeout(() => { onRefreshed?.(); setBusy(false); }, 6000);
    } catch (e) {
      toast.error("Refresh failed");
      setBusy(false);
    }
  };

  return (
    <header data-testid="dashboard-header" className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[color:var(--line)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-blue-500/15 border border-blue-500/30 grid place-items-center text-blue-300">
          <Activity size={18} />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-50 leading-none">FII Flow Tracker <span className="text-blue-400">India</span></h1>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Where foreign institutional money is going</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {alertsSlot}
        <MethodologyDialog trigger={<button data-testid="methodology-dialog-trigger" className="seg-btn border-[color:var(--line)] flex items-center gap-1.5"><BookOpen size={12} /> Methodology</button>} />
        <button data-testid="refresh-all-button" onClick={refresh} disabled={busy} className="seg-btn border-[color:var(--line)] flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </header>
  );
};
