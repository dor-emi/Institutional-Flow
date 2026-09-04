"""Backend API tests for FII Flow Tracker India.

Covers: /api/sources, /api/flows/daily, /api/flows/stats, /api/indices,
/api/compare, /api/sectors, /api/export/*.csv, /api/refresh
All data is live/real market data, so assertions validate types/ranges/presence.
"""
import os
import re
from datetime import date, datetime

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


def get(client, path, **params):
    r = client.get(f"{API}{path}", params=params or None, timeout=90)
    return r


# ---------------- /api/sources ----------------
class TestSources:
    def test_sources_all_ok(self, client):
        r = get(client, "/sources")
        assert r.status_code == 200, r.text
        data = r.json()
        srcs = data["sources"]
        assert len(srcs) == 7, [s["id"] for s in srcs]
        ids = {s["id"] for s in srcs}
        assert ids == {"nsdl_daily", "nse_fiidii", "nsdl_sectors", "indices", "sector_indices", "deals", "holdings"}
        assert "server_time" in data
        for s in srcs:
            assert s["status"] == "ok", f"{s['id']} status={s['status']} err={s.get('error')}"
            assert s["last_fetch"], f"{s['id']} missing last_fetch"
            datetime.fromisoformat(s["last_fetch"])
            assert isinstance(s["records"], int) and s["records"] > 0, f"{s['id']} records={s['records']}"
            assert s["name"] and s["url"] and s["frequency"]
            assert s["quality"] in ("verified", "provisional", "partial")


# ---------------- /api/flows/daily ----------------
def _check_provenance(p, key):
    assert key in p, f"provenance missing {key}"
    obj = p[key]
    for f in ("name", "url", "frequency", "quality", "data_date", "last_updated"):
        assert f in obj and obj[f] is not None, f"provenance.{key}.{f} missing/None"
    assert DATE_RE.match(obj["data_date"]), obj["data_date"]


class TestFlowsDaily:
    def test_daily_1m(self, client):
        r = get(client, "/flows/daily", range="1m")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["range"] == "1m"
        series = d["series"]
        assert len(series) > 15, f"only {len(series)} rows"
        for row in series:
            assert DATE_RE.match(row["date"])
            assert isinstance(row["fii_net"], (int, float)), row
            assert isinstance(row["fii_cum"], (int, float)), row
            assert "fii_20d" in row
        # latest rows must carry provisional NSE data
        tail = series[-5:]
        assert any(t.get("dii_net") is not None for t in tail), "no dii_net in last 5 rows"
        assert any(t.get("nse_fii_net") is not None for t in tail), "no nse_fii_net in last 5 rows"
        _check_provenance(d["provenance"], "fii")
        _check_provenance(d["provenance"], "dii")

    def test_daily_1y_spans_year(self, client):
        r = get(client, "/flows/daily", range="1y")
        assert r.status_code == 200, r.text
        series = r.json()["series"]
        assert len(series) >= 200, f"expected ~240+ trading days, got {len(series)}"
        dates = [date.fromisoformat(s["date"]) for s in series]
        assert dates == sorted(dates), "series not sorted ascending"
        assert len(set(dates)) == len(dates), "duplicate dates in series"
        span_days = (dates[-1] - dates[0]).days
        assert span_days > 300, f"span only {span_days} days"
        # no weekend rows (trading days only)
        weekend = [d.isoformat() for d in dates if d.weekday() >= 5]
        assert not weekend, f"weekend dates present: {weekend[:5]}"
        # numeric, non-fabricated sanity: not all identical
        nets = [s["fii_net"] for s in series]
        assert len(set(nets)) > len(nets) * 0.8

    @pytest.mark.parametrize("rng", ["1m", "3m", "6m", "ytd", "1y"])
    def test_daily_ranges(self, client, rng):
        r = get(client, "/flows/daily", range=rng)
        assert r.status_code == 200, r.text
        assert len(r.json()["series"]) > 0


# ---------------- /api/flows/stats ----------------
class TestFlowsStats:
    def test_stats(self, client):
        r = get(client, "/flows/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        fii = d["fii"]
        assert fii is not None
        for f in ("streak_direction", "streak_days", "sum_5d", "sum_20d", "sum_60d",
                  "zscore_20d", "net_to_gross_20d_pct", "last_date"):
            assert f in fii and fii[f] is not None, f"fii.{f} missing"
        assert fii["streak_direction"] in ("buying", "selling", "flat", "none", "neutral"), fii["streak_direction"]
        assert isinstance(fii["streak_days"], int) and fii["streak_days"] >= 1
        assert DATE_RE.match(fii["last_date"])
        for f in ("sum_5d", "sum_20d", "sum_60d", "zscore_20d", "net_to_gross_20d_pct"):
            assert isinstance(fii[f], (int, float))
        pl = d["provisional_latest"]
        assert pl and pl.get("fii_net") is not None and pl.get("dii_net") is not None, pl
        assert DATE_RE.match(pl["date"])
        _check_provenance(d["provenance"], "fii")
        _check_provenance(d["provenance"], "dii")


# ---------------- /api/indices ----------------
class TestIndices:
    def test_indices_6m(self, client):
        r = get(client, "/indices", range="6m")
        assert r.status_code == 200, r.text
        d = r.json()
        idx = d["indices"]
        assert len(idx) == 4
        keys = {i["key"] for i in idx}
        assert keys == {"NIFTY50", "NIFTY500", "NIFTYBANK", "INDIAVIX"}, keys
        for i in idx:
            assert len(i["series"]) > 50, f"{i['key']} series len {len(i['series'])}"
            assert i["latest"] and isinstance(i["latest"]["close"], (int, float)) and i["latest"]["close"] > 0
            assert DATE_RE.match(i["latest"]["date"])
            assert isinstance(i["change_pct"], (int, float)), i["key"]
            rets = i["returns"]
            for w in ("5d", "20d", "60d", "1y"):
                assert w in rets and isinstance(rets[w], (int, float)), f"{i['key']} return {w}={rets.get(w)}"
        assert d["provenance"]["data_date"]


# ---------------- /api/compare ----------------
class TestCompare:
    def test_compare_nifty50_6m(self, client):
        r = get(client, "/compare", index="NIFTY50", range="6m")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["index"] == "NIFTY50" and d["range"] == "6m"
        series = d["series"]
        assert len(series) > 100, f"only {len(series)} merged rows"
        for row in series[:20]:
            assert DATE_RE.match(row["date"])
            assert isinstance(row["fii_net"], (int, float))
            assert isinstance(row["fii_cum"], (int, float))
            assert isinstance(row["close"], (int, float)) and row["close"] > 0
            assert row["ret_pct"] is None or isinstance(row["ret_pct"], (int, float))
            assert isinstance(row["index_rebased"], (int, float))
        corr = d["correlation"]
        for k in ("same_day", "flow_leads_return", "return_leads_flow"):
            assert k in corr, k
            assert isinstance(corr[k]["r"], (int, float)), corr[k]
            assert -1.0001 <= corr[k]["r"] <= 1.0001
            assert isinstance(corr[k]["n"], int) and corr[k]["n"] > 50
        assert "flows" in d["provenance"] and "index" in d["provenance"]

    @pytest.mark.parametrize("index", ["NIFTY50", "NIFTY500", "NIFTYBANK", "INDIAVIX"])
    def test_compare_all_indices(self, client, index):
        r = get(client, "/compare", index=index, range="6m")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["index"] == index
        assert len(d["series"]) > 50, f"{index}: {len(d['series'])} rows"

    @pytest.mark.parametrize("rng", ["1m", "3m", "6m", "ytd", "1y"])
    def test_compare_all_ranges_no_500(self, client, rng):
        """Regression: shadowed builtin `range` previously caused 500."""
        r = get(client, "/compare", index="NIFTY50", range=rng)
        assert r.status_code == 200, f"range={rng} -> {r.status_code}: {r.text[:300]}"
        assert len(r.json()["series"]) > 0, f"range={rng} empty series"

    def test_compare_invalid_index_400(self, client):
        r = get(client, "/compare", index="FOO")
        assert r.status_code == 400, f"got {r.status_code}: {r.text[:200]}"


# ---------------- /api/sectors ----------------
class TestSectors:
    def test_sectors_12_periods(self, client):
        r = get(client, "/sectors", periods=12)
        assert r.status_code == 200, r.text
        d = r.json()
        fns = d["fortnights"]
        assert len(fns) == 12, f"got {len(fns)} fortnights"
        for f in fns:
            assert DATE_RE.match(f["start"]) and DATE_RE.match(f["end"])
        secs = d["sectors"]
        assert 18 <= len(secs) <= 30, f"got {len(secs)} sectors"
        for s in secs:
            assert s["sector"] and "Total" not in s["sector"]
            for f in ("net_equity_latest", "net_equity_3fn", "net_equity_6fn", "auc_equity"):
                assert isinstance(s[f], (int, float)), f"{s['sector']}.{f}={s[f]}"
            assert isinstance(s["auc_weight_pct"], (int, float))
            assert s["flow_intensity_pct"] is None or isinstance(s["flow_intensity_pct"], (int, float))
            assert s["streak_direction"] in ("buying", "selling", "flat", "none", "neutral", None)
            assert isinstance(s["streak_periods"], int)
            assert len(s["history"]) == 12, f"{s['sector']} history {len(s['history'])}"
        latest = d["latest"]
        assert isinstance(latest["total_net_equity"], (int, float))
        assert isinstance(latest["total_auc_equity"], (int, float)) and latest["total_auc_equity"] > 0
        # sorted descending by latest net
        nets = [s["net_equity_latest"] for s in secs]
        assert nets == sorted(nets, reverse=True)
        assert d["provenance"]["data_date"]

    def test_sectors_periods_validation(self, client):
        assert get(client, "/sectors", periods=1).status_code == 422
        assert get(client, "/sectors", periods=99).status_code == 422
        r = get(client, "/sectors", periods=6)
        assert r.status_code == 200
        assert len(r.json()["fortnights"]) == 6


# ---------------- exports ----------------
class TestExports:
    def test_export_daily_csv(self, client):
        r = client.get(f"{API}/export/daily.csv", params={"range": "6m"}, timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert "text/csv" in r.headers.get("content-type", "")
        lines = [ln for ln in r.text.strip().splitlines() if ln]
        assert len(lines) > 50, f"only {len(lines)} lines"
        assert lines[0].startswith("date,fii_buy,fii_sell,fii_net")
        assert len(lines[1].split(",")) == len(lines[0].split(","))

    def test_export_sectors_csv(self, client):
        r = client.get(f"{API}/export/sectors.csv", timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert "text/csv" in r.headers.get("content-type", "")
        lines = [ln for ln in r.text.strip().splitlines() if ln]
        assert len(lines) > 15
        assert lines[0].startswith("sector,auc_equity_latest_cr,auc_weight_pct,net_")


# ---------------- /api/sectors/rotation (NEW: Sector Rotation Map) ----------------
EXACT_SECTORS = {"Information Technology", "Financial Services", "Healthcare", "Realty", "Chemicals",
                 "Metals & Mining", "Consumer Durables", "Fast Moving Consumer Goods",
                 "Automobile and Auto Components", "Oil, Gas & Consumable Fuels",
                 "Media, Entertainment & Publication"}
APPROX_SECTORS = {"Consumer Services", "Services", "Power", "Construction", "Capital Goods"}


class TestSectorRotation:
    @pytest.fixture(scope="class")
    def rot(self, client):
        r = get(client, "/sectors/rotation", periods=8)
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_fortnight_count_and_order(self, rot):
        fns = rot["fortnights"]
        assert len(fns) == 8, len(fns)
        ends = [f["end"] for f in fns]
        assert ends == sorted(ends), "fortnights not chronological"
        for f in fns:
            assert DATE_RE.match(f["start"]) and DATE_RE.match(f["end"])
            assert f["start"] < f["end"]
            assert len(f["rows"]) >= 20, len(f["rows"])

    def test_rows_schema_and_types(self, rot):
        for f in rot["fortnights"]:
            for row in f["rows"]:
                assert row["sector"] not in ("Grand Total", "Total", "Sovereign", "Others")
                assert isinstance(row["net_equity"], (int, float))
                assert isinstance(row["flow_intensity_pct"], (int, float))
                assert -100 < row["flow_intensity_pct"] < 100
                assert row["match"] in ("exact", "approx", None)
                if row["match"] is None:
                    assert row["index_name"] is None
                    assert row["index_return_pct"] is None
                else:
                    assert row["index_name"]

    def test_mapped_sectors_have_numeric_returns(self, rot):
        latest = rot["fortnights"][-1]["rows"]
        by_sector = {r["sector"]: r for r in latest}
        for name in ("Information Technology", "Financial Services"):
            row = by_sector[name]
            assert row["match"] == "exact", row
            assert isinstance(row["index_return_pct"], (int, float)), row
            assert -50 < row["index_return_pct"] < 50
        assert by_sector["Textiles"]["index_return_pct"] is None
        assert by_sector["Textiles"]["match"] is None
        for name in APPROX_SECTORS & set(by_sector):
            assert by_sector[name]["match"] == "approx"

    def test_mapping_object(self, rot):
        mp = rot["mapping"]
        assert len(mp) >= 16, len(mp)
        for sec, v in mp.items():
            assert v["index"] and v["match"] in ("exact", "approx")
        for sec in EXACT_SECTORS:
            assert mp[sec]["match"] == "exact", sec
        for sec in APPROX_SECTORS:
            assert mp[sec]["match"] == "approx", sec

    def test_provenance(self, rot):
        p = rot["provenance"]
        assert p["flows"]["id"] == "nsdl_sectors"
        assert p["flows"]["status"] == "ok", p["flows"].get("error")
        idx = p["index"]
        assert idx["id"] == "sector_indices"
        assert idx["status"] == "ok", idx.get("error")
        assert DATE_RE.match(idx["data_date"] or "")
        assert idx["url"] and idx["quality"] == "partial"

    def test_periods_validation(self, client):
        assert get(client, "/sectors/rotation", periods=1).status_code == 422
        assert get(client, "/sectors/rotation", periods=25).status_code == 422
        r = get(client, "/sectors/rotation", periods=3)
        assert r.status_code == 200 and len(r.json()["fortnights"]) == 3


# ---------------- /api/holdings (NEW: stock-level FII shareholding) ----------------
class TestHoldings:
    @pytest.fixture(scope="class")
    def hold(self, client):
        r = get(client, "/holdings")
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_top_level(self, hold):
        assert hold["universe"] == "NIFTY 100"
        assert hold["count"] >= 95, hold["count"]
        assert hold["count"] == len(hold["stocks"])
        assert re.match(r"^[A-Z][a-z]{2} \d{4}$", hold["latest_quarter"] or ""), hold["latest_quarter"]
        assert hold["status"] == "ok", hold["status"]

    def test_stock_schema(self, hold):
        for s in hold["stocks"]:
            assert s["symbol"] and isinstance(s["symbol"], str)
            assert s["name"] and s["industry"]
            assert isinstance(s["fii_pct"], (int, float)) and 0 <= s["fii_pct"] <= 100
            assert isinstance(s["fii_prev_pct"], (int, float))
            assert isinstance(s["change_qoq_pp"], (int, float))
            assert s["change_yoy_pp"] is None or isinstance(s["change_yoy_pp"], (int, float))
            assert isinstance(s["consecutive_quarters"], int)
            assert 2 <= len(s["quarters"]) <= 8, s["symbol"]
            assert 2 <= len(s["fii_series"]) <= 8
            assert len(s["quarters"]) == len(s["fii_series"])
            assert str(s["source_url"]).startswith("https://www.screener.in/")
            assert abs(round(s["fii_pct"] - s["fii_prev_pct"], 2) - s["change_qoq_pp"]) < 0.011

    def test_sorted_by_qoq_desc(self, hold):
        vals = [s["change_qoq_pp"] for s in hold["stocks"]]
        assert vals == sorted(vals, reverse=True)
        assert vals[0] > 0 and vals[-1] < 0, (vals[0], vals[-1])

    def test_no_mongo_id_and_provenance(self, hold):
        assert all("_id" not in s for s in hold["stocks"])
        p = hold["provenance"]
        assert p["id"] == "holdings" and p["status"] == "ok"
        assert p["data_date"] == hold["latest_quarter"]
        assert p["url"] and p["quality"] == "verified"


# ---------------- /api/deals/fpi (NEW: daily FPI bulk/block deals) ----------------
class TestFpiDeals:
    @pytest.fixture(scope="class")
    def deals(self, client):
        r = get(client, "/deals/fpi", days=10)
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_days_and_ordering(self, deals):
        days = deals["days"]
        assert len(days) >= 5, len(days)
        dates = [d["date"] for d in days]
        assert dates == sorted(dates, reverse=True), "days not newest-first"
        assert all(DATE_RE.match(d) for d in dates)
        cov = deals["dates_covered"]
        assert cov == sorted(cov) and len(cov) <= 10
        assert set(dates) <= set(cov)

    def test_items_schema(self, deals):
        seen = 0
        for day in deals["days"]:
            assert len(day["top_buys"]) <= 5 and len(day["top_sells"]) <= 5
            for side in ("top_buys", "top_sells"):
                vals = [i["value_cr"] for i in day[side]]
                assert vals == sorted(vals, reverse=True), f"{day['date']} {side} not sorted"
                for it in day[side]:
                    seen += 1
                    assert it["symbol"] and it["name"] is not None
                    assert isinstance(it["value_cr"], (int, float)) and it["value_cr"] >= 0
                    assert isinstance(it["qty"], (int, float)) and it["qty"] > 0
                    assert isinstance(it["clients"], list) and len(it["clients"]) >= 1
                    assert isinstance(it["kinds"], list) and set(it["kinds"]) <= {"bulk", "block"}
            assert day["buy_count"] >= len(day["top_buys"])
            assert day["sell_count"] >= len(day["top_sells"])
        assert seen > 5, f"only {seen} deal items across all days"

    def test_counts_and_provenance(self, deals):
        assert 0 < deals["fpi_deal_rows"] <= deals["all_deal_rows"]
        p = deals["provenance"]
        assert p["id"] == "deals" and p["status"] == "ok"
        assert p["quality"] == "partial"
        assert DATE_RE.match(p["data_date"] or "")

    def test_days_param(self, client):
        assert get(client, "/deals/fpi", days=0).status_code == 422
        assert get(client, "/deals/fpi", days=31).status_code == 422
        r = get(client, "/deals/fpi", days=3)
        assert r.status_code == 200
        assert len(r.json()["dates_covered"]) <= 3


# ---------------- refresh ----------------
class TestRefresh:
    def test_refresh_all(self, client):
        r = client.post(f"{API}/refresh", timeout=90)
        assert r.status_code == 200, r.text
        queued = r.json()["queued"]
        assert isinstance(queued, list) and len(queued) >= 3
        # subsequent calls still work
        r2 = get(client, "/flows/stats")
        assert r2.status_code == 200
        assert r2.json()["fii"] is not None

    def test_refresh_unknown_source_400(self, client):
        r = client.post(f"{API}/refresh", params={"source": "bogus"}, timeout=30)
        assert r.status_code == 400, r.status_code
