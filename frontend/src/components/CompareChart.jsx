import { useState } from "react";
import { CartesianGrid, ComposedChart, Line, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter, ScatterChart, ZAxis, ReferenceLine, Cell } from "recharts";
import { ChartTooltip, Empty, Segmented, InfoTip } from "./Primitives";
import { fmtCr, fmtPct, fmtNum, shortDate, COLORS } from "@/lib/format";

const INDICES = [
  { value: "NIFTY50", label: "NIFTY 50" }, { value: "NIFTY500", label: "NIFTY 500" }, { value: "NIFTYBANK", label: "NIFTY Bank" }, { value: "INDIAVIX", label: "India VIX" },
];

const rDesc = (r) => {
  if (r === null || r === undefined) return "n/a";
  const a = Math.abs(r);
  const s = a < 0.1 ? "negligible" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : "strong";
  return `${s} ${r > 0 ? "positive" : "negative"}`;
};

const CorrBadge = ({ c, testId }) => (
  <div data-testid={testId} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 px-3 py-2">
    <div className="text-[10px] text-slate-500 leading-snug">{c.label}<InfoTip>Measures the linear relationship between two variables. +1 means they move closely together, 0 means little linear relationship, and -1 means they tend to move in opposite directions. There is no universally “good” or “bad” value: strength and direction depend on what you are comparing. Correlation does not prove that one variable causes the other.</InfoTip></div>
    <div className="flex items-baseline gap-2 mt-0.5"><span className={`font-mono text-lg font-semibold ${c.r > 0 ? "buy" : c.r < 0 ? "sell" : "text-slate-400"}`}>{c.r ?? "—"}</span><span className="text-[10px] font-mono text-slate-500">r · n={c.n} · {rDesc(c.r)}</span></div>
  </div>
);

export const CompareChart = ({ data, index, onIndex, range }) => {
  const [mode, setMode] = useState("dual");
  const series = data?.series || [];
  const isVix = index === "INDIAVIX";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><Segmented testPrefix="compare-index" value={index} onChange={onIndex} options={INDICES} /><Segmented testPrefix="compare-mode" value={mode} onChange={setMode} options={[{ value: "dual", label: "Cumulative vs level" }, { value: "scatter", label: "Flow vs daily return" }]} /></div>
      {!series.length ? <Empty testId="compare-loading" /> : (
        <div data-testid="compare-chart" className="h-80"><ResponsiveContainer width="100%" height="100%">{mode === "dual" ? <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="#1b2233" vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={40} /><YAxis yAxisId="l" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} /><YAxis yAxisId="r" orientation="right" domain={["auto", "auto"]} tick={{ fill: isVix ? COLORS.amber : "#e2e8f0", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={52} /><Tooltip content={<ChartTooltip rows={(d) => [{ k: "FPI net", v: fmtCr(d.fii_net), cls: d.fii_net >= 0 ? "buy" : "sell" }, { k: "FPI cumulative", v: fmtCr(d.fii_cum), cls: "text-blue-300" }, { k: `${data.index_name} close`, v: fmtNum(d.close, 2) }, { k: "Day return", v: fmtPct(d.ret_pct) }]} />} /><ReferenceLine yAxisId="l" y={0} stroke="#334155" /><Bar yAxisId="l" dataKey="fii_net" isAnimationActive={false} maxBarSize={10}>{series.map((s) => <Cell key={s.date} fill={s.fii_net >= 0 ? COLORS.buy : COLORS.sell} fillOpacity={0.45} />)}</Bar><Line yAxisId="l" type="monotone" dataKey="fii_cum" stroke={COLORS.accent} strokeWidth={1.8} dot={false} isAnimationActive={false} /><Line yAxisId="r" type="monotone" dataKey="close" stroke={isVix ? COLORS.amber : "#e2e8f0"} strokeWidth={1.6} dot={false} isAnimationActive={false} /></ComposedChart> : <ScatterChart margin={{ top: 8, right: 8, bottom: 18, left: 0 }}><CartesianGrid stroke="#1b2233" /><XAxis dataKey="fii_net" type="number" name="FPI net" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} label={{ value: "FPI net flow (₹ Cr)", position: "bottom", offset: 2, fill: "#64748b", fontSize: 10 }} /><YAxis dataKey="ret_pct" type="number" name="Return" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} /><ZAxis range={[30, 30]} /><ReferenceLine x={0} stroke="#334155" /><ReferenceLine y={0} stroke="#334155" /><Tooltip content={<ChartTooltip rows={(d) => [{ k: "Date", v: d.date }, { k: "FPI net", v: fmtCr(d.fii_net), cls: d.fii_net >= 0 ? "buy" : "sell" }, { k: `${data.index_name} return`, v: fmtPct(d.ret_pct) }]} />} cursor={{ strokeDasharray: "3 3" }} /><Scatter data={series.filter((s) => s.ret_pct != null && s.fii_net != null)} isAnimationActive={false}>{series.filter((s) => s.ret_pct != null && s.fii_net != null).map((s) => <Cell key={s.date} fill={s.fii_net >= 0 ? COLORS.buy : COLORS.sell} fillOpacity={0.7} />)}</Scatter></ScatterChart>}</ResponsiveContainer></div>
      )}
      {data && <><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><CorrBadge testId="corr-same-day" c={data.correlation.same_day} /><CorrBadge testId="corr-flow-leads" c={data.correlation.flow_leads_return} /><CorrBadge testId="corr-return-leads" c={data.correlation.return_leads_flow} /></div></>}
    </div>
  );
};
