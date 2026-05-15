-- ══════════════════════════════════════════════════════════════
-- CivilMania Growth Scanner — Supabase Database Schema
-- Run this in: supabase.com → Project → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Drop existing table if recreating
-- DROP TABLE IF EXISTS stocks;

CREATE TABLE IF NOT EXISTS stocks (
  id                SERIAL PRIMARY KEY,

  -- Identity
  symbol            VARCHAR(20) UNIQUE NOT NULL,
  name              TEXT,
  sector            TEXT,
  theme             TEXT,
  trigger           TEXT,

  -- Market data
  market_cap        NUMERIC,           -- in Crores

  -- GROWTH FILTERS
  sales_growth      NUMERIC,           -- % YoY
  profit_growth     NUMERIC,           -- % YoY
  eps_growth        NUMERIC,           -- % YoY
  roce              NUMERIC,           -- %
  roe               NUMERIC,           -- %
  opm               NUMERIC,           -- Operating Profit Margin %

  -- FINANCIAL STRENGTH
  peg               NUMERIC,           -- PEG ratio
  debt_equity       NUMERIC,           -- D/E ratio
  icr               NUMERIC,           -- Interest Coverage Ratio
  cfo_positive      BOOLEAN DEFAULT false,  -- Is CFO positive?
  piotroski         NUMERIC,           -- Piotroski F-Score /9
  altman_z          NUMERIC,           -- Altman Z-Score

  -- OWNERSHIP
  smart_money       NUMERIC,           -- Promoter + FII + DII %
  promoter_pledge   NUMERIC DEFAULT 0, -- Pledge %
  fii_increasing    BOOLEAN DEFAULT false,

  -- SECTOR
  sector_outperform BOOLEAN DEFAULT false,
  industry_rank     NUMERIC,           -- lower is better

  -- MOMENTUM (from NSE + Yahoo)
  rs_rating         NUMERIC,           -- 1–99
  delivery_spike    NUMERIC,           -- x times average
  volume_spike      NUMERIC,           -- x times average
  base_breakout     BOOLEAN DEFAULT false,

  -- FLAGS
  avoid_flag        BOOLEAN DEFAULT false,

  -- Metadata
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stocks_theme   ON stocks(theme);
CREATE INDEX IF NOT EXISTS idx_stocks_sector  ON stocks(sector);
CREATE INDEX IF NOT EXISTS idx_stocks_updated ON stocks(updated_at DESC);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

-- Public can read all stocks (for the dashboard)
CREATE POLICY "public_read_stocks"
  ON stocks FOR SELECT
  USING (true);

-- Only service role (scraper) can insert/update
CREATE POLICY "service_write_stocks"
  ON stocks FOR ALL
  USING (auth.role() = 'service_role');

-- ── REAL-TIME PUBLICATION ─────────────────────────────────────────────────────
-- Enables live updates pushed to the React frontend
ALTER PUBLICATION supabase_realtime ADD TABLE stocks;

-- ── SAMPLE DATA (optional — to test before scraper runs) ─────────────────────
INSERT INTO stocks (symbol, name, sector, theme, trigger, market_cap,
  sales_growth, profit_growth, eps_growth, roce, roe, opm,
  peg, debt_equity, icr, cfo_positive, piotroski, altman_z,
  smart_money, promoter_pledge, fii_increasing,
  sector_outperform, industry_rank,
  rs_rating, delivery_spike, volume_spike, base_breakout, avoid_flag)
VALUES
  ('HAL',    'Hindustan Aeronautics',  'Defence', 'Defence',          'Large order wins',  298000, 14, 31, 31, 29, 26, 24, 1.4, 0.0, 99, true, 8, 4.2, 88, 0, true,  true, 2,  91, 2.8, 1.9, true,  false),
  ('BEL',    'Bharat Electronics',    'Defence', 'Defence',          'Govt policy tailwind',145000,17,28, 28, 23, 22, 22, 1.6, 0.0, 99, true, 8, 5.1, 90, 0, true,  true, 1,  88, 2.2, 1.7, true,  false),
  ('DIXON',  'Dixon Technologies',    'EMS',     'EMS',              'New product',         28000, 34, 51, 51, 22, 21, 5,  1.1, 0.2, 14, true, 8, 3.9, 87, 0, true,  true, 1,  93, 3.2, 2.4, true,  false),
  ('KAYNES', 'Kaynes Technology',     'EMS',     'EMS',              'Capacity expansion',  18000, 38, 55, 55, 19, 18, 12, 1.6, 0.3, 8,  true, 7, 3.5, 85, 0, true,  true, 2,  88, 2.8, 2.1, true,  false),
  ('GRSE',   'Garden Reach Shipbuilders','Defence','Defence',         'Large order wins',    14000, 31, 48, 48, 26, 28, 9,  1.2, 0.0, 99, true, 8, 4.5, 89, 0, true,  true, 3,  92, 3.8, 2.8, true,  false),
  ('RVNL',   'Rail Vikas Nigam',      'Railways','Railways',         'Large order wins',    42000, 20, 28, 28, 18, 17, 6,  1.5, 0.1, 22, true, 7, 3.8, 88, 0, true,  true, 2,  86, 2.5, 1.9, false, false),
  ('JWL',    'Jupiter Wagons',        'Railways','Railways',         'Capacity expansion',   9200, 46, 78, 78, 23, 22, 13, 1.1, 0.1, 14, true, 8, 3.8, 87, 0, true,  true, 6,  91, 3.6, 2.7, true,  false),
  ('TITAGARH','Titagarh Rail Systems','Railways','Railways',         'Large order wins',     8700, 35, 54, 54, 20, 19, 11, 1.3, 0.2, 10, true, 8, 3.6, 86, 0, true,  true, 5,  89, 3.1, 2.3, true,  false),
  ('INOXWIND','Inox Wind',            'Renewable Energy','Renewable Energy','Capacity expansion',8900,44,110,110,18,17,16, 0.8, 0.4, 5,  true, 7, 3.1, 85, 0, true,  true, 4,  88, 3.3, 2.4, false, false),
  ('PERSISTENT','Persistent Systems', 'IT',      'Manufacturing',    'New management',      74000, 20, 28, 28, 28, 26, 17, 1.9, 0.0, 99, true, 8, 5.3, 87, 0, true,  true, 6,  84, 2.0, 1.6, false, false)
ON CONFLICT (symbol) DO UPDATE SET
  sales_growth  = EXCLUDED.sales_growth,
  profit_growth = EXCLUDED.profit_growth,
  updated_at    = NOW();

-- ── VIEWS ─────────────────────────────────────────────────────────────────────
-- Convenience view: only prime stocks
CREATE OR REPLACE VIEW prime_stocks AS
SELECT * FROM stocks
WHERE sales_growth >= 15
  AND profit_growth >= 20
  AND roce >= 15
  AND roe >= 15
  AND debt_equity <= 0.5
  AND smart_money >= 85
  AND promoter_pledge = 0
  AND avoid_flag = false
  AND market_cap BETWEEN 2000 AND 25000
ORDER BY rs_rating DESC NULLS LAST;

COMMENT ON TABLE stocks IS 'CivilMania Growth Scanner — NSE stock universe with 8-pillar scoring data';
