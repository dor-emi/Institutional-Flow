import re
from datetime import datetime, date
from io import StringIO

import pandas as pd

from .http import session, num

BASE = "https://www.fpi.nsdl.co.in/web"
ARCHIVE_URL = f"{BASE}/Reports/Archive.aspx"
LATEST_URL = f"{BASE}/Reports/Latest.aspx"
SECTOR_LIST_URL = f"{BASE}/Reports/FPI_Fortnightly_Selection.aspx"


def _hidden(html, name):
    m = re.search(r'id="%s" value="([^"]*)"' % name, html)
    return m.group(1) if m else ""


def _parse_daily_table(df: pd.DataFrame):
    """Turn the NSDL 'Daily Trends in FPI Investments' table into per-day records."""
    df = df.copy()
    df.columns = [c[-1] if isinstance(c, tuple) else c for c in df.columns]
    cols = list(df.columns)
    c_date, c_seg, c_route, c_buy, c_sell, c_net, c_usd, c_fx = cols[:8]
    out = {}
    for _, r in df.iterrows():
        d = str(r[c_date]).strip()
        try:
            dt = datetime.strptime(d, "%d-%b-%Y").date()
        except ValueError:
            continue
        seg = str(r[c_seg]).strip()
        route = str(r[c_route]).strip()
        rec = out.setdefault(dt.isoformat(), {"date": dt.isoformat(), "fx_usdinr": num(r[c_fx])})
        key = None
        if seg == "Equity":
            key = {"Stock Exchange": "eq_exchange", "Primary market & others": "eq_primary", "Sub-total": "eq"}.get(route)
        elif seg.startswith("Debt-General") or seg == "Debt":
            key = "debt_gl" if route == "Sub-total" else None
        elif seg == "Debt-VRR":
            key = "debt_vrr" if route == "Sub-total" else None
        elif seg == "Debt-FAR":
            key = "debt_far" if route == "Sub-total" else None
        elif seg == "Hybrid":
            key = "hybrid" if route == "Sub-total" else None
        elif seg == "Total":
            key = "total"
        if not key:
            continue
        rec[f"{key}_buy"] = num(r[c_buy])
        rec[f"{key}_sell"] = num(r[c_sell])
        rec[f"{key}_net"] = num(r[c_net])
        rec[f"{key}_net_usd_mn"] = num(r[c_usd])
    return [v for v in out.values() if "eq_net" in v]


def fetch_daily_month(to_date: date):
    """NSDL Archive returns month-to-date daily FPI investment trends for the given 'To Date'."""
    s = session()
    r = s.get(ARCHIVE_URL, timeout=30)
    r.raise_for_status()
    fmt = to_date.strftime("%d-%b-%Y")
    data = {
        "__EVENTTARGET": "btnSubmit1",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": _hidden(r.text, "__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": _hidden(r.text, "__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": _hidden(r.text, "__EVENTVALIDATION"),
        "txtDate": fmt,
        "hdnDate": fmt,
        "hdnFlag": "",
        "HdnValexceldata": "",
    }
    r2 = s.post(ARCHIVE_URL, data=data, headers={"Referer": ARCHIVE_URL}, timeout=60)
    r2.raise_for_status()
    tables = pd.read_html(StringIO(r2.text))
    for t in tables:
        flat = [str(c[-1] if isinstance(c, tuple) else c) for c in t.columns]
        if any("Gross Purchases" in c for c in flat) and any("Debt/Equity" in c or "Debt" in c for c in flat):
            return _parse_daily_table(t)
    return []


def fetch_daily_latest():
    s = session()
    r = s.get(LATEST_URL, timeout=30)
    r.raise_for_status()
    tables = pd.read_html(StringIO(r.text))
    for t in tables:
        flat = [str(c[-1] if isinstance(c, tuple) else c) for c in t.columns]
        if any("Gross Purchases" in c for c in flat):
            return _parse_daily_table(t)
    return []


def list_sector_reports():
    s = session()
    r = s.get(SECTOR_LIST_URL, timeout=30)
    r.raise_for_status()
    opts = re.findall(r'<option[^>]*value="([^"]*StaticReports[^"]*)"[^>]*>([^<]*)</option>', r.text)
    out = []
    for path, label in opts:
        url = path.replace("~/", BASE + "/")
        try:
            dt = datetime.strptime(label.strip().replace("JUNE", "JUN").replace("JULY", "JUL").replace("SEPT", "SEP").title(), "%b %d, %Y").date()
        except ValueError:
            continue
        out.append({"report_date": dt.isoformat(), "url": url, "label": label.strip()})
    out.sort(key=lambda x: x["report_date"], reverse=True)
    return out


def _parse_period(label: str):
    """'Net Investment August 16-31, 2026' -> (start, end); 'AUC as on August 31, 2026' -> (None, end)."""
    label = label.replace("Sept ", "Sep ")
    m = re.search(r"Net Investment\s+([A-Za-z]+)\s+(\d{1,2})-(\d{1,2}),\s*(\d{4})", label)
    if m:
        mon, d1, d2, y = m.groups()
        start = datetime.strptime(f"{mon[:3]} {d1} {y}", "%b %d %Y").date()
        end = datetime.strptime(f"{mon[:3]} {d2} {y}", "%b %d %Y").date()
        return "net", start, end
    m = re.search(r"AUC as on\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", label)
    if m:
        mon, d, y = m.groups()
        end = datetime.strptime(f"{mon[:3]} {d} {y}", "%b %d %Y").date()
        return "auc", None, end
    return None, None, None


def parse_sector_report(url: str):
    """Returns list of fortnight records: {end, start, auc_date, sectors:{name:{net_equity, auc_equity, net_total, auc_total}}}."""
    s = session()
    r = s.get(url, timeout=60)
    r.raise_for_status()
    tables = pd.read_html(StringIO(r.text))
    df = None
    for t in tables:
        if t.shape[1] > 20 and t.astype(str).apply(lambda c: c.str.contains("Sectors", na=False)).any().any():
            df = t
            break
    if df is None:
        return []
    hdr_row = None
    for i in range(min(8, len(df))):
        if "Sectors" in [str(x).strip() for x in df.iloc[i].tolist()]:
            hdr_row = i
            break
    if hdr_row is None:
        return []
    block_row = 0
    unit_row = 1
    sector_col = [str(x).strip() for x in df.iloc[hdr_row].tolist()].index("Sectors")

    # Build column map: (kind, start, end, unit, category) -> col index. First 'Equity' in a block = FPI equity.
    blocks = {}
    seen_cat = {}
    for c in range(df.shape[1]):
        label = str(df.iloc[block_row, c])
        kind, start, end = _parse_period(label)
        if not kind:
            continue
        unit = str(df.iloc[unit_row, c])
        if "INR" not in unit:
            continue
        cat = str(df.iloc[hdr_row, c]).strip()
        bkey = (kind, start, end)
        blocks.setdefault(bkey, {})
        k = (bkey, cat)
        seen_cat[k] = seen_cat.get(k, 0) + 1
        if cat == "Equity" and seen_cat[k] == 1:
            blocks[bkey]["equity"] = c
        elif cat == "Total":
            blocks[bkey]["total"] = c

    auc_blocks = {end: cols for (kind, _s, end), cols in blocks.items() if kind == "auc"}
    net_blocks = {(start, end): cols for (kind, start, end), cols in blocks.items() if kind == "net"}

    rows = []
    for i in range(hdr_row + 1, len(df)):
        name = str(df.iloc[i, sector_col]).strip()
        if name in ("nan", "", "Sectors"):
            continue
        rows.append((i, name))

    records = []
    for (start, end), cols in net_blocks.items():
        auc_end_cols = auc_blocks.get(end)
        auc_start_cols = None
        prev_end = None
        for d in sorted(auc_blocks):
            if d < start:
                prev_end = d
        if prev_end:
            auc_start_cols = auc_blocks[prev_end]
        sectors = {}
        for i, name in rows:
            rec = {
                "net_equity": num(df.iloc[i, cols["equity"]]) if "equity" in cols else None,
                "net_total": num(df.iloc[i, cols["total"]]) if "total" in cols else None,
                "auc_equity": num(df.iloc[i, auc_end_cols["equity"]]) if auc_end_cols and "equity" in auc_end_cols else None,
                "auc_total": num(df.iloc[i, auc_end_cols["total"]]) if auc_end_cols and "total" in auc_end_cols else None,
                "auc_equity_start": num(df.iloc[i, auc_start_cols["equity"]]) if auc_start_cols and "equity" in auc_start_cols else None,
            }
            sectors[name] = rec
        records.append({
            "start": start.isoformat(),
            "end": end.isoformat(),
            "auc_start_date": prev_end.isoformat() if prev_end else None,
            "sectors": sectors,
            "source_url": url,
        })
    return records
