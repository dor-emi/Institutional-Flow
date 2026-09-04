import { Database, CalendarDays, Clock, Repeat, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/format";

const QUALITY = {
  verified: { label: "Verified", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", Icon: ShieldCheck },
  provisional: { label: "Provisional", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10", Icon: ShieldAlert },
  partial: { label: "Partial", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10", Icon: AlertTriangle },
};

export const ProvenanceChip = ({ p, id, compact = false }) => {
  if (!p) return null;
  const q = QUALITY[p.quality] || QUALITY.partial;
  const errored = p.status === "error";
  return (
    <div data-testid={`provenance-chip-${id}`} className="flex flex-wrap items-center gap-1.5">
      <a href={p.url} target="_blank" rel="noreferrer" className="chip hover:border-slate-500 transition-colors" title={p.name}>
        <Database size={11} /> {p.name?.split(" — ")[0] || "Source"}
      </a>
      <span className="chip" title="Data date"><CalendarDays size={11} /> {fmtDate(p.data_date)}</span>
      <span className="chip" title="Last fetched (local time)"><Clock size={11} /> {p.last_updated ? fmtTime(p.last_updated) : p.status === "refreshing" ? "fetching…" : "—"}</span>
      {!compact && <span className="chip" title="Frequency"><Repeat size={11} /> {p.frequency}</span>}
      <span className={`chip ${errored ? "text-red-400 border-red-500/30 bg-red-500/10" : q.cls}`} title={errored ? p.error : p.quality_note}>
        <q.Icon size={11} /> {errored ? "Source error" : q.label}
      </span>
    </div>
  );
};
