import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, LabelList, Cell } from "recharts";
import { ProvenanceChip } from "./ProvenanceChip";
import { Empty, Segmented } from "./Primitives";
import { fmtCr, fmtPct, shortDate, COLORS } from "@/lib/format";

const SHORT = {
  "Automobile and Auto Components": "Auto", "Information Technology": "IT", "Fast Moving Consumer Goods": "FMCG", "Metals & Mining": "Metals",
  "Media, Entertainment & Publication": "Media", "Financial Services": "Fin Svcs", "Oil, Gas & Consumable Fuels": "Oil & Gas", "Consumer Durables": "Cons Dur",
  "Consumer Services": "Cons Svcs", "Capital Goods": "Cap Goods", "Construction Materials": "Cement", "Telecommunication": "Telecom",
};
const short = (s) => SHORT[s] || s;

export const quadrant = (flow, ret) => {
  if (flow == null || ret == null) return null;
  if (flow >= 0 && ret >= 0) return { key: "accum", label: "Inflow · price up", cls: "text-emerald-300", color: COLORS.buy };
  if (flow >= 0 && ret < 0) return { key: "buyweak", label: "Inflow · price down", cls: "text-cyan-300", color: COLORS.dii };
  if (flow < 0 && ret >= 0) return { key: "sellstr", label: "Outflow · price up", cls: "text-amber-300", color: COLORS.amber };
  return { key: "dist", label: "Outflow · price down", cls: "text-red-300", color: COLORS.sell };
};

const RotTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const q = quadrant(d.flow_intensity_pct, d.index_return_pct);
  return (
    <div className="rounded-md border border-[color:var(--line-hi)] bg-[#0b0f17]/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-100 font-medium">{d.sector}</div>
      <div className="font-mono text-slate-500 text-[10px]">{shortDate(d.start)}–{shortDate(d.end)} · {d.index_name} {d.match === "approx" ? "(approx)" : ""}</div>
      <div className="mt-1 flex justify-between gap-6"><span className="text-slate-400">Net flow</span><span className={`font-mono ${d.net_equity >= 0 ? "buy" : "sell"}`}>{fmtCr(d.net_equity)}</span></div>
      <div className="flex justify-between gap-6"><span className="text-slate-400">Flow / AUC</span><span className="font-mono">{fmtPct(d.flow_intensity_pct)}</span></div>
      <div className="flex justify-between gap-6"><span className="text-slate-400">Index return</span><span className="font-mono">{fmtPct(d.index_return_pct)}</span></div>
      {q && <div className={`mt-1 ${q.cls}`}>{q.label}</div>}
    </div>
  );
};

export const SectorRotation = ({ data }) => {
  const [trail, setTrail] = useState(3);
  const [fnIdx, setFnIdx] = useState(null);
  const fns = useMemo(() => data?.fortnights || [], [data?.fortnights]);
  const sel = fnIdx ?? fns.length - 1;

  const series = useMemo(() => {
    if (!fns.length) return [];
    const bySector = {};
    for (let i = Math.max(0, sel - trail + 1); i <= sel; i++) {
      const f = fns[i];
      for (const r of f.rows) {
        if (r.index_return_pct == null || r.flow_intensity_pct == null) continue;
        (bySector[r.sector] ||= []).push({ ...r, start: f.start, end: f.end, latest: i === sel, label: i === sel ? short(r.sector) : "" });
      }
    }
    const list = Object.entries(bySector).map(([sector, pts]) => ({ sector, pts }));
    const lastPts = list.map((s) => s.pts[s.pts.length - 1]);
    const maxY = Math.max(...lastPts.map((p) => Math.abs(p.flow_intensity_pct)), 0.01);
    const maxX = Math.max(...lastPts.map((p) => Math.abs(p.index_return_pct)), 0.01);
    const ranked = [...lastPts].sort((a, b) => Math.hypot(b.flow_intensity_pct / maxY, b.index_return_pct / maxX) - Math.hypot(a.flow_intensity_pct / maxY, a.index_return_pct / maxX)).slice(0, 10);
    const kept = [];
    for (const p of ranked) {
      const clash = kept.some((k) => Math.hypot((k.flow_intensity_pct - p.flow_intensity_pct) / maxY, (k.index_return_pct - p.index_return_pct) / maxX) < 0.09);
      if (!clash) kept.push(p);
    }
    const keptNames = kept.map((p) => p.sector);
    for (const s of list) {
      const last = s.pts[s.pts.length - 1];
      if (!keptNames.includes(s.sector)) last.label = "";
    }
    return list;
  }, [fns, sel, trail]);

  if (!fns.length) return <Empty testId="rotation-loading" label="Fetching NSE sectoral index history…" />;
  const cur = fns[sel];
  const unmapped = cur.rows.filter((r) => !r.index_name);

  return (
    <div data-testid="sector-rotation" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented testPrefix="rotation-fn" value={String(sel)} onChange={(v) => setFnIdx(Number(v))} options={fns.slice(-6).map((f, i) => ({ value: String(fns.length - Math.min(6, fns.length) + i), label: `${shortDate(f.start)}–${shortDate(f.end)}` }))} />
        <Segmented testPrefix="rotation-trail" value={String(trail)} onChange={(v) => setTrail(Number(v))} options={[{ value: "1", label: "No trail" }, { value: "3", label: "3 FN trail" }, { value: "6", label: "6 FN trail" }]} />
      </div>
      <div data-testid="rotation-chart" className="h-[420px] relative">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none text-[10px] font-mono uppercase tracking-widest p-8 pl-14 pb-10">
          <div className="text-cyan-500/50">inflow · price down</div>
          <div className="text-right text-emerald-500/50">inflow · price up</div>
          <div className="self-end text-red-500/50">outflow · price down</div>
          <div className="self-end text-right text-amber-500/50">outflow · price up</div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 20, left: 12 }}>
            <CartesianGrid stroke="#1b2233" />
            <XAxis type="number" dataKey="index_return_pct" name="Index return" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} label={{ value: "sector index return over fortnight (%)", position: "bottom", offset: 4, fill: "#64748b", fontSize: 10 }} />
            <YAxis type="number" dataKey="flow_intensity_pct" name="Flow / AUC" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={66} label={{ value: "FPI net flow ÷ sector AUC (%)", angle: -90, position: "insideLeft", offset: 0, fill: "#64748b", fontSize: 10 }} />
            <ReferenceLine x={0} stroke="#334155" /><ReferenceLine y={0} stroke="#334155" />
            <Tooltip content={<RotTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            {series.map(({ sector, pts }) => {
              const last = pts[pts.length - 1];
              const q = quadrant(last.flow_intensity_pct, last.index_return_pct);
              return (
                <Scatter key={sector} data={pts} line={pts.length > 1 ? { stroke: q.color, strokeWidth: 1, strokeOpacity: 0.35 } : false} lineType="joint" isAnimationActive={false} shape="circle">
                  {pts.map((p, i) => <Cell key={i} fill={q.color} fillOpacity={p.latest ? 0.95 : 0.25} r={p.latest ? 6 : 3} />)}
                  <LabelList dataKey="label" position="right" offset={8} style={{ fill: "#cbd5e1", fontSize: 10, fontFamily: "IBM Plex Sans" }} />
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table data-testid="rotation-table" className="w-full min-w-[720px] text-[11px]">
          <thead className="text-slate-500 text-left">
            <tr><th className="py-1 font-medium">Sector</th><th className="font-medium">Index</th><th className="text-right font-medium">Net flow</th><th className="text-right font-medium">Flow / AUC</th><th className="text-right font-medium">Index return</th><th className="font-medium pl-3">Read</th></tr>
          </thead>
          <tbody>
            {[...cur.rows].filter((r) => r.index_name).sort((a, b) => (b.flow_intensity_pct ?? -99) - (a.flow_intensity_pct ?? -99)).map((r) => {
              const q = quadrant(r.flow_intensity_pct, r.index_return_pct);
              return (
                <tr key={r.sector} data-testid={`rotation-row-${r.sector.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className="border-t border-[color:var(--line)] hover:bg-white/[0.02]">
                  <td className="py-1.5 text-slate-200">{r.sector}</td>
                  <td className="text-slate-400">{r.index_name} {r.match === "approx" && <span className="chip text-amber-300/80 border-amber-500/20 ml-1">approx</span>}</td>
                  <td className={`text-right font-mono ${r.net_equity >= 0 ? "buy" : "sell"}`}>{fmtCr(r.net_equity)}</td>
                  <td className="text-right font-mono text-slate-300">{fmtPct(r.flow_intensity_pct)}</td>
                  <td className={`text-right font-mono ${r.index_return_pct >= 0 ? "text-slate-200" : "text-slate-400"}`}>{fmtPct(r.index_return_pct)}</td>
                  <td className={`pl-3 ${q?.cls || "text-slate-500"}`}>{q?.label || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {unmapped.length > 0 && <div className="text-[10px] font-mono text-slate-600 mt-2">no NSE sector index: {unmapped.map((r) => r.sector).join(", ")} — flows shown in Ranked/Heatmap tabs only</div>}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">Quadrant labels describe what happened in the same fortnight (where FPI money went vs how the sector index moved). They are descriptive — not signals. Only the sectors farthest from the origin are labelled (overlapping labels hidden); hover any dot for details.</p>
      {data && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ProvenanceChip id="rotation-flows" p={data.provenance.flows} compact />
          <ProvenanceChip id="rotation-index" p={data.provenance.index} compact />
        </div>
      )}
    </div>
  );
};
