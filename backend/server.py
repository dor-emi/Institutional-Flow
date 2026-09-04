import asyncio
import csv
import io
import logging
import os
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

from services import store, analytics
from services.market import INDICES, SECTOR_INDEX_MAP

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

app = FastAPI(title="FII Flow Tracker India")
api = APIRouter(prefix="/api")

SOURCES = {
    "nsdl_daily": {
        "id": "nsdl_daily", "name": "NSDL — Daily Trends in FPI Investments",
        "url": "https://www.fpi.nsdl.co.in/web/Reports/Latest.aspx",
        "frequency": "Daily (T+1, custodian-confirmed)",
        "quality": "verified", "quality_note": "Custodian-reported, confirmed trades. Published next business day.",
    },
    "nse_fiidii": {
        "id": "nse_fiidii", "name": "NSE — FII/FPI & DII Trading Activity (provisional)",
        "url": "https://www.nseindia.com/reports/fii-dii",
        "frequency": "Daily (same day, provisional)",
        "quality": "provisional", "quality_note": "Exchange provisional figures compiled from trading members on T day; may differ from confirmed NSDL data.",
    },
    "nsdl_sectors": {
        "id": "nsdl_sectors", "name": "NSDL — Fortnightly Sector-wise FPI Investment",
        "url": "https://www.fpi.nsdl.co.in/web/Reports/FPI_Fortnightly_Selection.aspx",
        "frequency": "Fortnightly (1st–15th, 16th–month end)",
        "quality": "verified", "quality_note": "Custodian-reported AUC and net investment; BSE industry classification (22 sectors + Sovereign/Others).",
    },
    "indices": {
        "id": "indices", "name": "Yahoo Finance — NSE index EOD prices",
        "url": "https://finance.yahoo.com/quote/%5ENSEI/",
        "frequency": "Daily EOD",
        "quality": "verified", "quality_note": "Exchange EOD closes redistributed by Yahoo Finance.",
    },
    "sector_indices": {
        "id": "sector_indices", "name": "NSE — Sectoral index historical data",
        "url": "https://www.nseindia.com/reports-indices-historical-index-data",
        "frequency": "Daily EOD",
        "quality": "partial", "quality_note": "NSDL uses BSE industry sectors; 11 map exactly to NSE sectoral indices, 5 approximately (Consumer Services, Services, Power, Construction, Capital Goods), 6 have no index.",
    },
    "deals": {
        "id": "deals", "name": "NSE — Bulk & Block Deals (FPI counterparties, name-based)",
        "url": "https://www.nseindia.com/market-data/large-deals",
        "frequency": "Daily EOD",
        "quality": "partial", "quality_note": "Only deals ≥0.5% of equity (bulk) or negotiated block deals are disclosed. FPI identification is a name heuristic. This is NOT total FII buying/selling per stock.",
    },
    "holdings": {
        "id": "holdings", "name": "Screener.in — quarterly shareholding pattern (FIIs %), NIFTY 100",
        "url": "https://www.screener.in/",
        "frequency": "Quarterly (exchange filings, ~3-6 weeks after quarter end)",
        "quality": "verified", "quality_note": "Aggregated from BSE/NSE shareholding filings; universe limited to NIFTY 100 (NSE constituents list).",
    },
}

RANGES = {"1m": 31, "3m": 92, "6m": 183, "1y": 366, "2y": 731, "ytd": None, "all": None}


def range_start(rng: str) -> Optional[str]:
    if rng == "ytd":
        return date(date.today().year, 1, 1).isoformat()
    days = RANGES.get(rng, 183)
    return (date.today() - timedelta(days=days)).isoformat() if days else None


async def provenance(key: str, data_date: Optional[str]):
    meta = await store.get_meta(db, key)
    src = SOURCES[key]
    return {
        **src,
        "data_date": data_date,
        "last_updated": meta.get("last_fetch"),
        "status": meta.get("status", "pending"),
        "error": meta.get("error"),
    }


def touch(*keys):
    for k in keys:
        asyncio.create_task(store.ensure_fresh(db, k))


# ---------------- routes ----------------

@api.get("/")
async def root():
    return {"app": "FII Flow Tracker India", "time": datetime.now(timezone.utc).isoformat()}


@api.get("/sources")
async def sources():
    out = []
    for k in SOURCES:
        m = await store.get_meta(db, k)
        out.append({**SOURCES[k], **{kk: m.get(kk) for kk in ("last_fetch", "status", "error", "records", "started_at", "progress")}})
    return {"sources": out, "server_time": datetime.now(timezone.utc).isoformat()}


@api.post("/refresh")
async def refresh(source: Optional[str] = None):
    keys = [source] if source else list(store.REFRESHERS)
    for k in keys:
        if k not in store.REFRESHERS:
            raise HTTPException(400, f"unknown source {k}")
        asyncio.create_task(store._run(db, k, store.REFRESHERS[k]))
    return {"queued": keys}


async def _daily_series(start: Optional[str]):
    q = {"_id": {"$gte": start}} if start else {}
    nsdl_rows = await db.fpi_daily.find(q, {"_id": 0}).sort("_id", 1).to_list(2000)
    nse_rows = await db.nse_fiidii.find(q, {"_id": 0}).sort("_id", 1).to_list(2000)
    nse_map = {r["date"]: r for r in nse_rows}
    series = []
    for r in nsdl_rows:
        n = nse_map.pop(r["date"], {})
        series.append({
            "date": r["date"],
            "fii_buy": r.get("eq_buy"), "fii_sell": r.get("eq_sell"), "fii_net": r.get("eq_net"),
            "fii_exchange_net": r.get("eq_exchange_net"), "fii_primary_net": r.get("eq_primary_net"),
            "fii_net_usd_mn": r.get("eq_net_usd_mn"), "debt_net": r.get("debt_gl_net"),
            "fx_usdinr": r.get("fx_usdinr"),
            "nse_fii_net": n.get("fii_net"), "dii_net": n.get("dii_net"), "dii_buy": n.get("dii_buy"), "dii_sell": n.get("dii_sell"),
            "nse_source": n.get("source"), "fii_source": "NSDL",
        })
    for d, n in nse_map.items():  # days NSE has published but NSDL has not yet (T+1 lag)
        series.append({"date": d, "fii_buy": n.get("fii_buy"), "fii_sell": n.get("fii_sell"), "fii_net": n.get("fii_net"),
                       "nse_fii_net": n.get("fii_net"), "dii_net": n.get("dii_net"), "dii_buy": n.get("dii_buy"), "dii_sell": n.get("dii_sell"),
                       "nse_source": n.get("source"), "fii_source": n.get("source"), "provisional": True})
    series.sort(key=lambda x: x["date"])
    return series


@api.get("/flows/daily")
async def flows_daily(range: str = Query("6m", alias="range")):
    touch("nsdl_daily", "nse_fiidii")
    # pull extra history so rolling windows are complete at the start of the range
    start = range_start(range)
    ext_start = (date.fromisoformat(start) - timedelta(days=45)).isoformat() if start else None
    series = analytics.enrich_daily(await _daily_series(ext_start))
    if start:
        series = [s for s in series if s["date"] >= start]
    nsdl_dates = [s["date"] for s in series if s.get("fii_source") == "NSDL"]
    nse_dates = [s["date"] for s in series if s.get("nse_source")]
    return {
        "range": range,
        "series": series,
        "provenance": {
            "fii": await provenance("nsdl_daily", nsdl_dates[-1] if nsdl_dates else None),
            "dii": await provenance("nse_fiidii", nse_dates[-1] if nse_dates else None),
        },
    }


@api.get("/flows/stats")
async def flows_stats():
    touch("nsdl_daily", "nse_fiidii")
    full = await _daily_series(None)
    confirmed = [s for s in full if s.get("fii_source") == "NSDL"]
    stats = analytics.persistence_stats(confirmed) if confirmed else None
    latest_nse = await db.nse_fiidii.find_one(sort=[("_id", -1)])
    if latest_nse:
        latest_nse.pop("_id", None)
    dii_nets = [s["dii_net"] for s in full if s.get("dii_net") is not None]
    return {
        "fii": stats,
        "provisional_latest": latest_nse,
        "dii_sum_20d": round(sum(dii_nets[-20:]), 2) if dii_nets else None,
        "dii_days_available": len(dii_nets),
        "provenance": {
            "fii": await provenance("nsdl_daily", stats["last_date"] if stats else None),
            "dii": await provenance("nse_fiidii", latest_nse.get("date") if latest_nse else None),
        },
    }


@api.get("/indices")
async def indices(range: str = Query("6m")):
    touch("indices")
    start = range_start(range)
    docs = await db.index_prices.find({}, {"_id": 0}).to_list(10)
    out = []
    for key in INDICES:
        d = next((x for x in docs if x["key"] == key), None)
        if not d:
            out.append({"key": key, "name": INDICES[key]["name"], "series": [], "latest": None})
            continue
        full = d["series"]
        series = [p for p in full if not start or p["date"] >= start]
        latest = full[-1] if full else None
        prev = full[-2] if len(full) > 1 else None

        def ret(n):
            if len(full) > n:
                base = full[-1 - n]["close"]
                return round((latest["close"] / base - 1) * 100, 2) if base else None
            return None

        out.append({
            "key": key, "name": d["name"], "symbol": d["symbol"], "series": series,
            "latest": latest, "change_pct": round((latest["close"] / prev["close"] - 1) * 100, 2) if latest and prev and prev["close"] else None,
            "returns": {"5d": ret(5), "20d": ret(20), "60d": ret(60), "1y": ret(250)},
        })
    dates = [x["latest"]["date"] for x in out if x["latest"]]
    return {"range": range, "indices": out, "provenance": await provenance("indices", max(dates) if dates else None)}


@api.get("/compare")
async def compare(index: str = Query("NIFTY50"), rng: str = Query("6m", alias="range")):
    if index not in INDICES:
        raise HTTPException(400, "unknown index")
    touch("indices", "nsdl_daily")
    start = range_start(rng)
    doc = await db.index_prices.find_one({"_id": index}, {"_id": 0})
    prices = {p["date"]: p["close"] for p in (doc or {}).get("series", [])}
    dates = sorted(prices)
    ret_map = {}
    for i in range(1, len(dates)):
        p0, p1 = prices[dates[i - 1]], prices[dates[i]]
        ret_map[dates[i]] = round((p1 / p0 - 1) * 100, 3) if p0 else None
    flows = analytics.enrich_daily(await _daily_series(start))
    merged = []
    for f in flows:
        if f["date"] in prices:
            merged.append({"date": f["date"], "fii_net": f["fii_net"], "fii_cum": f["fii_cum"], "dii_net": f.get("dii_net"),
                           "close": prices[f["date"]], "ret_pct": ret_map.get(f["date"]), "provisional": f.get("provisional", False)})
    xs = [m["fii_net"] for m in merged]
    ys = [m["ret_pct"] for m in merged]
    r_same, n_same = analytics.pearson(xs, ys)
    r_next, n_next = analytics.pearson(xs[:-1], ys[1:])
    r_prev, n_prev = analytics.pearson(xs[1:], ys[:-1])
    base = merged[0]["close"] if merged else None
    for m in merged:
        m["index_rebased"] = round(m["close"] / base * 100, 2) if base else None
    return {
        "index": index, "index_name": INDICES[index]["name"], "range": rng, "series": merged,
        "correlation": {
            "same_day": {"r": r_same, "n": n_same, "label": "FII net flow vs same-day index return"},
            "flow_leads_return": {"r": r_next, "n": n_next, "label": "Today's FII net flow vs next-day index return"},
            "return_leads_flow": {"r": r_prev, "n": n_prev, "label": "Yesterday's index return vs today's FII net flow"},
        },
        "provenance": {
            "flows": await provenance("nsdl_daily", merged[-1]["date"] if merged else None),
            "index": await provenance("indices", dates[-1] if dates else None),
        },
    }


@api.get("/sectors")
async def sectors(periods: int = Query(12, ge=2, le=30)):
    touch("nsdl_sectors")
    docs = await db.sector_fortnights.find({}, {"_id": 0}).sort("_id", -1).to_list(periods)
    docs.reverse()
    if not docs:
        return {"fortnights": [], "sectors": [], "provenance": await provenance("nsdl_sectors", None)}
    names = [n for n in docs[-1]["sectors"].keys() if n not in ("Grand Total", "Total")]
    fortnights = [{"start": d["start"], "end": d["end"], "report_date": d.get("report_date")} for d in docs]
    total_auc = (docs[-1]["sectors"].get("Grand Total") or {}).get("auc_equity")
    out = []
    for name in names:
        hist = []
        for d in docs:
            s = d["sectors"].get(name) or {}
            hist.append({"end": d["end"], "start": d["start"], "net_equity": s.get("net_equity"), "auc_equity": s.get("auc_equity")})
        nets = [h["net_equity"] for h in hist]
        latest = docs[-1]["sectors"].get(name) or {}
        direction, length = analytics.streak(nets)
        auc_start = latest.get("auc_equity_start")
        net = latest.get("net_equity")
        out.append({
            "sector": name,
            "net_equity_latest": net,
            "net_equity_prev": nets[-2] if len(nets) > 1 else None,
            "net_equity_3fn": round(sum(v for v in nets[-3:] if v is not None), 2),
            "net_equity_6fn": round(sum(v for v in nets[-6:] if v is not None), 2),
            "net_equity_all": round(sum(v for v in nets if v is not None), 2),
            "auc_equity": latest.get("auc_equity"),
            "auc_weight_pct": round(latest["auc_equity"] / total_auc * 100, 2) if total_auc and latest.get("auc_equity") is not None else None,
            "flow_intensity_pct": round(net / auc_start * 100, 3) if net is not None and auc_start else None,
            "streak_direction": direction, "streak_periods": length,
            "positive_periods": sum(1 for v in nets if v is not None and v > 0), "periods": sum(1 for v in nets if v is not None),
            "history": hist,
        })
    out.sort(key=lambda x: (x["net_equity_latest"] is None, -(x["net_equity_latest"] or 0)))
    gt = docs[-1]["sectors"].get("Grand Total") or {}
    return {
        "fortnights": fortnights,
        "latest": {"start": docs[-1]["start"], "end": docs[-1]["end"], "total_net_equity": gt.get("net_equity"), "total_auc_equity": gt.get("auc_equity"), "source_url": docs[-1].get("source_url")},
        "sectors": out,
        "provenance": await provenance("nsdl_sectors", docs[-1]["end"]),
    }


@api.get("/sectors/rotation")
async def sector_rotation(periods: int = Query(8, ge=2, le=24)):
    touch("nsdl_sectors", "sector_indices")
    docs = await db.sector_fortnights.find({}, {"_id": 0}).sort("_id", -1).to_list(periods)
    docs.reverse()
    keys = sorted({v["key"] for v in SECTOR_INDEX_MAP.values()})
    price_docs = await db.index_prices.find({"_id": {"$in": keys}}, {"_id": 0}).to_list(50)
    closes = {p["key"]: [(x["date"], x["close"]) for x in p["series"]] for p in price_docs}

    def close_on_or_before(key, d):
        best = None
        for dt, c in closes.get(key, []):
            if dt <= d:
                best = c
            else:
                break
        return best

    fortnights = []
    for doc in docs:
        start, end = doc["start"], doc["end"]
        before = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
        rows = []
        for name, s in doc["sectors"].items():
            if name in ("Grand Total", "Total", "Sovereign", "Others"):
                continue
            m = SECTOR_INDEX_MAP.get(name)
            net = s.get("net_equity")
            base = s.get("auc_equity_start") or s.get("auc_equity")
            intensity = round(net / base * 100, 3) if net is not None and base else None
            ret = None
            if m:
                c0, c1 = close_on_or_before(m["key"], before), close_on_or_before(m["key"], end)
                ret = round((c1 / c0 - 1) * 100, 2) if c0 and c1 else None
            rows.append({"sector": name, "net_equity": net, "flow_intensity_pct": intensity, "index_return_pct": ret,
                         "index_name": m["name"] if m else None, "match": m["match"] if m else None, "auc_equity": s.get("auc_equity")})
        fortnights.append({"start": start, "end": end, "rows": rows})
    dates = [c[-1][0] for c in closes.values() if c]
    return {
        "fortnights": fortnights,
        "mapping": {k: {"index": v["name"], "match": v["match"]} for k, v in SECTOR_INDEX_MAP.items()},
        "provenance": {"flows": await provenance("nsdl_sectors", docs[-1]["end"] if docs else None), "index": await provenance("sector_indices", max(dates) if dates else None)},
    }


@api.get("/holdings")
async def holdings_view():
    touch("holdings")
    docs = await db.holdings.find({}, {"_id": 0}).to_list(500)
    meta = await store.get_meta(db, "holdings")
    out = []
    for d in docs:
        fii = d.get("fii") or []
        q = d.get("quarters") or []
        if len(fii) < 2 or fii[-1] is None:
            continue
        prev = fii[-2]
        yoy = fii[-5] if len(fii) >= 5 else None
        out.append({
            "symbol": d["symbol"], "name": d["name"], "industry": d.get("industry"),
            "latest_quarter": q[-1] if q else None, "prev_quarter": q[-2] if len(q) > 1 else None,
            "fii_pct": fii[-1], "fii_prev_pct": prev,
            "change_qoq_pp": round(fii[-1] - prev, 2) if prev is not None else None,
            "change_yoy_pp": round(fii[-1] - yoy, 2) if yoy is not None else None,
            "consecutive_quarters": _consecutive(fii),
            "dii_pct": (d.get("dii") or [None])[-1], "promoter_pct": (d.get("promoters") or [None])[-1],
            "quarters": q[-8:], "fii_series": fii[-8:], "source_url": d.get("source_url"),
        })
    out.sort(key=lambda x: -(x["change_qoq_pp"] or 0))
    labels = [x["latest_quarter"] for x in out if x["latest_quarter"]]
    latest_q = max(set(labels), key=labels.count) if labels else None
    latest_end = None
    if latest_q:
        try:
            d0 = datetime.strptime(latest_q, "%b %Y").date()
            latest_end = date(d0.year + (d0.month == 12), (d0.month % 12) + 1, 1) - timedelta(days=1)
        except ValueError:
            pass
    return {
        "universe": "NIFTY 100", "count": len(out), "latest_quarter": latest_q, "quarter_end": latest_end.isoformat() if latest_end else None, "progress": meta.get("progress"), "status": meta.get("status"),
        "stocks": out,
        "provenance": await provenance("holdings", latest_end.isoformat() if latest_end else None),
    }


def _consecutive(vals):
    vals = [v for v in vals if v is not None]
    if len(vals) < 2:
        return 0
    diffs = [vals[i] - vals[i - 1] for i in range(1, len(vals))]
    sign = diffs[-1] > 0
    n = 0
    for d in reversed(diffs):
        if d == 0 or (d > 0) != sign:
            break
        n += 1
    return n if sign else -n


@api.get("/deals/fpi")
async def fpi_deals(days: int = Query(10, ge=1, le=30)):
    touch("deals")
    dates = await db.large_deals.distinct("date")
    dates = sorted(dates)[-days:]
    rows = await db.large_deals.find({"date": {"$in": dates}, "likely_fpi": True, "value_cr": {"$gte": 1}, "symbol": {"$not": {"$regex": "-(RE|BE|BZ)$"}}}, {"_id": 0}).sort([("date", -1), ("value_cr", -1)]).to_list(5000)
    total = await db.large_deals.count_documents({"date": {"$in": dates}})
    by_day = {}
    for r in rows:
        day = by_day.setdefault(r["date"], {"date": r["date"], "buys": {}, "sells": {}})
        bucket = day["buys"] if r["side"] == "BUY" else day["sells"]
        agg = bucket.setdefault(r["symbol"], {"symbol": r["symbol"], "name": r["name"], "value_cr": 0.0, "qty": 0, "clients": [], "kinds": set()})
        agg["value_cr"] = round(agg["value_cr"] + (r["value_cr"] or 0), 2)
        agg["qty"] += r["qty"] or 0
        if r["client"] not in agg["clients"]:
            agg["clients"].append(r["client"])
        agg["kinds"].add(r["kind"])
    out = []
    for d in sorted(by_day, reverse=True):
        day = by_day[d]
        fmt = lambda b: sorted([{**v, "kinds": sorted(v["kinds"])} for v in b.values()], key=lambda x: -x["value_cr"])
        out.append({"date": d, "top_buys": fmt(day["buys"])[:5], "top_sells": fmt(day["sells"])[:5], "buy_count": len(day["buys"]), "sell_count": len(day["sells"])})
    return {
        "days": out, "dates_covered": dates, "fpi_deal_rows": len(rows), "all_deal_rows": total,
        "provenance": await provenance("deals", dates[-1] if dates else None),
    }


@api.get("/export/daily.csv")
async def export_daily(range: str = Query("1y")):
    series = analytics.enrich_daily(await _daily_series(range_start(range)))
    cols = ["date", "fii_buy", "fii_sell", "fii_net", "fii_cum", "fii_5d", "fii_20d", "fii_exchange_net", "fii_primary_net", "fii_net_usd_mn", "debt_net", "nse_fii_net", "dii_buy", "dii_sell", "dii_net", "fii_source", "nse_source"]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writerow({c: c for c in cols})
    for s in series:
        w.writerow(s)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=fii_flows_{range}.csv"})


@api.get("/export/sectors.csv")
async def export_sectors(periods: int = Query(12)):
    data = await sectors(periods)
    buf = io.StringIO()
    w = csv.writer(buf)
    ends = [f["end"] for f in data["fortnights"]]
    w.writerow(["sector", "auc_equity_latest_cr", "auc_weight_pct", *[f"net_{e}" for e in ends]])
    for s in data["sectors"]:
        w.writerow([s["sector"], s["auc_equity"], s["auc_weight_pct"], *[h["net_equity"] for h in s["history"]]])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=fpi_sector_flows.csv"})


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    asyncio.create_task(store.warmup(db))

    async def periodic():
        while True:
            await asyncio.sleep(15 * 60)
            for k in store.REFRESHERS:
                await store.ensure_fresh(db, k)

    asyncio.create_task(periodic())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
