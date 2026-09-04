import dayjs from "dayjs";

export const fmtCr = (v, opts = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = opts.signed === false ? (v < 0 ? "−" : "") : v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  const digits = opts.digits ?? (abs >= 10000 ? 0 : abs >= 100 ? 0 : 1);
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })} Cr`;
};

export const fmtAbs = (v) => fmtCr(v, { signed: false });

export const fmtNum = (v, digits = 0) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

export const fmtPct = (v, digits = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
};

export const fmtDate = (d, f = "DD MMM YYYY") => (d ? dayjs(d).format(f) : "—");
export const fmtTime = (iso) => (iso ? dayjs(iso).format("DD MMM, HH:mm") : "—");
export const shortDate = (d) => dayjs(d).format("DD MMM");

export const signClass = (v) => (v > 0 ? "buy" : v < 0 ? "sell" : "text-slate-400");
export const COLORS = { buy: "#10b981", sell: "#ef4444", dii: "#06b6d4", accent: "#3b82f6", amber: "#f59e0b", muted: "#64748b" };
