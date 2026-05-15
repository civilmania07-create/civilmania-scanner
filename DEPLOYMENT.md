# 🚀 CivilMania Growth Scanner — Complete Deployment Guide

**Stack:** React + Vite → Vercel (frontend) | Python → Supabase (backend) | NSE + Screener.in + Yahoo (data)

---

## PROJECT STRUCTURE
```
civilmania-scanner/
├── frontend/                  ← React app (deployed to Vercel)
│   ├── src/
│   │   ├── App.jsx            ← Main scanner UI
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example           ← Copy to .env.local
│
├── backend/                   ← Python scraper (runs on your PC daily)
│   ├── scraper.py             ← Main data fetcher + Supabase uploader
│   ├── requirements.txt
│   └── .env.example           ← Copy to .env
│
├── docs/
│   ├── supabase_schema.sql    ← Run this in Supabase SQL editor
│   ├── screener_in_guide.txt  ← Screener.in setup instructions
│   └── DEPLOYMENT.md          ← This file
│
└── vercel.json                ← Vercel build config
```

---

## DAY 1: DATABASE SETUP (30 minutes)

### 1.1 Create Supabase Project
```
1. Go to supabase.com → Sign up (free)
2. New Project → name: "civilmania-scanner"
3. Region: Asia Pacific (Singapore) — closest to India
4. Wait 2 minutes for project to initialize
```

### 1.2 Create the Database Table
```
Supabase Dashboard → SQL Editor → New Query
Copy-paste contents of: docs/supabase_schema.sql
Click "Run"
```

### 1.3 Get Your API Keys
```
Settings → API → copy:
  - Project URL   → looks like https://abcxyz.supabase.co
  - anon key      → long JWT string starting with eyJ... (for frontend)
  - service_role key → another JWT (for backend scraper only)
```

---

## DAY 1: FRONTEND DEPLOYMENT (20 minutes)

### 2.1 Install Node.js
```
Download from: nodejs.org (LTS version)
Verify: node --version  (should show v18+)
```

### 2.2 Setup Frontend
```bash
cd frontend
cp .env.example .env.local

# Edit .env.local and paste your Supabase keys:
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

npm install
npm run dev          # test locally at http://localhost:5173
```

### 2.3 Deploy to Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# From project root (not frontend folder):
vercel

# Follow prompts:
# → Set up and deploy? Yes
# → Which scope? Your personal account
# → Link to existing project? No
# → Project name: civilmania-scanner
# → Directory: ./ (project root)
# → Build Command: cd frontend && npm install && npm run build
# → Output Directory: frontend/dist

# After deploy, go to Vercel dashboard:
# Project → Settings → Environment Variables → Add:
#   VITE_SUPABASE_URL = your_url
#   VITE_SUPABASE_ANON_KEY = your_anon_key

# Redeploy:
vercel --prod
```

**Your live URL:** `https://civilmania-scanner.vercel.app`

### 2.4 Custom Domain (Optional, ~₹700/yr)
```
1. Buy domain at godaddy.com or namecheap.com: civilmaniascanner.in
2. Vercel Dashboard → Project → Domains → Add civilmaniascanner.in
3. Follow DNS configuration instructions (takes 10-30 min)
```

---

## DAY 2: PYTHON SCRAPER SETUP (45 minutes)

### 3.1 Install Python
```
Download from: python.org (3.11+)
Verify: python --version
```

### 3.2 Setup Scraper
```bash
cd backend
cp .env.example .env

# Edit .env:
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...   ← service_role key (not anon!)

pip install -r requirements.txt
```

### 3.3 Test Run
```bash
python scraper.py

# Watch the logs — should see:
# [INFO] Processing HAL...
# [INFO]   ✓ HAL: ROCE=29%, RS=91
# [INFO] Processing BEL...
# etc.
# [INFO] ✅ Supabase upsert complete: 38 records
```

### 3.4 Schedule Daily Auto-Run

**On Windows (Task Scheduler):**
```
1. Open Task Scheduler → Create Basic Task
2. Name: CivilMania Stock Scraper
3. Trigger: Daily, 8:00 AM, Mon-Fri
4. Action: Start a Program
5. Program: C:\Python311\python.exe
6. Arguments: C:\path\to\backend\scraper.py
7. Start in: C:\path\to\backend\
```

**On Mac/Linux (cron):**
```bash
crontab -e

# Add this line (runs at 8 AM Mon-Fri):
0 8 * * 1-5 cd /full/path/to/backend && python scraper.py >> scraper.log 2>&1
```

---

## ADDING MORE STOCKS

Edit `backend/scraper.py` → `WATCHLIST` dictionary:
```python
WATCHLIST = {
    "NEWSTOCK": {"name":"Company Name", "sector":"Sector", "theme":"Theme"},
    # ... existing stocks
}
```
Re-run scraper. New stock appears in dashboard automatically.

---

## DATA REFRESH FREQUENCY

| Data Type          | Source         | Frequency        |
|--------------------|----------------|------------------|
| Fundamentals       | Screener.in    | Weekly (Monday)  |
| Delivery/Volume    | NSE India      | Daily (8 AM)     |
| Price/RS/EMA       | Yahoo Finance  | Daily (8 AM)     |
| Shareholding       | BSE filings    | Quarterly        |
| Piotroski/Altman   | Calculated     | Weekly           |

---

## TROUBLESHOOTING

**Supabase connection error:**
- Check VITE_SUPABASE_URL ends with .supabase.co (no trailing slash)
- Verify anon key is correct (frontend uses anon, scraper uses service_role)

**Scraper 403 errors from NSE:**
- NSE blocks requests without proper headers/cookies
- The scraper uses session + warm-up request
- If still blocked, add: time.sleep(3) between requests

**Screener.in rate limiting:**
- Add time.sleep(2) between stocks
- Run after market hours (8 AM or after 4 PM)

**No data showing in dashboard:**
- Check Supabase → Table Editor → stocks → rows exist?
- Check Row Level Security policy allows public read

---

## ESTIMATED COSTS

| Service        | Plan    | Cost      |
|----------------|---------|-----------|
| Supabase       | Free    | ₹0/month  |
| Vercel         | Free    | ₹0/month  |
| Screener.in    | Free    | ₹0/month  |
| NSE/Yahoo data | Free    | ₹0/month  |
| Domain (opt.)  | Yearly  | ~₹700/yr  |
| **TOTAL**      |         | **₹0** (or ₹58/month with domain) |

---

## SUPPORT

Built for CivilMania Capital Research.
Data sources: Screener.in, NSE India, Yahoo Finance.
Not SEBI registered. For research purposes only.
