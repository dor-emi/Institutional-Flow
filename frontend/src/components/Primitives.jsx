export const Panel = ({ title, subtitle, right, children, testId, className = "", accent }) => (
  <section data-testid={testId} className={`panel grain p-4 md:p-5 flex flex-col gap-4 min-w-0 ${className}`}>
    {(title || right) && (
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {accent && <div className="overline-label mb-1" style={{ color: accent }}>{accent === "#3b82f6" ? "" : ""}</div>}
          {title && <h2 className="font-display text-base md:text-lg font-semibold tracking-tight text-slate-100 leading-tight">{title}</h2>}
          {subtitle && <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-2 flex-wrap justify-end">{right}</div>}
      </header>
    )}
    {children}
  </section>
);

export const Segmented = ({ options, value, onChange, testPrefix }) => (
  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/60">
    {options.map((o) => (
      <button
        key={o.value}
        data-testid={`${testPrefix}-${o.value}`}
        data-active={value === o.value}
        className="seg-btn"
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Empty = ({ label = "Waiting for source data…", testId }) => (
  <div data-testid={testId} className="flex items-center justify-center h-40 text-xs text-slate-500 font-mono">
    <span className="pulse-dot mr-2 inline-block w-1.5 h-1.5 rounded-full bg-blue-400" /> {label}
  </div>
);

export const ChartTooltip = ({ active, payload, label, rows }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-[color:var(--line-hi)] bg-[#0b0f17]/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="font-mono text-slate-400 mb-1">{label}</div>
      {rows(d).map((r) => (
        <div key={r.k} className="flex justify-between gap-6">
          <span className="text-slate-400">{r.k}</span>
          <span className={`font-mono ${r.cls || "text-slate-100"}`}>{r.v}</span>
        </div>
      ))}
    </div>
  );
};

export const Stat = ({ label, value, sub, cls = "", testId }) => (
  <div data-testid={testId} className="flex flex-col gap-1 rounded-md border border-[color:var(--line)] bg-[color:var(--void)]/40 px-3 py-2.5">
    <span className="overline-label">{label}</span>
    <span className={`font-mono text-lg md:text-xl font-semibold tracking-tight ${cls}`}>{value}</span>
    {sub && <span className="text-[11px] text-slate-500 leading-snug">{sub}</span>}
  </div>
);
