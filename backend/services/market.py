import yfinance as yf

INDICES = {
    "NIFTY50": {"symbol": "^NSEI", "name": "NIFTY 50"},
    "NIFTY500": {"symbol": "^CRSLDX", "name": "NIFTY 500"},
    "NIFTYBANK": {"symbol": "^NSEBANK", "name": "NIFTY Bank"},
    "INDIAVIX": {"symbol": "^INDIAVIX", "name": "India VIX"},
}


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
