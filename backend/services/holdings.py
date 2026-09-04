import csv
import io
import re
import time

from .http import session

NIFTY100_CSV = "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv"
SCREENER = "https://www.screener.in"


def fetch_universe():
    r = session().get(NIFTY100_CSV, timeout=30)
    r.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(r.text)))
    return [{"symbol": x["Symbol"].strip(), "name": x["Company Name"].strip(), "industry": x["Industry"].strip()} for x in rows if x.get("Symbol")]


def _parse_shareholding(html):
    m = re.search(r'id="shareholding"(.*?)</section>', html, re.S)
    if not m:
        return None
    tbl = re.search(r"<table.*?</table>", m.group(1), re.S)
    if not tbl:
        return None
    heads = [h.strip() for h in re.findall(r"<th[^>]*>\s*([^<]*?)\s*</th>", tbl.group(0))]
    quarters = [h for h in heads if h]
    rows = {}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl.group(0), re.S):
        cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).replace("&nbsp;", "").strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if cells:
            rows[cells[0].rstrip(" +").strip()] = cells[1:]

    def pct(v):
        try:
            return float(v.replace("%", "").replace(",", ""))
        except (ValueError, AttributeError):
            return None

    def series(key):
        vals = rows.get(key)
        return [pct(v) for v in vals[: len(quarters)]] if vals else None

    fii = series("FIIs")
    if not fii:
        return None
    return {"quarters": quarters, "fii": fii, "dii": series("DIIs"), "promoters": series("Promoters"), "public": series("Public"), "government": series("Government")}


def fetch_shareholding(symbol: str):
    s = session()
    s.headers.update({"Accept": "text/html"})
    for path in (f"/company/{symbol}/consolidated/", f"/company/{symbol}/"):
        r = s.get(SCREENER + path, timeout=30)
        if r.status_code != 200:
            time.sleep(2 if r.status_code == 429 else 0.5)
            continue
        data = _parse_shareholding(r.text)
        if data:
            data["source_url"] = r.url
            return data
        time.sleep(0.4)
    return None
