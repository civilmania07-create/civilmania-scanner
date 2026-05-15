"""
CivilMania Growth Stock Scraper
================================
Fetches fundamental + price data from multiple free sources,
scores each stock against the 8-pillar framework, and upserts
to Supabase for the live React dashboard.

Sources used (all free / no API key needed):
  - screener.in      → fundamentals (via CSV export or web scrape)
  - nseindia.com     → delivery %, volume data
  - finance.yahoo    → price, 52W high, EMA
  - moneycontrol     → FII/DII holding data (optional)

Run daily at 8:00 AM on weekdays via cron:
  0 8 * * 1-5 cd /path/to/backend && python scraper.py

Author: CivilMania Capital Research
"""

import os
import time
import json
import logging
import requests
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

# ── CONFIG ──────────────────────────────────────────────────────────────────
load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")  # service role key, not anon
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── UNIVERSE: NSE stocks to track ───────────────────────────────────────────
# Add/remove symbols as needed. These get enriched with live data.
WATCHLIST = {
    # Defence & Aerospace
    "HAL":        {"name":"Hindustan Aeronautics",      "sector":"Defence",         "theme":"Defence"},
    "BEL":        {"name":"Bharat Electronics",         "sector":"Defence",         "theme":"Defence"},
    "MTAR":       {"name":"MTAR Technologies",          "sector":"Defence",         "theme":"Defence"},
    "PARAS":      {"name":"Paras Defence",              "sector":"Defence",         "theme":"Defence"},
    "GRSE":       {"name":"Garden Reach Shipbuilders",  "sector":"Defence",         "theme":"Defence"},
    "COCHINSHIP": {"name":"Cochin Shipyard",            "sector":"Defence",         "theme":"Defence"},
    "SOLARINDS":  {"name":"Solar Industries",           "sector":"Defence",         "theme":"Defence"},
    "DRDO":       {"name":"Data Patterns India",        "sector":"Defence",         "theme":"Defence"},
    # EMS & Electronics
    "DIXON":      {"name":"Dixon Technologies",         "sector":"EMS",             "theme":"EMS"},
    "KAYNES":     {"name":"Kaynes Technology",          "sector":"EMS",             "theme":"EMS"},
    "SYRMA":      {"name":"Syrma SGS Technology",       "sector":"EMS",             "theme":"EMS"},
    "IDEAFORGE":  {"name":"ideaForge Technology",       "sector":"EMS",             "theme":"Defence"},
    "AVALON":     {"name":"Avalon Technologies",        "sector":"EMS",             "theme":"EMS"},
    "AMBER":      {"name":"Amber Enterprises",         "sector":"EMS",             "theme":"EMS"},
    # Power & Energy
    "TRIL":       {"name":"Transformers & Rectifiers",  "sector":"Power",           "theme":"Power"},
    "VOLTAMP":    {"name":"Voltamp Transformers",       "sector":"Power",           "theme":"Power"},
    "INOXWIND":   {"name":"Inox Wind",                 "sector":"Renewable Energy","theme":"Renewable Energy"},
    "SUZLON":     {"name":"Suzlon Energy",             "sector":"Renewable Energy","theme":"Renewable Energy"},
    "CESC":       {"name":"CESC Ltd",                  "sector":"Power",           "theme":"Power"},
    "POWERGRID":  {"name":"Power Grid Corp",           "sector":"Power",           "theme":"Power"},
    # Railways
    "RVNL":       {"name":"Rail Vikas Nigam",          "sector":"Railways",        "theme":"Railways"},
    "IRFC":       {"name":"Indian Railway Finance",    "sector":"Railways",        "theme":"Railways"},
    "TITAGARH":   {"name":"Titagarh Rail Systems",     "sector":"Railways",        "theme":"Railways"},
    "TEXMACO":    {"name":"Texmaco Rail",              "sector":"Railways",        "theme":"Railways"},
    "JWL":        {"name":"Jupiter Wagons",            "sector":"Railways",        "theme":"Railways"},
    # Capital Goods
    "THERMAX":    {"name":"Thermax",                   "sector":"Capital Goods",   "theme":"Capital Goods"},
    "ABB":        {"name":"ABB India",                 "sector":"Capital Goods",   "theme":"Capital Goods"},
    "CUMMINS":    {"name":"Cummins India",             "sector":"Capital Goods",   "theme":"Capital Goods"},
    "ELGIEQUIP":  {"name":"Elgi Equipments",           "sector":"Capital Goods",   "theme":"Manufacturing"},
    "HGINFRA":    {"name":"H.G. Infra Engineering",   "sector":"Construction",    "theme":"Capital Goods"},
    "KPIL":       {"name":"Kalpataru Projects",        "sector":"Construction",    "theme":"Capital Goods"},
    # Pharma
    "DIVISLABS":  {"name":"Divis Laboratories",        "sector":"Pharma",          "theme":"Manufacturing"},
    "JBCHEPHARM": {"name":"JB Chemicals",              "sector":"Pharma",          "theme":"Manufacturing"},
    "GLENMARK":   {"name":"Glenmark Pharma",           "sector":"Pharma",          "theme":"Manufacturing"},
    # IT / Tech
    "PERSISTENT": {"name":"Persistent Systems",        "sector":"IT",              "theme":"Manufacturing"},
    "COFORGE":    {"name":"Coforge",                   "sector":"IT",              "theme":"Manufacturing"},
    "MASTEK":     {"name":"Mastek",                    "sector":"IT",              "theme":"Manufacturing"},
    # Chemicals
    "CLEAN":      {"name":"Clean Science Technology",  "sector":"Chemicals",       "theme":"Manufacturing"},
    "FINEORG":    {"name":"Fine Organic Industries",   "sector":"Chemicals",       "theme":"Manufacturing"},
    "NOCIL":      {"name":"NOCIL Ltd",                 "sector":"Chemicals",       "theme":"Manufacturing"},
}

# ── SCREENER.IN FETCHER ─────────────────────────────────────────────────────
SCREENER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
}

def fetch_screener(symbol: str) -> dict:
    """Fetch fundamental data from Screener.in company API."""
    url = f"https://www.screener.in/api/company/{symbol}/?format=json"
    try:
        r = requests.get(url, headers=SCREENER_HEADERS, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning(f"Screener fetch failed for {symbol}: {e}")
        return {}

def parse_screener(data: dict) -> dict:
    """Extract key fundamentals from Screener.in JSON response."""
    out = {}
    try:
        ratios = {r["name"]: r["values"] for r in data.get("ratios", [])}

        def latest(key):
            vals = ratios.get(key, [{}])
            # Get most recent non-null value
            for v in reversed(vals):
                if v.get("value") is not None:
                    try: return float(str(v["value"]).replace(",","").replace("%",""))
                    except: pass
            return None

        def growth(key, periods=4):
            """Calculate YoY growth from quarterly data."""
            vals = ratios.get(key, [])
            nums = []
            for v in vals:
                try: nums.append(float(str(v.get("value","0")).replace(",","").replace("%","")))
                except: nums.append(None)
            nums = [n for n in nums if n is not None]
            if len(nums) >= periods + 1:
                old = nums[-(periods+1)]
                new = nums[-1]
                if old and old != 0:
                    return round(((new - old) / abs(old)) * 100, 1)
            return None

        out["roce"]           = latest("Return on capital employed")
        out["roe"]            = latest("Return on equity")
        out["opm"]            = latest("Operating profit margin")
        out["debt_equity"]    = latest("Debt to equity")
        out["icr"]            = latest("Interest coverage ratio")
        out["peg"]            = latest("PEG Ratio")
        out["market_cap"]     = latest("Market Capitalization")
        out["sales_growth"]   = growth("Net Sales", 4)
        out["profit_growth"]  = growth("Net Profit", 4)
        out["eps_growth"]     = growth("EPS", 4)

        # Piotroski estimation from available signals
        p_score = 0
        if out.get("roce") and out["roce"] > 0: p_score += 1
        if out.get("roe") and out["roe"] > 0: p_score += 1
        if out.get("debt_equity") and out["debt_equity"] < 1: p_score += 1
        if out.get("opm") and out["opm"] > 0: p_score += 1
        if out.get("sales_growth") and out["sales_growth"] > 0: p_score += 1
        if out.get("profit_growth") and out["profit_growth"] > 0: p_score += 1
        if out.get("icr") and out["icr"] > 3: p_score += 1
        out["piotroski"] = p_score

        # Altman Z-Score simplified estimate (public company version)
        # Full calc needs balance sheet items — approximation here
        if out.get("roce") and out.get("debt_equity") is not None:
            de = out["debt_equity"] or 0.1
            out["altman_z"] = round(min(6.0, (out["roce"] / 10) + (3.0 / max(de, 0.1))), 1)
        else:
            out["altman_z"] = None

        # Shareholding
        sh = data.get("shareholding", {})
        promoter = sh.get("promoter", 0) or 0
        fii      = sh.get("fii", 0) or 0
        dii      = sh.get("dii", 0) or 0
        pledge   = sh.get("pledge", 0) or 0
        out["smart_money"]     = round(promoter + fii + dii, 1)
        out["promoter_pledge"] = round(pledge, 1)

    except Exception as e:
        log.warning(f"Screener parse error: {e}")

    return out


# ── NSE DELIVERY + VOLUME ────────────────────────────────────────────────────
NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com",
}

def fetch_nse_delivery(symbol: str) -> dict:
    """
    Fetch delivery % and volume data from NSE.
    Returns delivery_spike and volume_spike vs 20-day average.
    """
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    # Warm up cookie
    session.get("https://www.nseindia.com", timeout=10)
    time.sleep(1)

    url = f"https://www.nseindia.com/api/historical/securityArchives?from={_days_ago(25)}&to={_today()}&symbol={symbol}&dataType=alltradeinfo&series=EQ"
    try:
        r = session.get(url, timeout=15)
        r.raise_for_status()
        data = r.json().get("data", [])
        if not data:
            return {}

        df = pd.DataFrame(data)
        df["delivery_pct"] = pd.to_numeric(df.get("DELIV_PER", pd.Series()), errors="coerce")
        df["volume"]       = pd.to_numeric(df.get("VOLUME", pd.Series()), errors="coerce")

        if len(df) < 2:
            return {}

        latest_del  = df["delivery_pct"].iloc[-1]
        avg_del_20  = df["delivery_pct"].iloc[:-1].mean()
        latest_vol  = df["volume"].iloc[-1]
        avg_vol_20  = df["volume"].iloc[:-1].mean()

        del_spike = round(latest_del / avg_del_20, 2) if avg_del_20 else None
        vol_spike = round(latest_vol / avg_vol_20, 2) if avg_vol_20 else None

        return { "delivery_spike": del_spike, "volume_spike": vol_spike }
    except Exception as e:
        log.warning(f"NSE delivery fetch failed for {symbol}: {e}")
        return {}


# ── YAHOO FINANCE: RS RATING, EMA, 52W ──────────────────────────────────────
def fetch_yahoo(symbol: str) -> dict:
    """Fetch price data from Yahoo Finance for RS, EMA, 52W high check."""
    ticker = f"{symbol}.NS"
    url    = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y"
    try:
        r = requests.get(url, timeout=15,
            headers={"User-Agent":"Mozilla/5.0"})
        r.raise_for_status()
        body   = r.json()["chart"]["result"][0]
        closes = body["indicators"]["quote"][0]["close"]
        closes = [c for c in closes if c is not None]

        if len(closes) < 200:
            return {}

        price   = closes[-1]
        high52w = max(closes[-252:]) if len(closes) >= 252 else max(closes)

        # EMAs
        ema21  = _ema(closes, 21)
        ema63  = _ema(closes, 63)
        ema200 = _ema(closes, 200)

        above_all_ema = price > ema21 > ema63 > ema200
        near_high     = price >= high52w * 0.75  # within 25%

        # RS Rating: 1-yr performance vs Nifty50 (approximate)
        nifty_closes = _fetch_nifty_closes()
        if nifty_closes and len(nifty_closes) == len(closes):
            stock_ret  = (closes[-1] / closes[-63] - 1) * 100  # 3M
            nifty_ret  = (nifty_closes[-1] / nifty_closes[-63] - 1) * 100
            rs_raw     = stock_ret - nifty_ret
            rs_rating  = min(99, max(1, int(50 + rs_raw * 2)))
        else:
            rs_rating  = None

        base_breakout = _detect_base(closes)

        return {
            "rs_rating":       rs_rating,
            "base_breakout":   base_breakout,
            "sector_outperform": rs_rating > 60 if rs_rating else False,
        }
    except Exception as e:
        log.warning(f"Yahoo fetch failed for {symbol}: {e}")
        return {}


_nifty_cache = None
def _fetch_nifty_closes():
    global _nifty_cache
    if _nifty_cache:
        return _nifty_cache
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENII?interval=1d&range=1y"
        r = requests.get(url, timeout=15, headers={"User-Agent":"Mozilla/5.0"})
        closes = r.json()["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        _nifty_cache = [c for c in closes if c is not None]
        return _nifty_cache
    except:
        return None

def _ema(closes, period):
    k = 2 / (period + 1)
    ema = closes[0]
    for c in closes[1:]:
        ema = c * k + ema * (1 - k)
    return ema

def _detect_base(closes, lookback=40):
    """Simple tight base detection: low volatility in recent N days."""
    if len(closes) < lookback + 1:
        return False
    recent = closes[-lookback:]
    high, low = max(recent), min(recent)
    if low == 0:
        return False
    range_pct = (high - low) / low * 100
    # Base = consolidation where range is < 25% and price hasn't broken down
    return range_pct < 25 and closes[-1] > closes[-lookback]

def _today():
    return datetime.now().strftime("%d-%m-%Y")

def _days_ago(n):
    return (datetime.now() - timedelta(days=n)).strftime("%d-%m-%Y")


# ── AVOID FLAG DETECTION ─────────────────────────────────────────────────────
def check_avoid_flags(screener_data: dict, parsed: dict) -> dict:
    """
    Detect automatic disqualification signals.
    Returns avoid_flag=True if any red flag is present.
    """
    flags = []

    # Negative CFO
    cfo_positive = True  # default assumption; refine with actual CFO data
    parsed["cfo_positive"] = cfo_positive

    # High pledge
    if parsed.get("promoter_pledge", 0) > 5:
        flags.append("High pledge")

    # High debt
    if parsed.get("debt_equity", 0) and parsed["debt_equity"] > 1.5:
        flags.append("High D/E")

    # Very low Piotroski
    if parsed.get("piotroski", 9) < 4:
        flags.append("Low Piotroski")

    return {
        "avoid_flag": len(flags) > 0,
        "trigger": ", ".join(flags) if flags else None
    }


# ── SECTOR INDUSTRY RANK (static map, update quarterly) ──────────────────────
INDUSTRY_RANKS = {
    "Defence": 2, "EMS": 3, "Power": 5, "Renewable Energy": 4,
    "Railways": 6, "Capital Goods": 7, "Manufacturing": 8,
    "Pharma": 10, "IT": 12, "Consumer": 15, "Chemicals": 9, "Construction": 11,
}

TRIGGERS = {
    "HAL":"Large order wins", "BEL":"Govt policy tailwind", "MTAR":"Export growth",
    "GRSE":"Large order wins", "COCHINSHIP":"Capacity expansion", "DIXON":"New product",
    "KAYNES":"Capacity expansion", "RVNL":"Large order wins", "JWL":"Capacity expansion",
    "TITAGARH":"Large order wins", "INOXWIND":"Capacity expansion", "SUZLON":"Capacity expansion",
}

# ── MAIN SCRAPER LOOP ────────────────────────────────────────────────────────
def run():
    log.info(f"=== CivilMania Scraper Started: {datetime.now().isoformat()} ===")
    log.info(f"Tracking {len(WATCHLIST)} stocks")

    results = []
    for symbol, meta in WATCHLIST.items():
        log.info(f"Processing {symbol}...")
        try:
            # 1. Fundamentals from Screener.in
            raw       = fetch_screener(symbol)
            parsed    = parse_screener(raw)

            # 2. Delivery + Volume from NSE
            nse_data  = fetch_nse_delivery(symbol)

            # 3. Price / RS / EMA from Yahoo
            price_data = fetch_yahoo(symbol)

            # 4. Avoid flags
            avoid_data = check_avoid_flags(raw, parsed)

            # 5. FII trend (simplified: if smart_money is high, mark increasing)
            fii_increasing = parsed.get("smart_money", 0) >= 50

            stock_row = {
                "symbol":          symbol,
                "name":            meta["name"],
                "sector":          meta["sector"],
                "theme":           meta["theme"],
                "trigger":         TRIGGERS.get(symbol, "Capacity expansion"),
                "industry_rank":   INDUSTRY_RANKS.get(meta["theme"], 15),
                "fii_increasing":  fii_increasing,
                "updated_at":      datetime.now().isoformat(),
                **parsed,
                **nse_data,
                **price_data,
                **avoid_data,
            }

            results.append(stock_row)
            log.info(f"  ✓ {symbol}: ROCE={parsed.get('roce')}%, RS={price_data.get('rs_rating')}")
            time.sleep(1.5)  # polite delay between requests

        except Exception as e:
            log.error(f"  ✗ {symbol} failed: {e}")
            continue

    # ── UPSERT TO SUPABASE ──
    if results:
        log.info(f"Upserting {len(results)} stocks to Supabase...")
        try:
            # Batch upsert (on conflict: update)
            resp = supabase.table("stocks").upsert(
                results,
                on_conflict="symbol"
            ).execute()
            log.info(f"✅ Supabase upsert complete: {len(results)} records")
        except Exception as e:
            log.error(f"Supabase upsert failed: {e}")
    else:
        log.warning("No results to upsert!")

    log.info(f"=== Scraper Complete: {datetime.now().isoformat()} ===\n")


if __name__ == "__main__":
    run()
