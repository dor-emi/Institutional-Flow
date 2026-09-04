import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ProvenanceChip } from "./ProvenanceChip";
import { Empty, Segmented } from "./Primitives";
import { fmtAbs, fmtDate, fmtNum } from "@/lib/format";

const List = ({ rows, side, testId }) => (
  <div data-testid={testId} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 p-3">
    <div className={`overline-label mb-2 ${side === "buy" ? "text-emerald-400" : "text-red-400"}`}>Top FPI {side === "buy" ? "buys" : "sells"} (by deal value)</div>
    {!rows.length ? <div className="text-xs text-slate-600 font-mono py-3">no identifiable FPI {side} deals disclosed</div> : (
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.symbol} data-testid={`deal-${side}-${r.symbol.toLowerCase()}`} className="flex items-start gap-3">
            <span className="font-mono text-slate-600 text-xs w-4 pt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-100 font-medium text-sm">{r.symbol} <span className="text-[10px] text-slate-500 font-normal">{r.kinds.join("+")}</span></span>
                <span className={`font-mono text-sm ${side === "buy" ? "buy" : "sell"}`}>{fmtAbs(r.value_cr)}</span>
              </div>
              <div className="text-[10px] text-slate-500 truncate">{r.name} · {fmtNum(r.qty)} sh · {r.clients.join("; ")}</div>
            </div>
          </li>
        ))}
      </ol>
    )}
  </div>
);

export const DealsPanel = ({ data }) => {
  const [idx, setIdx] = useState(0);
  if (!data) return <Empty testId="deals-loading" />;
  const days = data.days || [];
  if (!days.length) return <Empty testId="deals-empty" label="No FPI-identified bulk/block deals in the loaded window" />;
  const day = days[Math.min(idx, days.length - 1)];
  return (
    <div data-testid="deals-panel" className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200/90 leading-relaxed">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>Exchanges do not publish per-stock FII trades. This shows only NSE <b>bulk deals</b> (≥0.5% of equity) and <b>block deals</b> where the disclosed counterparty name looks like a foreign portfolio investor ({data.fpi_deal_rows} of {data.all_deal_rows} deal rows in the window). It is a partial, name-matched view — not total FII buying/selling.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="overline-label">Trading day</span>
        <Segmented testPrefix="deals-day" value={String(idx)} onChange={(v) => setIdx(Number(v))} options={days.slice(0, 7).map((d, i) => ({ value: String(i), label: fmtDate(d.date, "DD MMM") }))} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <List rows={day.top_buys} side="buy" testId="deals-top-buys" />
        <List rows={day.top_sells} side="sell" testId="deals-top-sells" />
      </div>
      <ProvenanceChip id="deals" p={{ ...data.provenance, data_date: day.date }} />
    </div>
  );
};
