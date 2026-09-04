import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";

const Row = ({ k, v }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 py-2 border-b border-[color:var(--line)] last:border-0 text-xs">
    <span className="font-mono text-slate-400">{k}</span>
    <span className="text-slate-300 leading-relaxed">{v}</span>
  </div>
);

export const MethodologyDialog = ({ trigger }) => (
  <Dialog>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent data-testid="methodology-dialog" className="max-w-2xl bg-[#0f131c] border-[color:var(--line-hi)] text-slate-200 max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display">Data sources & methodology</DialogTitle>
        <DialogDescription className="text-slate-400 text-xs">Every figure is fetched live from a public source and cached. Nothing is estimated or hand-entered.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <div>
          <div className="overline-label mb-1">Sources</div>
          <Row k="NSDL daily" v="Daily Trends in FPI Investments (custodian-confirmed, published T+1). Equity Sub-total = stock exchange + primary market & others. Used as the confirmed FII/FPI series." />
          <Row k="NSE provisional" v="FII/FPI & DII trading activity compiled by exchanges from trading members on T day. Only source for DII. May differ from NSDL. Recent history mirrored via Groww where NSE only publishes the latest day; those rows are labelled accordingly." />
          <Row k="NSDL sectors" v="Fortnightly Sector-wise FPI Investment: net investment (₹ Cr) and Assets Under Custody per BSE industry classification (22 sectors + Sovereign + Others). Only the FPI equity column is used." />
          <Row k="Indices" v="NIFTY 50 (^NSEI), NIFTY 500 (^CRSLDX), NIFTY Bank (^NSEBANK), India VIX (^INDIAVIX) EOD via Yahoo Finance." />
          <Row k="Sector indices" v="NSE historical index data for NIFTY Auto, IT, FMCG, Metal, Realty, Media, Financial Services, Healthcare, Oil & Gas, Consumer Durables, Chemicals (exact BSE-sector matches) and India Consumption, Services Sector, Energy, Infrastructure (approximate matches, flagged). Telecom, Textiles, Construction Materials, Diversified, Forest Materials, Utilities have no index." />
          <Row k="Holdings" v="Screener.in quarterly shareholding tables (FIIs %, DIIs %, Promoters %) compiled from BSE/NSE filings, for the NIFTY 100 constituent list published by NSE. Refreshed daily." />
          <Row k="Bulk/block deals" v="NSE bulk (≥0.5% of equity) and block deal disclosures. A deal is tagged 'likely FPI' when the client name matches foreign-domicile / global-manager patterns (e.g. Pte, Mauritius, Goldman Sachs, Société Générale, Norges); Indian mutual funds, insurers, LLPs and private companies are excluded. This is a heuristic on a partial dataset." />
        </div>
        <div>
          <div className="overline-label mb-1">Calculations</div>
          <Row k="Streak" v="Consecutive trading days (or fortnights) with the same sign of net flow, counted back from the latest data point." />
          <Row k="5D / 20D / 60D" v="Simple rolling sums of confirmed daily net equity flow." />
          <Row k="20D z-score" v="(Latest 20-day sum − mean of historical 20-day sums) ÷ their standard deviation, over up to ~230 prior trading days. Shown only when ≥40 days of history exist." />
          <Row k="Net/Gross" v="20-day net flow ÷ 20-day gross (buy+sell) turnover. Higher magnitude = more one-directional trading." />
          <Row k="Flow intensity" v="Sector fortnight net investment ÷ sector equity AUC at start of fortnight, in %. Normalises flow by sector size." />
          <Row k="Rotation map" v="Each sector is plotted by flow intensity (y) against its mapped NSE sector index return over the same fortnight (x: close on fortnight end ÷ close on the day before it starts − 1). Trails join the last N fortnights. Quadrants describe what coincided; they are not signals." />
          <Row k="Alerts" v="User-defined thresholds evaluated in the browser against the latest loaded metrics (streaks, sums, z-score, VIX, sector flows). Saved in localStorage; nothing is sent to a server." />
          <Row k="Correlation" v="Pearson r between daily FII net flow and index % return: same-day, flow→next-day return, and prior-day return→flow. Descriptive only; small |r| is normal and no causality is implied." />
        </div>
        <div>
          <div className="overline-label mb-1">Limitations</div>
          <Row k="Lag" v="NSDL confirmed data lags by one business day; sector data is fortnightly with a few days of publication lag." />
          <Row k="Scope" v="Equity cash-market flows only. Derivatives, debt and hybrid flows are not part of the headline numbers." />
          <Row k="No advice" v="Institutional flows describe past positioning. They are not a forecast of index or stock direction, and this tool makes no recommendation." />
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
