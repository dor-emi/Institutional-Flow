import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import { Bell } from "lucide-react";
import "@/App.css";
import { Header } from "@/components/Header";
import { Panel } from "@/components/Primitives";
import { IndicesStrip } from "@/components/IndicesStrip";
import { LiquidityPulse } from "@/components/LiquidityPulse";
import { SectorFlow } from "@/components/SectorFlow";
import { DailyFlowChart } from "@/components/DailyFlowChart";
import { CompareChart } from "@/components/CompareChart";
import { HoldingsPanel } from "@/components/HoldingsPanel";
import { DealsPanel } from "@/components/DealsPanel";
import { AlertsDialog, evaluate, useAlertRules } from "@/components/Alerts";
import { getCompare, getDaily, getFpiDeals, getHoldings, getIndices, getRotation, getSectors, getStats } from "@/lib/api";

const usePoll = (fn, deps, { until }) => {
  const [data, setData] = useState(null);
  const ready = useRef(false);
  const load = useCallback(() => fn().then((d) => { ready.current = until(d); setData(d); }).catch(() => {}), deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    ready.current = false;
    load();
    const t = setInterval(() => { if (!ready.current) load(); }, 10000);
    return () => clearInterval(t);
  }, [load]);
  return [data, load];
};

export default function App() {
  const [range, setRange] = useState("6m");
  const [index, setIndex] = useState("NIFTY50");

  const [indices, r1] = usePoll(() => getIndices("6m"), [], { until: (d) => d.indices.some((i) => i.series.length) });
  const [stats, r2] = usePoll(getStats, [], { until: (d) => !!d.fii });
  const [sectors, r3] = usePoll(() => getSectors(12), [], { until: (d) => d.sectors.length > 0 && d.fortnights.length >= 6 });
  const [daily, r4] = usePoll(() => getDaily(range), [range], { until: (d) => d.series.length > 20 });
  const [compare, r5] = usePoll(() => getCompare(index, range), [index, range], { until: (d) => d.series.length > 20 });
  const [rotation, r6] = usePoll(() => getRotation(8), [], { until: (d) => d.fortnights.length >= 6 && d.fortnights.some((f) => f.rows.some((r) => r.index_return_pct != null)) });
  const [holdings, r7] = usePoll(getHoldings, [], { until: (d) => d.count > 0 && d.status !== "refreshing" });
  const [deals, r8] = usePoll(() => getFpiDeals(10), [], { until: (d) => d.days.length >= 5 });
  const [rules, setRules] = useAlertRules();
  const triggered = useMemo(() => evaluate(rules, { stats, indices, sectors }), [rules, stats, indices, sectors]);

  const refreshAll = () => [r1, r2, r3, r4, r5, r6, r7, r8].forEach((f) => f());

  return (
    <div className="App">
      <Toaster theme="dark" position="bottom-right" />
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        <Header onRefreshed={refreshAll} alertsSlot={<AlertsDialog rules={rules} setRules={setRules} triggered={triggered} trigger={<button data-testid="alerts-dialog-trigger" className={`seg-btn border-[color:var(--line)] flex items-center gap-1.5 ${triggered.length ? "text-red-300 border-red-500/40" : ""}`}><Bell size={12} /> Alerts{triggered.length ? ` (${triggered.length})` : ""}</button>} />} />

        <div className="rise" style={{ animationDelay: "60ms" }}>
          <Panel testId="panel-indices" title="Market context" subtitle="EOD index levels with 60-session sparklines. Returns shown alongside flows so you can compare, not infer.">
            <IndicesStrip data={indices} />
          </Panel>
        </div>

        <div className="rise" style={{ animationDelay: "120ms" }}>
          <Panel testId="panel-pulse" title="Liquidity pulse & persistence" subtitle="How strong and how persistent are current FPI equity flows? Confirmed NSDL series for streak/rolling stats; NSE provisional for today's print and DII.">
            <LiquidityPulse stats={stats} />
          </Panel>
        </div>

        <div className="rise" style={{ animationDelay: "180ms" }}>
          <Panel testId="panel-sectors" title="Where is FPI money going? — Sector flows" subtitle="NSDL fortnightly net FPI equity investment by BSE industry sector, with Assets Under Custody for scale. Ranked, heat-mapped, mapped against sector index returns (rotation) and trended across the last 12 fortnights.">
            <SectorFlow data={sectors} rotation={rotation} />
          </Panel>
        </div>

        <div className="rise" style={{ animationDelay: "210ms" }}>
          <Panel testId="panel-holdings" title="Which stocks are foreign funds adding or trimming? — Quarterly FII holdings" subtitle="FII % of equity from exchange shareholding filings for NIFTY 100 constituents; ranked by change in percentage points.">
            <HoldingsPanel data={holdings} />
          </Panel>
        </div>

        <div className="rise" style={{ animationDelay: "230ms" }}>
          <Panel testId="panel-deals" title="Daily FPI bulk & block deals — disclosed counterparties" subtitle="The only per-stock, per-day foreign trades that are publicly disclosed. Partial coverage by definition.">
            <DealsPanel data={deals} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rise" style={{ animationDelay: "240ms" }}>
            <Panel testId="panel-daily" title="Daily FII / DII net flows" subtitle="Confirmed FPI equity net (NSDL) with cumulative and 20D overlays; DII from NSE provisional data.">
              <DailyFlowChart data={daily} range={range} onRange={setRange} />
            </Panel>
          </div>
          <div className="rise" style={{ animationDelay: "300ms" }}>
            <Panel testId="panel-compare" title="Flows vs market returns" subtitle="Cumulative FPI flow against index level, and daily flow against daily return with lead/lag correlations.">
              <CompareChart data={compare} index={index} onIndex={setIndex} range={range} />
            </Panel>
          </div>
        </div>

        <footer className="pt-2 pb-8 text-[11px] text-slate-600 font-mono flex flex-wrap gap-x-6 gap-y-1">
          <span>FII Flow Tracker India</span>
          <span>data © NSDL, NSE, Yahoo Finance — redistributed for analysis only</span>
          <span>range selector applies to daily & comparison panels</span>
        </footer>
      </main>
    </div>
  );
}
