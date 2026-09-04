import json
import re
from datetime import datetime

from .http import session, num

NSE_HOME = "https://www.nseindia.com"
NSE_FIIDII = "https://www.nseindia.com/api/fiidiiTradeReact"
GROWW_URL = "https://groww.in/fii-dii-data"


def fetch_nse_fiidii_latest():
    """NSE provisional FII/FPI & DII cash-market trading activity for the latest trading day."""
    s = session()
    s.get(NSE_HOME, timeout=20)
    r = s.get(NSE_FIIDII, timeout=30, headers={"Referer": "https://www.nseindia.com/reports/fii-dii"})
    r.raise_for_status()
    rows = r.json()
    rec = {}
    for row in rows:
        dt = datetime.strptime(row["date"], "%d-%b-%Y").date().isoformat()
        rec.setdefault("date", dt)
        prefix = "fii" if "FII" in row["category"].upper() else "dii"
        rec[f"{prefix}_buy"] = num(row["buyValue"])
        rec[f"{prefix}_sell"] = num(row["sellValue"])
        rec[f"{prefix}_net"] = num(row["netValue"])
    return [rec] if rec.get("date") else []


def fetch_groww_history():
    """Groww republishes NSE provisional FII/DII cash figures (~1 month). Used only to backfill DII history."""
    s = session()
    r = s.get(GROWW_URL, timeout=30)
    r.raise_for_status()
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
    if not m:
        return []
    data = json.loads(m.group(1))
    items = data.get("props", {}).get("pageProps", {}).get("initialData", []) or []
    out = []
    for it in items:
        fii, dii = it.get("fii") or {}, it.get("dii") or {}
        out.append({
            "date": it["date"],
            "fii_buy": fii.get("grossBuy"), "fii_sell": fii.get("grossSell"), "fii_net": fii.get("netBuySell"),
            "dii_buy": dii.get("grossBuy"), "dii_sell": dii.get("grossSell"), "dii_net": dii.get("netBuySell"),
        })
    return out
