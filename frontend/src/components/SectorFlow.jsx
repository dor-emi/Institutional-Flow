import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Legend } from "recharts";
import { Download } from "lucide-react";
import { ProvenanceChip } from "./ProvenanceChip";
import { ChartTooltip, Empty, Segmented, Stat } from "./Primitives";
import { fmtCr, fmtAbs, fmtDate, fmtPct, shortDate, signClass, COLORS } from "@/lib/format";
import { exportSectorsUrl } from "@/lib/api";
import { SectorRotation } from "./SectorRotation";

const WINDOWS = [
  { value: "net_equity_latest", label: "Latest FN" }, { value: "net_equity_3fn", label: "3 FN (~6W)" }, { value: "net_equity_6fn", label: "6 FN (~3M)" }, { value: "net_equity_all", label: "All loaded" },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
const heat = (v, max) => {
  if (v === null || v === undefined || !max) return "transparent";
  const a = Math.min(1, Math.abs(v) / max);
  return v >= 0 ? `rgba(16,185,129,${0.08 + a * 0.75})` : `rgba(239,68,68,${0.08 + a * 0.75})`;
};

const RankedBars = ({ sectors, metric }) => {
  const data = [...sectors].filter((s) => s[metric] != null).sort((a, b) => b[metric] - a[metric]);
  return (
    <div data-testid="sector-bar-chart" style={{ height: Math.max(360, data.length * 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#1b2233" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="sector" width={210} tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke="#334155" />
          <Tooltip content={<ChartTooltip rows={(d) => [{ k: "Net flow", v: fmtCr(d[metric]), cls: d[metric] >= 0 ? "buy" : "sell" }, { k: "Equity AUC", v: fmtAbs(d.auc_equity) }, { k: "AUC weight", v: fmtPct(d.auc_weight_pct, 1).replace("+", "") }, { k: "Intensity (latest FN)", v: fmtPct(d.flow_intensity_pct, 2) }, { k: "Streak", v: `${d.streak_periods} FN ${d.streak_direction || ""}` }]} />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
          <Bar dataKey={metric} isAnimationActive={false} maxBarSize={14} radius={[0, 2, 2, 0]}>
            {data.map((s) => <Cell key={s.sector} data-testid={`sector-card-${slug(s.sector)}`} fill={s[metric] >= 0 ? COLORS.buy : COLORS.sell} fillOpacity={0.8} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const Heatmap = ({ sectors, fortnights, mode }) => {
  const vals = sectors.flatMap((s) => s.history.map((h) => (mode === "intensity" ? (h.net_equity != null && h.auc_equity ? (h.net_equity / h.auc_equity) * 100 : null) : h.net_equity)));
  const max = Math.max(...vals.filter((v) => v != null).map(Math.abs), 1);
  const ordered = [...sectors].sort((a, b) => (b.auc_equity || 0) - (a.auc_equity || 0));
  return (
    <div data-testid="sector-heatmap" className="overflow-x-auto">
      <table className="w-full text-[11px] border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="text-left font-medium text-slate-400 pr-2 sticky left-0 bg-[#0f131c]">Sector (by AUC)</th>
            {fortnights.map((f) => <th key={f.end} className="font-mono font-normal text-slate-500 text-[9px] px-1 whitespace-nowrap">{shortDate(f.start)}–{shortDate(f.end)}</th>)}
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => (
            <tr key={s.sector} data-testid={`heatmap-row-${slug(s.sector)}`}>
              <td className="text-slate-300 pr-2 whitespace-nowrap sticky left-0 bg-[#0f131c]">{s.sector} <span className="text-slate-600 font-mono">{s.auc_weight_pct != null ? `${s.auc_weight_pct.toFixed(1)}%` : ""}</span></td>
              {s.history.map((h) => {
                const v = mode === "intensity" ? (h.net_equity != null && h.auc_equity ? (h.net_equity / h.auc_equity) * 100 : null) : h.net_equity;
                return (
                  <td key={h.end} className="text-center font-mono text-[10px] rounded-sm h-6 min-w-[52px]" style={{ background: heat(v, max), color: v != null && Math.abs(v) / max > 0.5 ? "#f8fafc" : "#94a3b8" }} title={`${s.sector} · ${h.start} → ${h.end}: ${fmtCr(h.net_equity)}`}>
                    {v == null ? "—" : mode === "intensity" ? `${v.toFixed(1)}%` : (v / 1000).toFixed(1) + "k"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] font-mono text-slate-600 mt-2">{mode === "intensity" ? "cell = fortnight net flow ÷ sector equity AUC at period end (%)" : "cell = fortnight net FPI equity investment, ₹ thousand Cr"}</div>
    </div>
  );
};

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

const TrendLines = ({ sectors, fortnights }) => {
  const top = [...sectors].sort((a, b) => Math.abs(b.net_equity_6fn) - Math.abs(a.net_equity_6fn)).slice(0, 6);
  const data = fortnights.map((f, i) => {
    const row = { end: f.end, label: `${shortDate(f.start)}–${shortDate(f.end)}` };
    top.forEach((s) => {
      const cum = s.history.slice(0, i + 1).reduce((a, h) => a + (h.net_equity || 0), 0);
      row[s.sector] = Math.round(cum);
    });
    return row;
  });
  return (
    <div data-testid="sector-trend-chart">
      <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1b2233" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
          <ReferenceLine y={0} stroke="#334155" />
          <Tooltip content={<ChartTooltip rows={(d) => top.map((s) => ({ k: s.sector, v: fmtCr(d[s.sector]), cls: d[s.sector] >= 0 ? "buy" : "sell" }))} />} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
          {top.map((s, i) => <Line key={s.sector} type="monotone" dataKey={s.sector} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.6} dot={{ r: 2 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <div className="text-[10px] font-mono text-slate-600 mt-2">cumulative net FPI equity flow over loaded fortnights — 6 sectors with largest absolute 3-month flow</div>
    </div>
  );
};

export const SectorFlow = ({ data, rotation }) => {
  const [tab, setTab] = useState("bar");
  const [metric, setMetric] = useState("net_equity_latest");
  const [heatMode, setHeatMode] = useState("abs");
  const sectors = useMemo(() => (data?.sectors || []).filter((s) => s.sector !== "Sovereign"), [data]);
  if (!data || !sectors.length) return <Empty testId="sector-loading" label="Fetching NSDL fortnightly sector reports…" />;

  const inflow = sectors.filter((s) => s.net_equity_latest > 0).sort((a, b) => b.net_equity_latest - a.net_equity_latest);
  const outflow = sectors.filter((s) => s.net_equity_latest < 0).sort((a, b) => a.net_equity_latest - b.net_equity_latest);
  const persistentBuy = sectors.filter((s) => s.streak_direction === "buying" && s.streak_periods >= 3).sort((a, b) => b.streak_periods - a.streak_periods);
  const persistentSell = sectors.filter((s) => s.streak_direction === "selling" && s.streak_periods >= 3).sort((a, b) => b.streak_periods - a.streak_periods);
  const L = data.latest;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat testId="sector-total-net" label={`FPI equity net · ${fmtDate(L.start, "DD MMM")}–${fmtDate(L.end, "DD MMM")}`} value={fmtCr(L.total_net_equity)} cls={signClass(L.total_net_equity)} sub={`equity AUC ${fmtAbs(L.total_auc_equity)}`} />
        <Stat testId="sector-top-inflow" label="Largest inflow" value={inflow[0]?.sector || "—"} cls="text-emerald-300 text-base" sub={inflow[0] ? `${fmtCr(inflow[0].net_equity_latest)} · ${fmtPct(inflow[0].flow_intensity_pct)} of AUC` : "no sector had net inflow"} />
        <Stat testId="sector-top-outflow" label="Largest outflow" value={outflow[0]?.sector || "—"} cls="text-red-300 text-base" sub={outflow[0] ? `${fmtCr(outflow[0].net_equity_latest)} · ${fmtPct(outflow[0].flow_intensity_pct)} of AUC` : "no sector had net outflow"} />
        <Stat testId="sector-breadth" label="Breadth" value={`${inflow.length} in / ${outflow.length} out`} cls="text-slate-100" sub={`persistent (≥3 FN): ${persistentBuy.length} buying · ${persistentSell.length} selling`} />
      </div>

      {(persistentBuy.length > 0 || persistentSell.length > 0) && (
        <div data-testid="sector-persistence" className="flex flex-wrap gap-2 text-[11px]">
          {persistentBuy.map((s) => <span key={s.sector} className="chip text-emerald-300 border-emerald-500/30 bg-emerald-500/10">{s.sector} · {s.streak_periods} FN buying</span>)}
          {persistentSell.map((s) => <span key={s.sector} className="chip text-red-300 border-red-500/30 bg-red-500/10">{s.sector} · {s.streak_periods} FN selling</span>)}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented testPrefix="sector-flow-tab" value={tab} onChange={setTab} options={[{ value: "bar", label: "Ranked" }, { value: "heatmap", label: "Heatmap" }, { value: "rotation", label: "Rotation map" }, { value: "trend", label: "Trend" }]} />
        <div className="flex items-center gap-2">
          {tab === "bar" && <Segmented testPrefix="sector-window" value={metric} onChange={setMetric} options={WINDOWS} />}
          {tab === "heatmap" && <Segmented testPrefix="sector-heat-mode" value={heatMode} onChange={setHeatMode} options={[{ value: "abs", label: "₹ Cr" }, { value: "intensity", label: "% of AUC" }]} />}
          <a data-testid="export-sectors-csv-button" href={exportSectorsUrl()} className="seg-btn border-[color:var(--line)] flex items-center gap-1.5"><Download size={12} /> CSV</a>
        </div>
      </div>

      {tab === "bar" && <RankedBars sectors={sectors} metric={metric} />}
      {tab === "heatmap" && <Heatmap sectors={sectors} fortnights={data.fortnights} mode={heatMode} />}
      {tab === "rotation" && <SectorRotation data={rotation} />}
      {tab === "trend" && <TrendLines sectors={sectors} fortnights={data.fortnights} />}

      <ProvenanceChip id="sectors" p={data.provenance} />
    </div>
  );
};
