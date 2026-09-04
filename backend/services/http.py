import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

HEADERS = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def num(v):
    """Parse NSDL/NSE numeric strings like '(2869.65)', 'Rs.94.46', '1,234'."""
    if v is None:
        return None
    s = str(v).strip().replace(",", "").replace("Rs.", "")
    if s in ("", "nan", "-", "NaN"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        f = float(s)
    except ValueError:
        return None
    return -f if neg else f
