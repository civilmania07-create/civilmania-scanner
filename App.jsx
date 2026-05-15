import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── SUPABASE CONFIG ── replace with your actual keys from supabase.com dashboard
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── SCORING ENGINE ──────────────────────────────────────────────────────────
const CRITERIA = [
  // GROWTH
  { key:"sales_growth",    label:"Sales Growth",          cat:"Growth",    unit:"%",  threshold:15,  op:">=", weight:8 },
  { key:"profit_growth",   label:"Profit Growth",         cat:"Growth",    unit:"%",  threshold:20,  op:">=", weight:9 },
  { key:"eps_growth",      label:"EPS Growth",            cat:"Growth",    unit:"%",  threshold:15,  op:">=", weight:8 },
  { key:"roce",            label:"ROCE",                  cat:"Growth",    unit:"%",  threshold:15,  op:">=", weight:7 },
  { key:"roe",             label:"ROE",                   cat:"Growth",    unit:"%",  threshold:15,  op:">=", weight:6 },
  { key:"opm",             label:"OPM",                   cat:"Growth",    unit:"%",  threshold:12,  op:">=", weight:5 },
  // FINANCIAL STRENGTH
  { key:"peg",             label:"PEG Ratio",             cat:"Financial", unit:"",   threshold:2,   op:"<=", weight:7 },
  { key:"debt_equity",     label:"Debt / Equity",         cat:"Financial", unit:"",   threshold:0.5, op:"<=", weight:7 },
  { key:"icr",             label:"ICR",                   cat:"Financial", unit:"x",  threshold:3.5, op:">=", weight:6 },
  { key:"cfo_positive",    label:"Positive CFO & FCF",    cat:"Financial", unit:"",   threshold:1,   op:"bool",weight:6 },
  { key:"piotroski",       label:"Piotroski Score",       cat:"Financial", unit:"/9", threshold:7,   op:">=", weight:7 },
  { key:"altman_z",        label:"Altman Z-Score",        cat:"Financial", unit:"",   threshold:3,   op:">=", weight:6 },
  // OWNERSHIP
  { key:"smart_money",     label:"Promoter+FII+DII",      cat:"Ownership", unit:"%",  threshold:85,  op:">=", weight:7 },
  { key:"promoter_pledge", label:"Promoter Pledge = 0",   cat:"Ownership", unit:"%",  threshold:0,   op:"==", weight:6 },
  { key:"fii_increasing",  label:"FII/DII Increasing QoQ",cat:"Ownership", unit:"",   threshold:1,   op:"bool",weight:5 },
  // SECTOR
  { key:"sector_outperform",label:"Sector vs Nifty",      cat:"Sector",    unit:"",   threshold:1,   op:"bool",weight:5 },
  { key:"industry_rank",   label:"Industry Rank Top 30",  cat:"Sector",    unit:"",   threshold:30,  op:"<=", weight:5 },
  // MOMENTUM
  { key:"rs_rating",       label:"RS Rating",             cat:"Momentum",  unit:"",   threshold:80,  op:">=", weight:8 },
  { key:"delivery_spike",  label:"Delivery Spike",        cat:"Momentum",  unit:"x",  threshold:2.5, op:">=", weight:7 },
  { key:"volume_spike",    label:"Volume Spike",          cat:"Momentum",  unit:"x",  threshold:1.5, op:">=", weight:6 },
  { key:"base_breakout",   label:"Base Breakout",         cat:"Momentum",  unit:"",   threshold:1,   op:"bool",weight:5 },
];
const CAT_META = {
  Growth:    { color:"#39ff8a", icon:"📈" },
  Financial: { color:"#22d3ee", icon:"💎" },
  Ownership: { color:"#fb923c", icon:"🏦" },
  Sector:    { color:"#a78bfa", icon:"🎯" },
  Momentum:  { color:"#fbbf24", icon:"⚡" },
};
const THEMES = ["Defence","EMS","Power","Renewable Energy","Railways","Capital Goods","Manufacturing","Pharma","IT","Consumer","Chemicals"];
const SWEET = { min:2000, max:25000 };

function pass(c, val) {
  if (val === null || val === undefined) return null;
  if (c.op === "bool") return Boolean(val);
  if (c.op === "==")   return val === c.threshold;
  if (c.op === ">=")   return Number(val) >= c.threshold;
  if (c.op === "<=")   return Number(val) <= c.threshold;
  return false;
}
function score(stock) {
  let earned = 0, total = 0, results = {};
  CRITERIA.forEach(c => {
    total += c.weight;
    const p = pass(c, stock[c.key]);
    results[c.key] = p;
    if (p === true) earned += c.weight;
  });
  const sweet = stock.market_cap >= SWEET.min && stock.market_cap <= SWEET.max;
  if (sweet)                    earned = Math.min(total, earned + 4);
  if (stock.base_breakout)      earned = Math.min(total, earned + 3);
  if (stock.fii_increasing)     earned = Math.min(total, earned + 2);
  if (stock.sector_outperform)  earned = Math.min(total, earned + 3);
  if (stock.avoid_flag)         earned = Math.max(0, earned - 20);
  return { score: Math.round((earned / total) * 100), results };
}
function rating(s) {
  if (s >= 88) return { label:"PRIME",     emoji:"🏆", color:"#39ff8a", bg:"rgba(57,255,138,0.1)"  };
  if (s >= 75) return { label:"STRONG",    emoji:"⚡", color:"#fbbf24", bg:"rgba(251,191,36,0.1)"  };
  if (s >= 60) return { label:"WATCHLIST", emoji:"📊", color:"#22d3ee", bg:"rgba(34,211,238,0.1)"  };
  return        { label:"WEAK",      emoji:"⚠",  color:"#ff4757", bg:"rgba(255,71,87,0.07)"  };
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────
function Ring({ s, size = 56 }) {
  const r = size * 0.37, circ = 2 * Math.PI * r;
  const { color } = rating(s);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.1}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.1}
        strokeDasharray={`${(s/100)*circ} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ filter:`drop-shadow(0 0 6px ${color}88)`, transition:"stroke-dasharray 0.6s ease" }}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size*.22} fontWeight="900" fontFamily="'JetBrains Mono',monospace">{s}</text>
    </svg>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:5,
      fontSize:10, fontWeight:800, letterSpacing:"0.07em", fontFamily:"'JetBrains Mono',monospace",
      color, background: bg||`${color}18`, border:`1px solid ${border||color}33` }}>{children}</span>
  );
}

function StatCell({ val, good, unit="" }) {
  const ok = good(val);
  return <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700,
    color: ok ? "#39ff8a" : "#ff6b6b" }}>{val ?? "—"}{val !== null && val !== undefined ? unit : ""}</span>;
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks, setStocks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tab, setTab]             = useState("screener");
  const [expanded, setExpanded]   = useState(null);
  const [search, setSearch]       = useState("");
  const [filterTheme, setTheme]   = useState("All");
  const [filterRating, setFRating]= useState("All");
  const [sortBy, setSort]         = useState("score");
  const [minScore, setMinScore]   = useState(55);
  const [sweetOnly, setSweetOnly] = useState(false);
  const [breakOnly, setBreakOnly] = useState(false);
  const [hideAvoid, setHideAvoid] = useState(true);

  const fetchStocks = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("stocks").select("*").order("updated_at", { ascending: false });
      if (err) throw err;
      const scored = (data || []).map(s => ({ ...s, ...score(s) }));
      setStocks(scored);
      if (data?.length) setLastUpdated(new Date(data[0].updated_at));
    } catch (e) {
      setError("Could not load data. Check Supabase connection.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStocks(); }, [fetchStocks]);

  // real-time subscription
  useEffect(() => {
    const channel = supabase.channel("stocks-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"stocks" }, () => fetchStocks())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchStocks]);

  const filtered = useMemo(() => {
    let list = stocks;
    if (search)              list = list.filter(s => `${s.symbol} ${s.name}`.toUpperCase().includes(search.toUpperCase()));
    if (filterTheme !== "All") list = list.filter(s => s.theme === filterTheme);
    if (sweetOnly)           list = list.filter(s => s.market_cap >= SWEET.min && s.market_cap <= SWEET.max);
    if (breakOnly)           list = list.filter(s => s.base_breakout);
    if (hideAvoid)           list = list.filter(s => !s.avoid_flag);
    if (filterRating !== "All") list = list.filter(s => rating(s.score).label === filterRating);
    list = list.filter(s => s.score >= minScore);
    return [...list].sort((a, b) =>
      sortBy === "score"    ? b.score - a.score :
      sortBy === "rs"       ? b.rs_rating - a.rs_rating :
      sortBy === "profitG"  ? b.profit_growth - a.profit_growth :
      sortBy === "mcap"     ? b.market_cap - a.market_cap : 0
    );
  }, [stocks, search, filterTheme, sweetOnly, breakOnly, hideAvoid, filterRating, minScore, sortBy]);

  const stats = useMemo(() => ({
    prime:   stocks.filter(s => s.score >= 88).length,
    strong:  stocks.filter(s => s.score >= 75 && s.score < 88).length,
    sweet:   stocks.filter(s => s.market_cap >= SWEET.min && s.market_cap <= SWEET.max).length,
    breakout:stocks.filter(s => s.base_breakout).length,
  }), [stocks]);

  const themeColor = t => ({ Defence:"#ff4757", EMS:"#22d3ee", Power:"#fbbf24",
    "Renewable Energy":"#39ff8a", Railways:"#a78bfa", "Capital Goods":"#fb923c",
    Manufacturing:"#38bdf8", Pharma:"#f472b6", IT:"#818cf8", Consumer:"#fb7185", Chemicals:"#34d399" }[t] || "#94a3b8");

  return (
    <div style={{ minHeight:"100vh", background:"#05080f", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#dde6f5" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700;800&family=Syne:wght@700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#05080f;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:#1e3554;border-radius:2px;}
        input,select{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#dde6f5;padding:7px 12px;font-size:12px;outline:none;transition:all .2s;font-family:'JetBrains Mono',monospace;}
        input:focus,select:focus{border-color:#22d3ee55;box-shadow:0 0 0 3px rgba(34,211,238,0.08);}
        select option{background:#0d1425;}
        .tab-btn{background:none;border:none;color:#3d5270;font-size:11px;font-weight:800;padding:10px 20px;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;font-family:'Syne',sans-serif;letter-spacing:.08em;}
        .tab-btn.on{color:#22d3ee;border-color:#22d3ee;}
        .chip{padding:5px 13px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.07em;border:1px solid;cursor:pointer;transition:all .18s;font-family:'JetBrains Mono',monospace;}
        .row{transition:all .18s;cursor:pointer;border-radius:10px;border:1px solid rgba(255,255,255,0.05);}
        .row:hover{background:rgba(255,255,255,0.025)!important;border-color:rgba(34,211,238,.2)!important;transform:translateX(2px);}
        .row.open{background:rgba(34,211,238,0.03)!important;border-color:rgba(34,211,238,.25)!important;}
        .btn{border:none;border-radius:8px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:800;transition:all .2s;letter-spacing:.04em;}
        .btn-primary{background:linear-gradient(135deg,#22d3ee,#0ea5e9);color:#000;padding:9px 22px;font-size:12px;}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(34,211,238,0.35);}
        .btn-ghost{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);color:#64748b;padding:8px 18px;font-size:12px;}
        .btn-ghost:hover{background:rgba(255,255,255,0.08);color:#94a3b8;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fadeUp .35s ease both;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .pulse{animation:pulse 2s ease infinite}
        .grid-detail{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ position:"sticky", top:0, zIndex:200, borderBottom:"1px solid rgba(255,255,255,0.05)",
        background:"rgba(5,8,15,0.92)", backdropFilter:"blur(14px)" }}>
        <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 28px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#39ff8a,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📈</div>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:18, color:"#fff", letterSpacing:".04em", lineHeight:1 }}>CIVILMANIA SCANNER</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#1e3554", letterSpacing:".18em", marginTop:2 }}>GROWTH STOCK INTELLIGENCE · NSE</div>
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:24 }}>
              <div style={{ display:"flex", gap:20 }}>
                {[["🏆",stats.prime,"PRIME","#39ff8a"],["⚡",stats.strong,"STRONG","#fbbf24"],["🎯",stats.sweet,"SWEET SPOT","#f472b6"],["📍",stats.breakout,"BREAKOUT","#a78bfa"]].map(([e,c,l,col])=>(
                  <div key={l} style={{ textAlign:"center" }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:16, color:col, lineHeight:1 }}>{c}</div>
                    <div style={{ fontSize:8, color:"#1e3554", letterSpacing:".12em", marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {loading
                  ? <div style={{ width:8, height:8, borderRadius:"50%", border:"2px solid #22d3ee", borderTopColor:"transparent" }} className="spin"/>
                  : <div style={{ width:7, height:7, borderRadius:"50%", background:"#39ff8a" }} className="pulse"/>
                }
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color: loading?"#22d3ee":"#39ff8a" }}>
                  {loading ? "LOADING..." : `${stocks.length} STOCKS LIVE`}
                </span>
                <button className="btn btn-ghost" style={{ padding:"5px 12px", fontSize:11 }} onClick={fetchStocks}>↻</button>
              </div>
            </div>
          </div>

          <nav style={{ display:"flex", gap:2 }}>
            {[["screener","⚡ SCREENER"],["framework","📐 FRAMEWORK"],["avoidlist","🚫 AVOID LIST"],["setup","🔧 SETUP GUIDE"]].map(([t,l])=>(
              <button key={t} className={`tab-btn ${tab===t?"on":""}`} onClick={()=>setTab(t)}>{l}</button>
            ))}
            {lastUpdated && <span style={{ marginLeft:"auto", alignSelf:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#1e3554" }}>
              Updated: {lastUpdated.toLocaleString("en-IN")}
            </span>}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth:1400, margin:"0 auto", padding:"24px 28px" }}>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div style={{ background:"rgba(255,71,87,0.08)", border:"1px solid rgba(255,71,87,0.25)", borderRadius:10,
            padding:"12px 18px", marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#ff6b6b" }}>⚠ {error}</span>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={fetchStocks}>Retry</button>
          </div>
        )}

        {/* ════════ SCREENER TAB ════════ */}
        {tab === "screener" && (
          <div className="fu">
            {/* Filter bar */}
            <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12,
              padding:"14px 18px", marginBottom:14, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search symbol or company..." style={{ width:200 }}/>
              <select value={filterTheme} onChange={e=>setTheme(e.target.value)} style={{ width:160 }}>
                <option value="All">All Themes</option>
                {THEMES.map(t=><option key={t}>{t}</option>)}
              </select>
              <select value={sortBy} onChange={e=>setSort(e.target.value)} style={{ width:150 }}>
                <option value="score">Sort: Score</option>
                <option value="rs">Sort: RS Rating</option>
                <option value="profitG">Sort: Profit Growth</option>
                <option value="mcap">Sort: Market Cap</option>
              </select>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3d5270" }}>MIN</span>
                <input type="range" min={0} max={100} value={minScore} onChange={e=>setMinScore(+e.target.value)}
                  style={{ width:80, padding:0, border:"none", background:"none", cursor:"pointer" }}/>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:800, color:"#22d3ee", minWidth:26 }}>{minScore}</span>
              </div>
              <div style={{ display:"flex", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
                {[["🎯 Sweet Spot",sweetOnly,setSweetOnly,"#f472b6"],
                  ["📍 Breakout Only",breakOnly,setBreakOnly,"#a78bfa"],
                  ["🚫 Hide Avoid",hideAvoid,setHideAvoid,"#ff4757"]].map(([l,v,fn,c])=>(
                  <button key={l} className="chip" onClick={()=>fn(!v)}
                    style={{ background:v?`${c}18`:"transparent", borderColor:v?c:"rgba(255,255,255,0.08)", color:v?c:"#3d5270" }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Rating filter */}
            <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              {["All","PRIME","STRONG","WATCHLIST","WEAK"].map(r=>(
                <button key={r} className="chip" onClick={()=>setFRating(r)}
                  style={{ background:filterRating===r?"rgba(34,211,238,0.1)":"transparent",
                    borderColor:filterRating===r?"#22d3ee":"rgba(255,255,255,0.07)",
                    color:filterRating===r?"#22d3ee":"#3d5270" }}>{r}</button>
              ))}
              <span style={{ marginLeft:"auto", fontFamily:"'JetBrains Mono',monospace", fontSize:11,
                color:"#1e3554", alignSelf:"center" }}>{filtered.length} of {stocks.length} stocks</span>
            </div>

            {/* Column headers */}
            <div style={{ display:"grid", gridTemplateColumns:"34px 52px 1fr 100px 82px 72px 72px 68px 60px 68px 72px 40px",
              gap:6, padding:"6px 14px", marginBottom:4 }}>
              {["#","SCR","STOCK","THEME","MCAP","SALES%","PROFIT%","ROCE%","PEG","RS","BUY",""].map((h,i)=>(
                <div key={i} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#1e3554", letterSpacing:".1em" }}>{h}</div>
              ))}
            </div>

            {/* Loading skeleton */}
            {loading && Array(8).fill(0).map((_,i)=>(
              <div key={i} style={{ height:60, borderRadius:10, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.04)", marginBottom:6,
                backgroundImage:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.03) 50%,transparent 100%)",
                backgroundSize:"200% 100%", animation:"pulse 1.5s ease infinite" }}/>
            ))}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign:"center", padding:"70px 0", color:"#1e3554" }}>
                <div style={{ fontSize:42, marginBottom:14 }}>🔍</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, marginBottom:6, color:"#3d5270" }}>No stocks match your filters</div>
                <div style={{ fontSize:13 }}>Loosen your criteria or check the Supabase connection</div>
              </div>
            )}

            {/* Stock rows */}
            {!loading && filtered.map((s, i) => {
              const rt = rating(s.score);
              const sweet = s.market_cap >= SWEET.min && s.market_cap <= SWEET.max;
              const tc = themeColor(s.theme);
              const isOpen = expanded === s.symbol;
              return (
                <div key={s.symbol} style={{ marginBottom:5 }}>
                  <div className={`row ${isOpen?"open":""}`} onClick={()=>setExpanded(isOpen?null:s.symbol)}>
                    <div style={{ display:"grid", gridTemplateColumns:"34px 52px 1fr 100px 82px 72px 72px 68px 60px 68px 72px 40px",
                      gap:6, padding:"12px 14px", alignItems:"center" }}>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#1e3554" }}>{i+1}</div>
                      <Ring s={s.score} size={44}/>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
                          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:15, color:"#fff", letterSpacing:".02em" }}>{s.symbol}</span>
                          <Badge color={rt.color}>{rt.emoji} {rt.label}</Badge>
                          {sweet && <Badge color="#f472b6">🎯 SWEET SPOT</Badge>}
                          {s.base_breakout && <Badge color="#a78bfa">📍 BREAKOUT</Badge>}
                          {s.avoid_flag && <Badge color="#ff4757">🚫 AVOID</Badge>}
                        </div>
                        <div style={{ fontSize:11, color:"#3d5270" }}>{s.name}</div>
                      </div>
                      <div>
                        <span style={{ display:"inline-block", padding:"3px 8px", borderRadius:6, fontSize:10, fontWeight:800,
                          color:tc, background:`${tc}15`, border:`1px solid ${tc}25`, fontFamily:"'JetBrains Mono',monospace",
                          letterSpacing:".04em" }}>{s.theme}</span>
                      </div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700,
                        color:sweet?"#f472b6":"#3d5270" }}>
                        ₹{s.market_cap >= 100000 ? (s.market_cap/100000).toFixed(1)+"L" : (s.market_cap/1000).toFixed(0)+"K"} Cr
                      </div>
                      <StatCell val={s.sales_growth} good={v=>v>=15} unit="%"/>
                      <StatCell val={s.profit_growth} good={v=>v>=20} unit="%"/>
                      <StatCell val={s.roce} good={v=>v>=15} unit="%"/>
                      <StatCell val={s.peg} good={v=>v<=2}/>
                      <StatCell val={s.rs_rating} good={v=>v>=80}/>
                      <div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3d5270" }}>
                          Vol <span style={{ color:s.volume_spike>=1.5?"#a78bfa":"#3d5270", fontWeight:700 }}>{s.volume_spike}x</span>
                        </div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#3d5270" }}>
                          Del <span style={{ color:s.delivery_spike>=2.5?"#a78bfa":"#3d5270", fontWeight:700 }}>{s.delivery_spike}x</span>
                        </div>
                      </div>
                      <div style={{ color:isOpen?"#22d3ee":"#1e3554", textAlign:"center", fontSize:12, transition:"color .2s" }}>{isOpen?"▲":"▼"}</div>
                    </div>
                  </div>

                  {/* ── EXPANDED DETAIL ── */}
                  {isOpen && (
                    <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(34,211,238,0.12)",
                      borderTop:"none", borderRadius:"0 0 10px 10px", padding:20 }}>
                      <div className="grid-detail" style={{ marginBottom:14 }}>
                        {Object.entries(CAT_META).map(([cat, { color, icon }]) => {
                          const catCriteria = CRITERIA.filter(c => c.cat === cat);
                          return (
                            <div key={cat} style={{ background:"rgba(255,255,255,0.02)",
                              border:`1px solid ${color}18`, borderRadius:10, padding:"12px 14px" }}>
                              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:10,
                                color, letterSpacing:".12em", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                                <span>{icon}</span>{cat.toUpperCase()}
                              </div>
                              {catCriteria.map(c => {
                                const p = s.results[c.key];
                                const v = s[c.key];
                                return (
                                  <div key={c.key} style={{ display:"flex", justifyContent:"space-between",
                                    padding:"4px 6px", borderRadius:6, marginBottom:4,
                                    background: p===true?"rgba(57,255,138,0.05)":p===false?"rgba(255,71,87,0.05)":"transparent" }}>
                                    <span style={{ fontSize:11, color:"#64748b" }}>{p===true?"✅":p===false?"❌":"⬜"} {c.label}</span>
                                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700,
                                      color: p===true?"#39ff8a":p===false?"#ff6b6b":"#3d5270" }}>
                                      {v === null || v === undefined ? "—" :
                                        c.op === "bool" ? (v ? "YES" : "NO") :
                                        `${v}${c.unit}`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                        {/* Extra info card */}
                        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 14px" }}>
                          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:10, color:"#f472b6", letterSpacing:".12em", marginBottom:10 }}>⚡ TRIGGER & STATUS</div>
                          <div style={{ fontSize:13, fontWeight:700, color: themeColor(s.theme), marginBottom:8 }}>{s.trigger || "—"}</div>
                          <div style={{ fontSize:11, color:"#3d5270", marginBottom:4 }}>Smart Money: <b style={{ color:"#fff" }}>{s.smart_money}%</b></div>
                          <div style={{ fontSize:11, color:"#3d5270", marginBottom:4 }}>Pledge: <b style={{ color:s.promoter_pledge===0?"#39ff8a":"#ff4757" }}>{s.promoter_pledge}%</b></div>
                          <div style={{ fontSize:11, color:"#3d5270", marginBottom:4 }}>FII Trend: <b style={{ color:s.fii_increasing?"#39ff8a":"#3d5270" }}>{s.fii_increasing?"INCREASING":"STABLE"}</b></div>
                          <div style={{ fontSize:11, color:"#3d5270" }}>Sector vs Nifty: <b style={{ color:s.sector_outperform?"#39ff8a":"#3d5270" }}>{s.sector_outperform?"OUTPERFORM":"NEUTRAL"}</b></div>
                        </div>
                      </div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#1e3554" }}>
                        Last updated: {s.updated_at ? new Date(s.updated_at).toLocaleString("en-IN") : "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ════════ FRAMEWORK TAB ════════ */}
        {tab === "framework" && (
          <div className="fu" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[
              { title:"GROWTH FILTERS", color:"#39ff8a", icon:"📈", rows:[
                ["Sales Growth","≥ 15%","Strong topline momentum"],
                ["Profit Growth","≥ 20%","Earnings power compounding"],
                ["Annual EPS Growth","≥ 15%","Per-share wealth creation"],
                ["Quarterly EPS","Accelerating (3Q)","O'Neil requirement — must see acceleration"],
                ["ROCE","≥ 15%","Capital efficiency — are they earning on capital?"],
                ["ROE","≥ 15%","Equity return quality"],
                ["OPM","Improving YoY","Margin expansion = operating leverage kicking in"],
              ]},
              { title:"FINANCIAL STRENGTH", color:"#22d3ee", icon:"💎", rows:[
                ["PEG Ratio","< 2","Growth-adjusted valuation filter"],
                ["Debt / Equity","< 0.5","Balance sheet safety"],
                ["ICR","≥ 3.5x","Can they comfortably service debt?"],
                ["CFO & FCF","Both positive","Real cash, not accounting earnings"],
                ["Piotroski Score","≥ 7 / 9","9-dimension quality test"],
                ["Altman Z-Score","≥ 3","Bankruptcy probability filter"],
              ]},
              { title:"OWNERSHIP STRUCTURE", color:"#fb923c", icon:"🏦", rows:[
                ["Promoter + FII + DII","> 85%","Institutional conviction — no room for operators"],
                ["Promoter Pledge","= 0%","Non-negotiable. Any pledge = risk of forced selling"],
                ["FII/DII Trend","Increasing QoQ","Follow the smart money — accumulation signal"],
              ]},
              { title:"SECTOR & THEME", color:"#a78bfa", icon:"🎯", rows:[
                ["Sector vs Nifty","Outperforming","Great stocks in weak sectors still underperform"],
                ["Industry Rank","Top 30 of all sectors","Be in a leading industry group"],
                ["Preferred Themes","Defence / EMS / Power / Railways / CapGoods / Manufacturing / Renewables","Structural multi-year tailwinds"],
              ]},
              { title:"BUSINESS TRIGGER (ANY 1)", color:"#fbbf24", icon:"⚡", rows:[
                ["Capacity Expansion","","New plant, expansion, brownfield/greenfield"],
                ["New Product","","Product launches into new markets"],
                ["Export Growth","","USD revenue, new geographies"],
                ["Large Order Wins","","Visible order book = earnings visibility"],
                ["Margin Expansion","","Operating leverage or product mix improvement"],
                ["New Management","","Turnaround trigger — new CEO/MD with track record"],
                ["Govt Policy Tailwind","","PLI, infrastructure push, defence indigenization"],
              ]},
              { title:"SWEET SPOT & BUY ZONE", color:"#f472b6", icon:"🎪", rows:[
                ["Market Cap","₹2,000 – ₹25,000 Cr","Small enough to move, large enough for institutions"],
                ["Entry Setup","Tight base breakout","3–8 week consolidation after strong move"],
                ["Volume","1.5x+ average on breakout","Institutional buying confirmation"],
                ["Delivery Spike","2.5x+ average","Real investors, not traders, are buying"],
                ["RS Signal","RS breakout before price","The single most important leading indicator"],
                ["EMA Stack","Price > 21 > 63 > 200","Full bull trend — all timeframes aligned"],
              ]},
            ].map(sec => (
              <div key={sec.title} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${sec.color}18`, borderRadius:14, padding:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <span style={{ fontSize:20 }}>{sec.icon}</span>
                  <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:13, color:sec.color, letterSpacing:".08em" }}>{sec.title}</span>
                </div>
                {sec.rows.map(([k, v, d]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                    padding:"8px 10px", marginBottom:5, borderRadius:8,
                    background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#c4cfd9" }}>{k}</div>
                      {d && <div style={{ fontSize:10, color:"#3d5270", marginTop:2, lineHeight:1.4 }}>{d}</div>}
                    </div>
                    {v && <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:800,
                      color:sec.color, marginLeft:12, textAlign:"right", flexShrink:0 }}>{v}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ════════ AVOID LIST TAB ════════ */}
        {tab === "avoidlist" && (
          <div className="fu">
            <div style={{ background:"rgba(255,71,87,0.05)", border:"1px solid rgba(255,71,87,0.18)", borderRadius:14, padding:24, marginBottom:18 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:14, color:"#ff4757", letterSpacing:".08em", marginBottom:6 }}>🚫 DISQUALIFYING RED FLAGS</div>
              <div style={{ fontSize:12, color:"#3d5270", marginBottom:18 }}>Any single flag below disqualifies a stock — regardless of score. These are non-negotiable exits or avoidances.</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[["Auditor Resignation","Serious governance red flag. Often precedes fraud discovery. Exit immediately without exception."],
                  ["Equity Dilution","Repeated QIP/rights issues signal management cannot generate internal capital. Destroys EPS."],
                  ["Negative CFO","Profits on paper, cash is consumed. The single best fraud detector. Real businesses generate cash."],
                  ["High Receivables","Rising debtor days = revenue recognition without actual collection. Revenue can be reversed."],
                  ["Promoter Selling","Consistent selling at market price. Insiders always know more than analysts. Follow their actions."],
                  ["Operator-Like Charts","Vertical spike + crash, abnormal volume without news or fundamentals. Trap. Guaranteed loss."],
                  ["Promoter Pledge > 5%","Pledged shares trigger forced selling cascades. Even good businesses get destroyed."],
                  ["Piotroski Score < 5","Business quality deteriorating across multiple financial dimensions simultaneously."],
                  ["Altman Z-Score < 1.8","High probability of financial distress within 2 years. Bankruptcy zone."],
                  ["Negative FCF (3Y+)","Cannot fund growth organically. Will keep diluting or borrowing. Structural weakness."],
                ].map(([t,d])=>(
                  <div key={t} style={{ background:"rgba(255,71,87,0.05)", border:"1px solid rgba(255,71,87,0.14)", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:12, color:"#ff6b6b", marginBottom:5 }}>⛔ {t}</div>
                    <div style={{ fontSize:11, color:"#3d5270", lineHeight:1.55 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.18)", borderRadius:14, padding:24 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:14, color:"#fbbf24", letterSpacing:".08em", marginBottom:14 }}>⚡ IDEAL BUY POINT — 6-POINT CHECKLIST</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {[["📦 Tight Base","3–8 week consolidation after a strong move. Low volatility = quiet accumulation. The best setups look boring before they explode."],
                  ["📊 Breakout Volume","Breakout session volume must be 1.5x or more the 20-day average. No volume = no conviction = likely failed breakout."],
                  ["📦 Delivery Spike","Delivery % must jump 2.5x+ on the breakout day. This separates institutional buying from intraday trading noise."],
                  ["📐 RS Breakout First","RS Rating line makes a new high before the price does. This is the single most reliable leading indicator of a big move."],
                  ["📍 All EMAs Aligned","Price above EMA21 > EMA63 > EMA200. All timeframes in agreement = sustained institutional participation."],
                  ["🎯 Near 52-Week High","Entry should be within 15–25% of the 52-week high. True leaders are always near highs. Cheap = cheap for a reason."],
                ].map(([t,d])=>(
                  <div key={t} style={{ background:"rgba(251,191,36,0.04)", border:"1px solid rgba(251,191,36,0.14)", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:12, color:"#fbbf24", marginBottom:5 }}>{t}</div>
                    <div style={{ fontSize:11, color:"#3d5270", lineHeight:1.55 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════ SETUP GUIDE TAB ════════ */}
        {tab === "setup" && (
          <div className="fu">
            <div style={{ display:"grid", gap:14 }}>
              {[
                { step:"01", title:"Create Supabase Project", color:"#39ff8a", content: `
1. Go to supabase.com → sign up free
2. Click "New Project" → name it "civilmania-scanner"
3. Copy your Project URL and anon key from Settings → API
4. Paste into your .env file:

VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

5. Run this SQL in Supabase SQL editor to create the stocks table:` },
                { step:"02", title:"Run SQL in Supabase", color:"#22d3ee", content: `
CREATE TABLE stocks (
  id              SERIAL PRIMARY KEY,
  symbol          VARCHAR(20) UNIQUE NOT NULL,
  name            TEXT,
  sector          TEXT,
  theme           TEXT,
  trigger         TEXT,
  market_cap      NUMERIC,
  sales_growth    NUMERIC,
  profit_growth   NUMERIC,
  eps_growth      NUMERIC,
  roce            NUMERIC,
  roe             NUMERIC,
  opm             NUMERIC,
  peg             NUMERIC,
  debt_equity     NUMERIC,
  icr             NUMERIC,
  cfo_positive    BOOLEAN DEFAULT false,
  piotroski       NUMERIC,
  altman_z        NUMERIC,
  smart_money     NUMERIC,
  promoter_pledge NUMERIC DEFAULT 0,
  fii_increasing  BOOLEAN DEFAULT false,
  sector_outperform BOOLEAN DEFAULT false,
  industry_rank   NUMERIC,
  rs_rating       NUMERIC,
  delivery_spike  NUMERIC,
  volume_spike    NUMERIC,
  base_breakout   BOOLEAN DEFAULT false,
  avoid_flag      BOOLEAN DEFAULT false,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON stocks FOR SELECT USING (true);
CREATE POLICY "Auth insert" ON stocks FOR ALL USING (auth.role() = 'service_role');` },
                { step:"03", title:"Screener.in Query Setup", color:"#fb923c", content: `
Go to screener.in → Screens → Create new screen
Paste this query:

Sales growth > 15 AND
Profit growth > 20 AND
Return on equity > 15 AND
Return on capital employed > 15 AND
Debt to equity < 0.5 AND
Market Capitalization > 2000 AND
Market Capitalization < 25000

Export as CSV → this gives you the filtered universe.
Then run the Python scraper (see backend/scraper.py)
to enrich the data and push to Supabase.` },
                { step:"04", title:"Run Python Scraper", color:"#a78bfa", content: `
cd backend
pip install -r requirements.txt

# Add your Supabase keys to backend/.env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  ← service key (not anon)

# Run once manually to test:
python scraper.py

# Schedule daily using cron (Linux/Mac):
crontab -e
0 8 * * 1-5 cd /path/to/backend && python scraper.py

# OR on Windows: use Task Scheduler` },
                { step:"05", title:"Deploy on Vercel", color:"#f472b6", content: `
# Install Vercel CLI
npm install -g vercel

cd frontend
npm install
npm run build   ← test local build first

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard:
# Project → Settings → Environment Variables
VITE_SUPABASE_URL = your_url
VITE_SUPABASE_ANON_KEY = your_key

# Your live URL:
# civilmania-scanner.vercel.app

# Optional: custom domain
# Buy civilmaniascanner.in (~₹700/yr)
# Add in Vercel → Project → Domains` },
              ].map(sec => (
                <div key={sec.step} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${sec.color}20`, borderRadius:14, padding:22 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:900, fontSize:28, color:`${sec.color}40`, lineHeight:1 }}>STEP {sec.step}</div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:sec.color }}>{sec.title}</div>
                  </div>
                  <pre style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#64748b",
                    background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8,
                    padding:"14px 16px", overflowX:"auto", lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                    {sec.content.trim()}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
