import hashlib
import re
from datetime import datetime, date, timedelta

from .http import session, num

NSE_SNAPSHOT = "https://www.nseindia.com/api/snapshot-capital-market-largedeal"
NSE_HIST = "https://www.nseindia.com/api/historicalOR/bulk-block-short-deals"

# Name-based heuristic for foreign portfolio investors. Partial by design; labelled in the UI.
FPI_RE = re.compile(
    r"\bPTE\b|MAURITIUS|SINGAPORE|LUXEMBOURG|CAYMAN|IRELAND|NETHERLANDS|\bLLC\b|\bL\.?P\.?$|\bLP\b|\bPCC\b|\bSICAV\b|\bUCITS\b|\bFCP\b|"
    r"\bPLC\b|\bINC\.?\b|\bN\.?V\.?\b|\bS\.?A\.?\b|\bGMBH\b|\bAG\b|OFFSHORE|MASTER (?:FUND|LTD|LIMITED)|GLOBAL FUND|EMERGING MARKETS? FUND|"
    r"GOLDMAN SACHS|MORGAN STANLEY|SOCIETE GENERALE|BNP PARIBAS|CITIGROUP|\bCITI\b|HSBC|NOMURA|JP ?MORGAN|BOFA|MERRILL LYNCH|BARCLAYS|UBS\b|"
    r"CREDIT SUISSE|DEUTSCHE|MACQUARIE|GOVERNMENT OF SINGAPORE|\bGIC\b|NORGES|MONETARY AUTHORITY|ABU DHABI|KUWAIT INVESTMENT|QATAR|"
    r"VANGUARD|BLACKROCK|ISHARES|FIDELITY|FRANKLIN TEMPLETON|ABERDEEN|ABRDN|SCHRODER|INVESCO|WELLINGTON|CAPITAL GROUP|MATTHEWS|"
    r"MARSHALL WACE|MILLENNIUM|CITADEL|SEGANTII|BREP\b|COPTHALL|ELM PARK|LTS INVESTMENT|THINK INDIA OPPORTUNITIES|NEW WORLD FUND|"
    r"SMALLCAP WORLD|EUROPACIFIC|T\.? ?ROWE|NALANDA|STEADVIEW|WF ASIAN|GHISALLO|KORA|TIGER GLOBAL|SOFTBANK|ANTFIN|PROSUS",
    re.I,
)
EXCLUDE_RE = re.compile(r"MUTUAL FUND|\bMF\b|LIFE INSURANCE|PRIVATE LIMITED|PVT\.? ?LTD|\bHUF\b|\bLLP\b|TRUST$|SBI |ICICI PRUDENTIAL|HDFC |KOTAK |AXIS |NIPPON|ADITYA BIRLA|MIRAE|MOTILAL|QUANT ", re.I)


def is_likely_fpi(name: str) -> bool:
    n = (name or "").upper()
    return bool(FPI_RE.search(n)) and not EXCLUDE_RE.search(n)


def _mk(date_iso, kind, symbol, name, client, side, qty, price):
    key = hashlib.md5(f"{date_iso}|{kind}|{symbol}|{client}|{side}|{qty}|{price}".encode()).hexdigest()
    value_cr = (qty or 0) * (price or 0) / 1e7
    return {
        "_id": key, "date": date_iso, "kind": kind, "symbol": symbol, "name": name, "client": client, "side": side,
        "qty": qty, "price": price, "value_cr": round(value_cr, 2), "likely_fpi": is_likely_fpi(client),
    }


def _nse_session():
    s = session()
    s.headers.update({"Referer": "https://www.nseindia.com/market-data/large-deals"})
    s.get("https://www.nseindia.com/market-data/large-deals", timeout=20)
    return s


def fetch_snapshot():
    s = _nse_session()
    r = s.get(NSE_SNAPSHOT, timeout=30)
    r.raise_for_status()
    d = r.json()
    out = []
    for kind, key in (("bulk", "BULK_DEALS_DATA"), ("block", "BLOCK_DEALS_DATA")):
        for x in d.get(key) or []:
            dt = datetime.strptime(x["date"], "%d-%b-%Y").date().isoformat()
            out.append(_mk(dt, kind, x["symbol"], x.get("name"), x.get("clientName"), x["buySell"].upper(), num(x.get("qty")), num(x.get("watp"))))
    return out


def fetch_history_day(day: date):
    s = _nse_session()
    out = []
    d = day.strftime("%d-%m-%Y")
    for kind, opt in (("bulk", "bulk_deals"), ("block", "block_deals")):
        r = s.get(NSE_HIST, params={"optionType": opt, "from": d, "to": d}, timeout=30)
        if r.status_code != 200 or not r.text.startswith("{"):
            continue
        for x in r.json().get("data") or []:
            dt = datetime.strptime(x["BD_DT_DATE"], "%d-%b-%Y").date().isoformat()
            out.append(_mk(dt, kind, x["BD_SYMBOL"], x.get("BD_SCRIP_NAME"), x.get("BD_CLIENT_NAME"), x["BD_BUY_SELL"].upper(), x.get("BD_QTY_TRD"), x.get("BD_TP_WATP")))
    return out


def recent_weekdays(n: int):
    out, d = [], date.today()
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return out
