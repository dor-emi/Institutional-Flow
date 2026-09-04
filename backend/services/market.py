import time
import urllib.parse
from datetime import datetime, date, timedelta

import yfinance as yf

from .http import session

INDICES = {
    "NIFTY50": {"symbol": "^NSEI", "name": "NIFTY 50"},
    "NIFTY500": {"symbol": "^CRSLDX", "name": "NIFTY 500"},
    "NIFTYBANK": {"symbol": "^NSEBANK", "name": "NIFTY Bank"},
    "INDIAVIX": {"symbol": "^INDIAVIX", "name": "India VIX"},
}

# NSDL (BSE industry classification) sector -> NSE sectoral/thematic index. match: exact / approx
SECTOR_INDEX_MAP = {
    "Automobile and Auto Components": {"key": "SEC_AUTO", "nse": "NIFTY AUTO", "name": "NIFTY Auto", "match": "exact"},
    "Information Technology": {"key": "SEC_IT", "nse": "NIFTY IT", "name": "NIFTY IT", "match": "exact"},
    "Fast Moving Consumer Goods": {"key": "SEC_FMCG", "nse": "NIFTY FMCG", "name": "NIFTY FMCG", "match": "exact"},
    "Metals & Mining": {"key": "SEC_METAL", "nse": "NIFTY METAL", "name": "NIFTY Metal", "match": "exact"},
    "Realty": {"key": "SEC_REALTY", "nse": "NIFTY REALTY", "name": "NIFTY Realty", "match": "exact"},
    "Media, Entertainment & Publication": {"key": "SEC_MEDIA", "nse": "NIFTY MEDIA", "name": "NIFTY Media", "match": "exact"},
    "Financial Services": {"key": "SEC_FIN", "nse": "NIFTY FINANCIAL SERVICES", "name": "NIFTY Financial Services", "match": "exact"},
    "Healthcare": {"key": "SEC_HEALTH", "nse": "NIFTY HEALTHCARE INDEX", "name": "NIFTY Healthcare", "match": "exact"},
    "Oil, Gas & Consumable Fuels": {"key": "SEC_OILGAS", "nse": "NIFTY OIL & GAS", "name": "NIFTY Oil & Gas", "match": "exact"},
    "Consumer Durables": {"key": "SEC_CONSDUR", "nse": "NIFTY CONSUMER DURABLES", "name": "NIFTY Consumer Durables", "match": "exact"},
    "Chemicals": {"key": "SEC_CHEM", "nse": "NIFTY CHEMICALS", "name": "NIFTY Chemicals", "match": "exact"},
    "Consumer Services": {"key": "SEC_CONSUM", "nse": "NIFTY INDIA CONSUMPTION", "name": "NIFTY India Consumption", "match": "approx"},
    "Services": {"key": "SEC_SERVICE", "nse": "NIFTY SERVICES SECTOR", "name": "NIFTY Services Sector", "match": "approx"},
    "Power": {"key": "SEC_ENERGY", "nse": "NIFTY ENERGY", "name": "NIFTY Energy", "match": "approx"},
    "Construction": {"key": "SEC_INFRA", "nse": "NIFTY INFRASTRUCTURE", "name": "NIFTY Infrastructure", "match": "approx"},
    "Capital Goods": {"key": "SEC_INFRA", "nse": "NIFTY INFRASTRUCTURE", "name": "NIFTY Infrastructure", "match": "approx"},
}

SECTOR_INDICES = {v["key"]: {"nse": v["nse"], "name": v["name"]} for v in SECTOR_INDEX_MAP.values()}

NSE_IDX_HIST = "https://www.nseindia.com/api/historicalOR/indicesHistory"
NSE_IDX_PAGE = "https://www.nseindia.com/reports-indices-historical-index-data"


def fetch_index_history(key: str, period: str = "2y"):
    sym = INDICES[key]["symbol"]
    hist = yf.Ticker(sym).history(period=period, interval="1d", auto_adjust=False)
    out = []
    for idx, row in hist.iterrows():
        close = row.get("Close")
        if close is None or close != close:
            continue
        out.append({
            "date": idx.date().isoformat(),
            "open": round(float(row["Open"]), 2) if row.get("Open") == row.get("Open") else None,
            "high": round(float(row["High"]), 2) if row.get("High") == row.get("High") else None,
            "low": round(float(row["Low"]), 2) if row.get("Low") == row.get("Low") else None,
            "close": round(float(close), 2),
        })
    return out


def fetch_nse_index_history(nse_name: str, start: date, end: date):
    """NSE indices history; the API only serves ~3-month windows, so we chunk."""
    s = session()
    s.headers.update({"Referer": NSE_IDX_PAGE})
    s.get(NSE_IDX_PAGE, timeout=20)
    out = {}
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=89), end)
        r = s.get(NSE_IDX_HIST, params={"indexType": nse_name, "from": cur.strftime("%d-%m-%Y"), "to": chunk_end.strftime("%d-%m-%Y")}, timeout=40)
        if r.status_code == 200 and r.text.startswith("{"):
            data = r.json().get("data")
            rows = data.get("indexCloseOnlineRecords", []) if isinstance(data, dict) else (data or [])
            for x in rows:
                d = datetime.strptime(x["EOD_TIMESTAMP"], "%d-%b-%Y").date().isoformat()
                out[d] = {"date": d, "open": x.get("EOD_OPEN_INDEX_VAL"), "high": x.get("EOD_HIGH_INDEX_VAL"), "low": x.get("EOD_LOW_INDEX_VAL"), "close": x.get("EOD_CLOSE_INDEX_VAL")}
        cur = chunk_end + timedelta(days=1)
        time.sleep(0.3)
    return [out[d] for d in sorted(out)]
