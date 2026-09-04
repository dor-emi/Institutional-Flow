import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { fmtCr, fmtPct } from "@/lib/format";

const KEY = "fii-flow-alerts-v1";
const DEFAULTS = [
  { id: "d1", metric: "streak_selling", op: ">=", value: 5 },
  { id: "d2", metric: "zscore_abs", op: ">=", value: 2 },
];

export const METRICS = {
  streak_selling: { label: "Consecutive FPI net-selling days", unit: "days", fmt: (v) => `${v} d` },
  streak_buying: { label: "Consecutive FPI net-buying days", unit: "days", fmt: (v) => `${v} d` },
  zscore_abs: { label: "|20D z-score|", unit: "σ", fmt: (v) => `${v}σ` },
  zscore: { label: "20D z-score (signed)", unit: "σ", fmt: (v) => `${v}σ` },
  sum_5d: { label: "5D FPI net flow", unit: "₹ Cr", fmt: fmtCr },
  sum_20d: { label: "20D FPI net flow", unit: "₹ Cr", fmt: fmtCr },
  last_net: { label: "Latest confirmed FPI net", unit: "₹ Cr", fmt: fmtCr },
  dii_net: { label: "Latest DII net (NSE prov.)", unit: "₹ Cr", fmt: fmtCr },
  vix: { label: "India VIX close", unit: "", fmt: (v) => v?.toFixed(2) },
  nifty_5d: { label: "NIFTY 50 5-day return", unit: "%", fmt: (v) => fmtPct(v, 1) },
  sector_out: { label: "Any sector net outflow (latest FN) at or below", unit: "₹ Cr", fmt: fmtCr },
  sector_in: { label: "Any sector net inflow (latest FN) at or above", unit: "₹ Cr", fmt: fmtCr },
};

const cmp = (a, op, b) => (op === ">=" ? a >= b : a <= b);

export const evaluate = (rules, { stats, indices, sectors }) => {
  const f = stats?.fii;
  const vix = indices?.indices?.find((i) => i.key === "INDIAVIX")?.latest?.close;
  const n50 = indices?.indices?.find((i) => i.key === "NIFTY50")?.returns?.["5d"];
  const vals = {
    streak_selling: f?.streak_direction === "selling" ? f.streak_days : 0,
    streak_buying: f?.streak_direction === "buying" ? f.streak_days : 0,
    zscore_abs: f?.zscore_20d != null ? Math.abs(f.zscore_20d) : null,
    zscore: f?.zscore_20d, sum_5d: f?.sum_5d, sum_20d: f?.sum_20d, last_net: f?.last_net,
    dii_net: stats?.provisional_latest?.dii_net, vix, nifty_5d: n50,
  };
  const out = [];
  for (const r of rules) {
    const m = METRICS[r.metric];
    if (!m) continue;
    if (r.metric === "sector_out" || r.metric === "sector_in") {
      const hits = (sectors?.sectors || []).filter((s) => s.net_equity_latest != null && (r.metric === "sector_out" ? s.net_equity_latest <= -Math.abs(r.value) : s.net_equity_latest >= Math.abs(r.value)));
      if (hits.length) out.push({ rule: r, text: `${m.label} ${fmtCr(r.metric === "sector_out" ? -Math.abs(r.value) : Math.abs(r.value))}: ${hits.map((h) => `${h.sector} (${fmtCr(h.net_equity_latest)})`).join(", ")}`, tone: r.metric === "sector_out" ? "sell" : "buy" });
      continue;
    }
    const v = vals[r.metric];
    if (v == null) continue;
    if (cmp(v, r.op, r.value)) {
      const tone = ["streak_selling", "sector_out"].includes(r.metric) || (["sum_5d", "sum_20d", "last_net", "zscore"].includes(r.metric) && v < 0) || (r.metric === "vix") || (r.metric === "nifty_5d" && v < 0) ? "sell" : "buy";
      out.push({ rule: r, text: `${m.label} is ${m.fmt(v)} (rule: ${r.op} ${m.fmt(r.value)})`, tone });
    }
  }
  return out;
};

export const useAlertRules = () => {
  const [rules, setRules] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(saved) ? saved : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(rules)), [rules]);
  return [rules, setRules];
};

export const AlertsBanner = ({ triggered, count }) => {
  if (!triggered.length) return (
    <div data-testid="alerts-banner-none" className="flex items-center gap-2 text-[11px] text-slate-500 font-mono px-1">
      <Bell size={12} /> {count} alert rule{count === 1 ? "" : "s"} watching · none triggered right now
    </div>
  );
  return (
    <div data-testid="alerts-banner" className="rise rounded-md border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-red-200 mb-1.5"><BellRing size={14} className="pulse-dot" /> {triggered.length} alert{triggered.length === 1 ? "" : "s"} triggered</div>
      <ul className="space-y-1">
        {triggered.map((t, i) => (
          <li key={i} data-testid={`alert-hit-${t.rule.id}`} className={`text-xs font-mono ${t.tone === "sell" ? "text-red-300" : "text-emerald-300"}`}>• {t.text}</li>
        ))}
      </ul>
    </div>
  );
};

export const AlertsDialog = ({ rules, setRules, triggered, trigger }) => {
  const [metric, setMetric] = useState("streak_selling");
  const [op, setOp] = useState(">=");
  const [value, setValue] = useState("");
  const hitIds = useMemo(() => new Set(triggered.map((t) => t.rule.id)), [triggered]);
  const add = () => {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    setRules([...rules, { id: `r${Date.now()}`, metric, op, value: v }]);
    setValue("");
  };
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent data-testid="alerts-dialog" className="max-w-xl bg-[#0f131c] border-[color:var(--line-hi)] text-slate-200">
        <DialogHeader>
          <DialogTitle className="font-display">Flow alerts</DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">Rules are evaluated against the latest loaded data each time the dashboard refreshes and are saved in this browser.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} data-testid={`alert-rule-${r.id}`} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs ${hitIds.has(r.id) ? "border-red-500/40 bg-red-500/[0.08]" : "border-[color:var(--line)]"}`}>
              <span className="text-slate-200">{METRICS[r.metric]?.label} <span className="font-mono text-slate-400">{r.op} {METRICS[r.metric]?.fmt(r.value)}</span>{hitIds.has(r.id) && <span className="ml-2 chip text-red-300 border-red-500/30">triggered</span>}</span>
              <button data-testid={`alert-rule-delete-${r.id}`} onClick={() => setRules(rules.filter((x) => x.id !== r.id))} className="text-slate-500 hover:text-red-300 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
          {!rules.length && <div className="text-xs text-slate-500 font-mono">no rules yet</div>}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_64px_96px_auto] gap-2 items-center">
          <select data-testid="alert-metric-select" value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)] px-2 py-2 text-xs text-slate-200 focus:outline-none">
            {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select data-testid="alert-op-select" value={op} onChange={(e) => setOp(e.target.value)} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)] px-2 py-2 text-xs font-mono text-slate-200 focus:outline-none">
            <option value=">=">≥</option><option value="<=">≤</option>
          </select>
          <input data-testid="alert-value-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={METRICS[metric].unit || "value"} className="rounded-md border border-[color:var(--line)] bg-[color:var(--void)] px-2 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500/50" />
          <button data-testid="alert-add-button" onClick={add} className="seg-btn border-[color:var(--line)] flex items-center gap-1 h-full"><Plus size={12} /> Add</button>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">Alerts flag data conditions you chose to watch. They are not trading signals.</p>
      </DialogContent>
    </Dialog>
  );
};
