import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Empty } from "./Primitives";
import { fmtNum, fmtPct, COLORS } from "@/lib/format";

const IndexTile = ({ idx }) => {
  const isVix = idx.key === "INDIAVIX";
  const up = (idx.change_pct ?? 0) >= 0;
  const color = isVix ? COLORS.amber : up ? COLORS.buy : COLORS.sell;
  const spark = idx.series.slice(-60);
  return (
    <div data-testid={`index-tile-${idx.key.toLowerCase()}`} className="relative rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 p-3 overflow-hidden group">
      <div className="absolute inset-x-0 bottom-0 h-14 opacity-60"><ResponsiveContainer width="100%" height="100%"><AreaChart data={spark} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}><defs><linearGradient id={`g-${idx.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="close" stroke={color} strokeWidth={1.2} fill={`url(#g-${idx.key})`} isAnimationActive={false} dot={false} /></AreaChart></ResponsiveContainer></div>
      <div className="relative"><div className="flex items-center justify-between"><span className="overline-label">{idx.name}</span><span className="text-[10px] font-mono text-slate-600">{idx.symbol}</span></div><div className="mt-1 flex flex-wrap items-baseline gap-x-2"><span data-testid={`index-value-${idx.key.toLowerCase()}`} className="font-mono text-lg sm:text-xl md:text-2xl font-semibold text-slate-50">{idx.latest ? fmtNum(idx.latest.close, 2) : "—"}</span><span className={`font-mono text-xs ${isVix ? "text-amber-400" : up ? "buy" : "sell"}`}>{fmtPct(idx.change_pct)}</span></div><div className="mt-1 flex gap-3 text-[10px] font-mono text-slate-500"><span>5D <b className="text-slate-300">{fmtPct(idx.returns?.["5d"], 1)}</b></span><span>20D <b className="text-slate-300">{fmtPct(idx.returns?.["20d"], 1)}</b></span><span>1Y <b className="text-slate-300">{fmtPct(idx.returns?.["1y"], 1)}</b></span></div></div>
    </div>
  );
};

export const IndicesStrip = ({ data }) => {
  if (!data) return <Empty testId="indices-loading" />;
  return <div data-testid="indices-strip" className="grid grid-cols-2 lg:grid-cols-4 gap-3">{data.indices.map((i) => <IndexTile key={i.key} idx={i} />)}</div>;
};
