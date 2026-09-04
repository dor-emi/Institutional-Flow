import asyncio
import logging
from datetime import datetime, timezone, date, timedelta

from . import nsdl, nse, market

log = logging.getLogger("store")

TTL = {"nse_fiidii": 30 * 60, "nsdl_daily": 3 * 3600, "nsdl_sectors": 12 * 3600, "indices": 3600}
_locks = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def set_meta(db, key, **fields):
    await db.meta.update_one({"_id": key}, {"$set": fields}, upsert=True)


async def get_meta(db, key):
    doc = await db.meta.find_one({"_id": key}, {"_id": 0})
    return doc or {}


async def is_stale(db, key):
    m = await get_meta(db, key)
    lf = m.get("last_fetch")
    if not lf:
        return True
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(lf)).total_seconds()
    return age > TTL[key]


async def _run(db, key, fn):
    lock = _locks.setdefault(key, asyncio.Lock())
    if lock.locked():
        return
    async with lock:
        await set_meta(db, key, status="refreshing", started_at=now_iso())
        try:
            n = await fn(db)
            await set_meta(db, key, status="ok", last_fetch=now_iso(), error=None, records=n)
        except Exception as e:  # network / parse failures at system boundary
            log.exception("refresh %s failed", key)
            await set_meta(db, key, status="error", error=str(e)[:300], failed_at=now_iso())


async def ensure_fresh(db, key, background=True):
    if not await is_stale(db, key):
        return
    fn = REFRESHERS[key]
    if background:
        asyncio.create_task(_run(db, key, fn))
    else:
        await _run(db, key, fn)


# ---------------- refreshers ----------------

async def refresh_nse(db):
    rows = await asyncio.to_thread(nse.fetch_nse_fiidii_latest)
    n = 0
    for r in rows:
        r.update({"source": "NSE", "fetched_at": now_iso()})
        await db.nse_fiidii.update_one({"_id": r["date"]}, {"$set": r}, upsert=True)
        n += 1
    try:
        hist = await asyncio.to_thread(nse.fetch_groww_history)
    except Exception as e:
        log.warning("groww backfill failed: %s", e)
        hist = []
    for r in hist:
        existing = await db.nse_fiidii.find_one({"_id": r["date"]}, {"source": 1})
        if existing and existing.get("source") == "NSE":
            continue
        r.update({"source": "Groww (NSE provisional mirror)", "fetched_at": now_iso()})
        await db.nse_fiidii.update_one({"_id": r["date"]}, {"$set": r}, upsert=True)
        n += 1
    return n


def _month_ends(months_back):
    today = date.today()
    out = [today]
    y, m = today.year, today.month
    for _ in range(months_back):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        nxt = date(y + (m == 12), (m % 12) + 1, 1)
        out.append(nxt - timedelta(days=1))
    return out


async def refresh_nsdl_daily(db, months_back=13):
    n = 0
    for i, to_date in enumerate(_month_ends(months_back)):
        ym = to_date.strftime("%Y-%m")
        if i >= 2:
            cnt = await db.fpi_daily.count_documents({"_id": {"$regex": f"^{ym}"}})
            if cnt >= 15:
                continue
        try:
            rows = await asyncio.to_thread(nsdl.fetch_daily_month, to_date)
        except Exception as e:
            log.warning("nsdl month %s failed: %s", ym, e)
            if i < 2:
                raise
            continue
        for r in rows:
            r.update({"source": "NSDL", "fetched_at": now_iso()})
            await db.fpi_daily.update_one({"_id": r["date"]}, {"$set": r}, upsert=True)
            n += 1
        await asyncio.sleep(0.5)
    return n


async def refresh_sectors(db, max_reports=14):
    reports = await asyncio.to_thread(nsdl.list_sector_reports)
    n = 0
    for rep in reports[:max_reports]:
        done = await db.sector_reports.find_one({"_id": rep["report_date"]})
        if done and done.get("status") == "ok" and rep["report_date"] != reports[0]["report_date"]:
            continue
        try:
            recs = await asyncio.to_thread(nsdl.parse_sector_report, rep["url"])
        except Exception as e:
            log.warning("sector report %s failed: %s", rep["report_date"], e)
            await db.sector_reports.update_one({"_id": rep["report_date"]}, {"$set": {**rep, "status": "error", "error": str(e)[:200]}}, upsert=True)
            continue
        for rec in recs:
            rec.update({"report_date": rep["report_date"], "fetched_at": now_iso()})
            await db.sector_fortnights.update_one({"_id": rec["end"]}, {"$set": rec}, upsert=True)
            n += 1
        await db.sector_reports.update_one({"_id": rep["report_date"]}, {"$set": {**rep, "status": "ok", "fortnights": len(recs)}}, upsert=True)
        await asyncio.sleep(0.3)
    return n


async def refresh_indices(db):
    n = 0
    for key in market.INDICES:
        series = await asyncio.to_thread(market.fetch_index_history, key, "2y")
        if not series:
            continue
        await db.index_prices.update_one({"_id": key}, {"$set": {"key": key, "name": market.INDICES[key]["name"], "symbol": market.INDICES[key]["symbol"], "series": series, "fetched_at": now_iso()}}, upsert=True)
        n += len(series)
    return n


REFRESHERS = {
    "nse_fiidii": refresh_nse,
    "nsdl_daily": refresh_nsdl_daily,
    "nsdl_sectors": refresh_sectors,
    "indices": refresh_indices,
}


async def warmup(db):
    await asyncio.gather(*[ensure_fresh(db, k, background=False) for k in REFRESHERS])
