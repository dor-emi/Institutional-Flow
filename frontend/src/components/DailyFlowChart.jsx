import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Download } from "lucide-react";
import { ProvenanceChip } from "./ProvenanceChip";
import { ChartTooltip, Empty, Segmented } from "./Primitives";
import { fmtCr, fmtAbs, shortDate, COLORS } from "@/lib/format";
import { exportDailyUrl } from "@/lib/api";

const RANGES = [
  { value: "1m", label: "1M" }, { value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "ytd", label: "YTD" }, { value: "1y", label: "1Y" },
];

export const DailyFlowChart = ({ data, range, onRange }) => {
  const [view, setView] = useState("net");
  const series = data?.series || [];
  const rows = (d) => [
    { k: "FPI net (NSDL)", v: fmtCr(d.fii_net), cls: d.fii_net >= 0 ? "buy" : "sell" },
    ...(d.nse_fii_net != null ? [{ k: "FII net (NSE prov.)", v: fmtCr(d.nse_fii_net), cls: "text-slate-300" }] : []),
    ...(d.dii_net != null ? [{ k: "DII net (NSE prov.)", v: fmtCr(d.dii_net), cls: "text-cyan-300" }] : []),
    { k: "Cumulative", v: fmtCr(d.fii_cum) },
    { k: "20D sum", v: fmtCr(d.fii_20d) },
    ...(d.provisional ? [{ k: "note", v: "provisional row", cls: "text-amber-400" }] : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented testPrefix="fii-dii-view" value={view} onChange={setView} options={[{ value: "net", label: "FII vs DII" }, { value: "cum", label: "Net + cumulative" }, { value: "gross", label: "Buy / Sell" }]} />
        <div className="flex items-center gap-2">
          <Segmented testPrefix="fii-dii-time-range" value={range} onChange={onRange} options={RANGES} />
          <a data-testid="export-csv-button" href={exportDailyUrl(range)} className="seg-btn border-[color:var(--line)] flex items-center gap-1.5" title="Download daily flows CSV"><Download size={12} /> CSV</a>
        </div>
      </div>
      {!series.length ? <Empty testId="daily-loading" /> : (
        <div data-testid="daily-flow-chart" className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {view === "gross" ? (
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={0}>
                <CartesianGrid stroke="#1b2233" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                <Tooltip content={<ChartTooltip rows={(d) => [{ k: "Gross buy", v: fmtAbs(d.fii_buy), cls: "buy" }, { k: "Gross sell", v: fmtAbs(d.fii_sell), cls: "sell" }, { k: "Net", v: fmtCr(d.fii_net) }]} />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
                <Bar dataKey="fii_buy" fill={COLORS.buy} fillOpacity={0.75} isAnimationActive={false} />
                <Bar dataKey="fii_sell" fill={COLORS.sell} fillOpacity={0.75} isAnimationActive={false} />
              </BarChart>
            ) : (
              <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={0} barCategoryGap="12%">
                <CartesianGrid stroke="#1b2233" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis yAxisId="l" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                {view === "cum" && <YAxis yAxisId="r" orientation="right" tick={{ fill: "#3b82f6", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={44} />}
                <Tooltip content={<ChartTooltip rows={rows} />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
                <ReferenceLine yAxisId="l" y={0} stroke="#334155" />
                <Bar yAxisId="l" dataKey="fii_net" name="FPI net" isAnimationActive={false} maxBarSize={14}>
                  {series.map((s) => <Cell key={s.date} fill={s.fii_net >= 0 ? COLORS.buy : COLORS.sell} fillOpacity={s.provisional ? 0.45 : 0.85} />)}
                </Bar>
                {view === "net" && <Bar yAxisId="l" dataKey="dii_net" name="DII net" fill={COLORS.dii} fillOpacity={0.55} isAnimationActive={false} maxBarSize={14} />}
                {view === "cum" && <Line yAxisId="r" type="monotone" dataKey="fii_cum" stroke={COLORS.accent} strokeWidth={1.8} dot={false} isAnimationActive={false} />}
                {view === "cum" && <Line yAxisId="l" type="monotone" dataKey="fii_20d" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-slate-500">
        <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: COLORS.buy }} />FPI net buy</span>
        <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: COLORS.sell }} />FPI net sell</span>
        {view === "net" && <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: COLORS.dii }} />DII net (NSE provisional)</span>}
        {view === "cum" && <><span><i className="inline-block w-3 h-0.5 mr-1 align-middle" style={{ background: COLORS.accent }} />cumulative (right axis)</span><span><i className="inline-block w-3 h-0.5 mr-1 align-middle border-t border-dashed" style={{ borderColor: "#f59e0b" }} />20D sum</span></>}
        <span className="text-slate-600">faded bar = provisional (NSDL not yet published)</span>
      </div>
      {data && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ProvenanceChip id="daily-fii" p={data.provenance.fii} />
          <ProvenanceChip id="daily-dii" p={data.provenance.dii} compact />
        </div>
      )}
    </div>
  );
};
