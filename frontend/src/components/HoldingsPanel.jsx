import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Search } from "lucide-react";
import { ProvenanceChip } from "./ProvenanceChip";
import { Empty, Segmented, Stat } from "./Primitives";
import { COLORS } from "@/lib/format";

const pp = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)} pp`);
const Spark = ({ vals }) => (
  <div className="w-20 h-6">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={vals.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" stroke={vals[vals.length - 1] >= vals[0] ? COLORS.buy : COLORS.sell} strokeWidth={1.2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const Row = ({ s, metric }) => {
  const v = s[metric];
  return (
    <tr data-testid={`holding-row-${s.symbol.toLowerCase()}`} className="border-t border-[color:var(--line)] hover:bg-white/[0.02]">
      <td className="py-1.5">
        <a href={s.source_url} target="_blank" rel="noreferrer" className="text-slate-100 font-medium hover:text-blue-300">{s.symbol}</a>
        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{s.name} · {s.industry}</div>
      </td>
      <td className="text-right font-mono text-slate-200">{s.fii_pct?.toFixed(2)}%</td>
      <td className="text-right font-mono text-slate-500">{s.fii_prev_pct?.toFixed(2)}%</td>
      <td className={`text-right font-mono font-semibold ${v > 0 ? "buy" : v < 0 ? "sell" : "text-slate-400"}`}>{pp(v)}</td>
      <td className="text-right font-mono text-slate-400">{s.consecutive_quarters > 0 ? `${s.consecutive_quarters}Q ↑` : s.consecutive_quarters < 0 ? `${-s.consecutive_quarters}Q ↓` : "—"}</td>
      <td className="pl-3"><Spark vals={s.fii_series.filter((x) => x != null)} /></td>
    </tr>
  );
};

const Table = ({ rows, metric, testId, title, cls }) => (
  <div data-testid={testId} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 p-3 overflow-x-auto min-w-0">
    <div className={`overline-label mb-2 ${cls}`}>{title}</div>
    <table className="w-full min-w-[520px] text-[11px]">
      <thead className="text-slate-500 text-left"><tr><th className="font-medium">Stock</th><th className="text-right font-medium">FII %</th><th className="text-right font-medium">Prev</th><th className="text-right font-medium">Δ</th><th className="text-right font-medium">Run</th><th className="pl-3 font-medium">8Q</th></tr></thead>
      <tbody>{rows.map((s) => <Row key={s.symbol} s={s} metric={metric} />)}</tbody>
    </table>
  </div>
);

export const HoldingsPanel = ({ data }) => {
  const [metric, setMetric] = useState("change_qoq_pp");
  const [q, setQ] = useState("");
  const stocks = useMemo(() => data?.stocks || [], [data?.stocks]);
  const sorted = useMemo(() => [...stocks].filter((s) => s[metric] != null).sort((a, b) => b[metric] - a[metric]), [stocks, metric]);
  const found = useMemo(() => (q ? stocks.filter((s) => (s.symbol + " " + s.name).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []), [stocks, q]);
  if (!data || !stocks.length) return <Empty testId="holdings-loading" label={`Loading NIFTY 100 shareholding filings… ${data?.progress || ""}`} />;
  const up = stocks.filter((s) => s[metric] > 0).length;
  const down = stocks.filter((s) => s[metric] < 0).length;
  const avg = stocks.reduce((a, s) => a + (s[metric] || 0), 0) / stocks.length;

  return (
    <div data-testid="holdings-panel" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat testId="holdings-quarter" label="Latest quarter" value={data.latest_quarter || "—"} cls="text-slate-100 text-base" sub={`${data.count} of NIFTY 100 loaded${data.status === "refreshing" && data.progress ? ` · fetching ${data.progress}` : ""}`} />
        <Stat testId="holdings-breadth" label={metric === "change_qoq_pp" ? "FII stake raised / trimmed (QoQ)" : "Raised / trimmed (YoY)"} value={`${up} / ${down}`} cls="text-slate-100" sub="stocks with higher vs lower FII %" />
        <Stat testId="holdings-avg" label="Avg change" value={pp(avg)} cls={avg > 0 ? "buy" : "sell"} sub="simple mean across universe (pp)" />
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
          <input data-testid="holdings-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a stock…" className="w-full h-full rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 pl-7 pr-2 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
        </div>
      </div>
      {found.length > 0 && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/[0.05] p-3 overflow-x-auto min-w-0">
          <table className="w-full min-w-[520px] text-[11px]"><tbody>{found.map((s) => <Row key={s.symbol} s={s} metric={metric} />)}</tbody></table>
        </div>
      )}
      <Segmented testPrefix="holdings-metric" value={metric} onChange={setMetric} options={[{ value: "change_qoq_pp", label: "Quarter on quarter" }, { value: "change_yoy_pp", label: "Year on year" }]} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
        <Table testId="holdings-top-increases" title="FII stake increased most" cls="text-emerald-400" rows={sorted.slice(0, 10)} metric={metric} />
        <Table testId="holdings-top-decreases" title="FII stake reduced most" cls="text-red-400" rows={sorted.slice(-10).reverse()} metric={metric} />
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">FII % = foreign institutional holding as a share of total equity from exchange shareholding filings. A change in % can also reflect promoter/other holders' actions or new issuance, not only FII trades.</p>
      <ProvenanceChip id="holdings" p={data.provenance} />
    </div>
  );
};
