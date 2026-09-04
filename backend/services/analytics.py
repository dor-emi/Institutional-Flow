import math
from statistics import mean, pstdev


def _rolling_sum(vals, n):
    out = []
    for i in range(len(vals)):
        window = [v for v in vals[max(0, i - n + 1): i + 1] if v is not None]
        out.append(round(sum(window), 2) if len(window) == n else None)
    return out


def enrich_daily(series):
    """series: list sorted by date with 'fii_net' (float|None). Adds cumulative + rolling sums."""
    nets = [r.get("fii_net") for r in series]
    cum = 0.0
    r5 = _rolling_sum(nets, 5)
    r20 = _rolling_sum(nets, 20)
    for i, r in enumerate(series):
        if nets[i] is not None:
            cum += nets[i]
        r["fii_cum"] = round(cum, 2)
        r["fii_5d"] = r5[i]
        r["fii_20d"] = r20[i]
    return series


def streak(nets):
    """Consecutive same-sign days at the end of the series. Returns (direction, length)."""
    nets = [v for v in nets if v is not None]
    if not nets:
        return None, 0
    sign = 1 if nets[-1] > 0 else -1 if nets[-1] < 0 else 0
    if sign == 0:
        return "flat", 0
    n = 0
    for v in reversed(nets):
        if (v > 0) == (sign > 0) and v != 0:
            n += 1
        else:
            break
    return ("buying" if sign > 0 else "selling"), n


def persistence_stats(series):
    nets = [r.get("fii_net") for r in series if r.get("fii_net") is not None]
    if len(nets) < 5:
        return None
    direction, length = streak(nets)
    last20 = nets[-20:]
    last5 = nets[-5:]
    buy_days_20 = sum(1 for v in last20 if v > 0)
    r20 = _rolling_sum(nets, 20)
    hist20 = [v for v in r20[:-1] if v is not None][-230:]
    z = None
    if len(hist20) >= 40 and r20[-1] is not None:
        sd = pstdev(hist20)
        z = round((r20[-1] - mean(hist20)) / sd, 2) if sd > 0 else None
    daily_sd = pstdev(nets[-120:]) if len(nets) >= 30 else None
    intensity = None
    gross = [(r.get("fii_buy") or 0) + (r.get("fii_sell") or 0) for r in series[-20:] if r.get("fii_net") is not None]
    if gross and sum(gross) > 0:
        intensity = round(sum(last20) / sum(gross) * 100, 2)
    return {
        "streak_direction": direction,
        "streak_days": length,
        "sum_5d": round(sum(last5), 2),
        "sum_20d": round(sum(last20), 2),
        "sum_60d": round(sum(nets[-60:]), 2),
        "buy_days_20d": buy_days_20,
        "sell_days_20d": len(last20) - buy_days_20,
        "zscore_20d": z,
        "zscore_history_days": len(hist20),
        "daily_stdev_120d": round(daily_sd, 2) if daily_sd else None,
        "net_to_gross_20d_pct": intensity,
        "last_date": series[-1]["date"],
        "last_net": nets[-1],
    }


def pearson(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    n = len(pairs)
    if n < 5:
        return None, n
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pairs)
    vx = sum((p[0] - mx) ** 2 for p in pairs)
    vy = sum((p[1] - my) ** 2 for p in pairs)
    if vx == 0 or vy == 0:
        return None, n
    return round(cov / math.sqrt(vx * vy), 3), n
