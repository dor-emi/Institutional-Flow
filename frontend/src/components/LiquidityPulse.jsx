import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ProvenanceChip } from "./ProvenanceChip";
import { Empty, Stat } from "./Primitives";
import { fmtCr, fmtAbs, fmtDate, signClass } from "@/lib/format";

const zLabel = (z) => {
  if (z === null || z === undefined) return "insufficient history";
  const a = Math.abs(z);
  const strength = a >= 2 ? "extreme" : a >= 1 ? "strong" : a >= 0.5 ? "moderate" : "typical";
  return `${strength} vs past year of 20D sums`;
};

export const LiquidityPulse = ({ stats }) => {
  if (!stats) return <Empty testId="pulse-loading" />;
  const f = stats.fii;
  const p = stats.provisional_latest;
  const Icon = f?.streak_direction === "buying" ? TrendingUp : f?.streak_direction === "selling" ? TrendingDown : Minus;
  return (
    <div data-testid="liquidity-pulse" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div data-testid="pulse-streak" className={`col-span-2 rounded-md border p-3 flex items-center gap-4 ${f?.streak_direction === "buying" ? "border-emerald-500/30 bg-emerald-500/[0.06]" : f?.streak_direction === "selling" ? "border-red-500/30 bg-red-500/[0.06]" : "border-[color:var(--line)]"}`}>
          <div className={`w-11 h-11 rounded-md grid place-items-center ${f?.streak_direction === "buying" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0">
            <div className="overline-label">FPI equity streak (confirmed)</div>
            <div className="font-display text-xl md:text-2xl font-bold text-slate-50 leading-tight">
              {f ? `${f.streak_days} day${f.streak_days === 1 ? "" : "s"} of net ${f.streak_direction}` : "—"}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">last confirmed {fmtDate(f?.last_date)} · net {fmtCr(f?.last_net)}</div>
          </div>
        </div>
        <Stat testId="pulse-nse-fii" label={`NSE provisional FII · ${fmtDate(p?.date, "DD MMM")}`} value={fmtCr(p?.fii_net)} cls={signClass(p?.fii_net)} sub={`buy ${fmtAbs(p?.fii_buy)} · sell ${fmtAbs(p?.fii_sell)}`} />
        <Stat testId="pulse-nse-dii" label={`NSE provisional DII · ${fmtDate(p?.date, "DD MMM")}`} value={fmtCr(p?.dii_net)} cls={p?.dii_net > 0 ? "text-cyan-300" : "sell"} sub={`20D DII net ${fmtCr(stats.dii_sum_20d)} (${stats.dii_days_available}d avail.)`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat testId="pulse-sum-5d" label="5D net" value={fmtCr(f?.sum_5d)} cls={signClass(f?.sum_5d)} />
        <Stat testId="pulse-sum-20d" label="20D net" value={fmtCr(f?.sum_20d)} cls={signClass(f?.sum_20d)} sub={`${f?.buy_days_20d ?? "—"} buy · ${f?.sell_days_20d ?? "—"} sell days`} />
        <Stat testId="pulse-sum-60d" label="60D net" value={fmtCr(f?.sum_60d)} cls={signClass(f?.sum_60d)} />
        <Stat testId="pulse-zscore" label="20D z-score" value={f?.zscore_20d ?? "—"} cls={signClass(f?.zscore_20d)} sub={zLabel(f?.zscore_20d)} />
        <Stat testId="pulse-intensity" label="Net / gross 20D" value={f?.net_to_gross_20d_pct != null ? `${f.net_to_gross_20d_pct}%` : "—"} cls={signClass(f?.net_to_gross_20d_pct)} sub="one-directionality of trading" />
        <Stat testId="pulse-stdev" label="Daily σ (120D)" value={fmtAbs(f?.daily_stdev_120d)} sub="typical daily swing" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <ProvenanceChip id="pulse-fii" p={stats.provenance.fii} compact />
        <ProvenanceChip id="pulse-dii" p={stats.provenance.dii} compact />
      </div>
    </div>
  );
};
