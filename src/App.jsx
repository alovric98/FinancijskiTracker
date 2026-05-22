import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";

const CATEGORIES = [
  { id: "stanarina", label: "Stanarina", emoji: "🏠", color: "#2D6A4F" },
  { id: "hrana",     label: "Hrana",     emoji: "🛒", color: "#E76F51" },
  { id: "transport", label: "Prijevoz",  emoji: "🚗", color: "#457B9D" },
  { id: "kafici",    label: "Kafići",    emoji: "☕", color: "#E9C46A" },
  { id: "shopping",  label: "Shopping",  emoji: "🛍️", color: "#C77DFF" },
  { id: "zdravlje",  label: "Zdravlje",  emoji: "💊", color: "#EF476F" },
  { id: "pretplate", label: "Pretplate", emoji: "📱", color: "#118AB2" },
  { id: "stednja",   label: "Štednja",   emoji: "💰", color: "#52B788" },
];

const MONTHS = ["Siječanj","Veljača","Ožujak","Travanj","Svibanj","Lipanj","Srpanj","Kolovoz","Rujan","Listopad","Studeni","Prosinac"];
const fmt = (n) => new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ---------------------------------------------------------------------------
// WordPress API endpoints (Nova logika)
// ---------------------------------------------------------------------------
// Napomena: Ove rute će raditi jer će React kod biti ubačen unutar WordPressa
const API_URL_GET = "/wp-json/financijski-tracker/v1/podaci";
const API_URL_POST = "/wp-json/financijski-tracker/v1/spremi";
// ---------------------------------------------------------------------------

export default function App() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const [income, setIncome] = useState("");
  
  // SVI troškovi iz baze (ne filtriramo ih po mjesecu ovdje jer u bazu spremamo sve)
  const [allExpenses, setAllExpenses] = useState([]); 
  
  const [tab, setTab] = useState("add");
  const [cat, setCat] = useState("hrana");
  const [amount, setAmount] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [incomeEditing, setIncomeEditing] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [activeSlice, setActiveSlice] = useState(null);
  const [editAmt, setEditAmt] = useState("");
  const [editCat, setEditCat] = useState("");
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState("");

  // Ostavljamo key funkcionalnost za lakše filtriranje, ali podaci sada idu na server
  const currentMonthKey = `${month + 1}.${year}`; 

  // Filtriramo SVE troškove samo za odabrani mjesec i godinu kako bismo ih prikazali
  const expenses = allExpenses.filter(e => {
    // Pretpostavljamo da je datum u formatu "DD.MM.YYYY."
    const parts = e.date.split('.');
    if (parts.length >= 3) {
      const eMonth = parseInt(parts[1], 10) - 1; // 0-based
      const eYear = parseInt(parts[2], 10);
      return eMonth === month && eYear === year;
    }
    return false;
  });

  // Učitavanje iz baze prilikom pokretanja
  useEffect(() => {
    setLoaded(false);
    fetch(API_URL_GET, {
      method: "GET",
      headers: {
        'Content-Type': 'application/json',
        // WordPress automatski prepoznaje ulogiranog korisnika preko cookieja 
        // kada se REST API poziva s iste domene (tzv. Nonce autentifikacija)
        'X-WP-Nonce': typeof wpApiSettings !== 'undefined' ? wpApiSettings.nonce : '' 
      }
    })
    .then(res => res.json())
    .then(data => {
      setIncome(data.prihod || "");
      setAllExpenses(data.entries || []);
      setLoaded(true);
    })
    .catch(err => {
      console.error("Greška pri dohvaćanju iz baze:", err);
      // Fallback ako ne uspije (npr. testiranje izvan WP-a)
      setIncome("");
      setAllExpenses([]);
      setLoaded(true);
    });
  }, []);

  // Funkcija za spremanje promjena u bazu
  const persist = useCallback((inc, exps) => {
    fetch(API_URL_POST, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': typeof wpApiSettings !== 'undefined' ? wpApiSettings.nonce : ''
      },
      body: JSON.stringify({ prihod: inc, entries: exps })
    })
    .then(res => res.json())
    .then(data => console.log("Spremljeno na server:", data))
    .catch(err => console.error("Greška pri spremanju:", err));
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  const addExpense = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const trimmedNote = note.trim();
    // Spremanje datuma (format mora biti DD.MM.YYYY. zbog filtera iznad)
    const newDate = new Date();
    const formattedDate = `${newDate.getDate()}.${newDate.getMonth() + 1}.${newDate.getFullYear()}.`;
    
    const e = { id: Date.now(), category: cat, amount: val, date: formattedDate, ...(trimmedNote && { note: trimmedNote }) };
    const next = [e, ...allExpenses];
    
    setAllExpenses(next); 
    persist(income, next);
    setAmount(""); 
    setNote(""); 
    flash("Dodano ✓");
    setTab("pregled");
  };

  const remove = (id) => {
    const next = allExpenses.filter(e => e.id !== id);
    setAllExpenses(next); 
    persist(income, next); 
    setConfirmId(null);
  };

  const saveIncome = (v) => { 
    setIncome(v); 
    persist(v, allExpenses); 
  };

  const openEdit = (e) => {
    setEditItem(e);
    setEditAmt(String(e.amount));
    setEditCat(e.category);
    setEditNote(e.note || "");
  };

  const saveEdit = () => {
    const val = parseFloat(editAmt);
    if (!val || val <= 0) return;
    const trimmedNote = editNote.trim();
    const next = allExpenses.map(e => e.id === editItem.id ? { ...e, amount: val, category: editCat, ...(trimmedNote ? { note: trimmedNote } : { note: undefined }) } : e);
    setAllExpenses(next); 
    persist(income, next);
    setEditItem(null); 
    flash("Spremljeno ✓");
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const inc   = parseFloat(income) || 0;
  const left  = inc > 0 ? inc - total : null;
  const spentPct = inc > 0 ? Math.min(100, (total / inc) * 100) : 0;

  const byCat = CATEGORIES
    .map(c => ({ ...c, sum: expenses.filter(e => e.category === c.id).reduce((s, e) => s + e.amount, 0) }))
    .filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);

  const prevM = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const nextM = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Inter:wght@300;400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body { background: #F7F5F2; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
    .root { max-width: 420px; margin: 0 auto; min-height: 100vh; background: #F7F5F2; display: flex; flex-direction: column; }
    .hd { padding: 48px 28px 28px; }
    .hd-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
    .hd-title { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 400; color: #1A1A1A; line-height: 1.1; letter-spacing: -0.3px; }
    .hd-sub { font-size: 11px; color: #ABABAB; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
    .mnav { display: flex; align-items: center; gap: 8px; background: #EDEAE6; border-radius: 100px; padding: 6px 14px; }
    .marr { background: none; border: none; color: #888; font-size: 15px; cursor: pointer; padding: 8px 12px; border-radius: 50%; transition: color .15s; line-height: 1; }
    .marr:hover { color: #1A1A1A; }
    .marr:active { color: #1A1A1A; }
    .mlbl { font-size: 11px; font-weight: 500; color: #1A1A1A; letter-spacing: 0.3px; white-space: nowrap; min-width: 88px; text-align: center; }
    .inc-strip { background: #1A1A1A; border-radius: 16px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
    .inc-lbl { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #666; }
    .inc-input { font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 300; color: #F7F5F2; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 4px 10px; outline: none; width: 140px; text-align: right; }
    .inc-input::placeholder { color: #555; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 28px 0; }
    .stat { background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .stat-lbl { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #ABABAB; margin-bottom: 6px; }
    .stat-num { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 400; color: #1A1A1A; letter-spacing: -0.3px; line-height: 1; }
    .stat-num.red { color: #C0392B; }
    .stat-num.grn { color: #27AE60; }
    .bar-track { height: 3px; background: #F0EDE9; border-radius: 2px; margin-top: 10px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 2px; transition: width .6s cubic-bezier(.4,0,.2,1); }
    .tabs { display: flex; padding: 20px 28px 0; border-bottom: 1px solid #E8E4DF; margin: 12px 0 0; }
    .tb { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; padding: 10px 0 12px; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: #ABABAB; cursor: pointer; transition: color .2s, border-color .2s; margin-bottom: -1px; }
    .tb.on { color: #1A1A1A; border-bottom-color: #1A1A1A; }
    .content { padding: 24px 28px max(100px, calc(80px + env(safe-area-inset-bottom, 0px))); flex: 1; }
    .fl { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #ABABAB; margin-bottom: 10px; }
    .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 24px; }
    .cbt { aspect-ratio: 1; border-radius: 14px; border: 1.5px solid #E8E4DF; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; transition: all .2s; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .cbt:hover { border-color: #1A1A1A; }
    .cbt:active { transform: scale(.93); border-color: #1A1A1A; }
    .cbt.sel { background: #1A1A1A; border-color: #1A1A1A; box-shadow: none; }
    .cbt.sel:active { transform: scale(.93); }
    .cbt-em { font-size: 18px; line-height: 1; }
    .cbt-lbl { font-size: 9px; letter-spacing: 0.3px; color: #888; font-weight: 500; }
    .cbt.sel .cbt-lbl { color: rgba(255,255,255,0.7); }
    .amt-row { display: flex; align-items: center; background: #fff; border-radius: 16px; border: 1.5px solid #E8E4DF; padding: 0 18px; margin-bottom: 14px; transition: border-color .2s; }
    .amt-row:focus-within { border-color: #1A1A1A; }
    .amt-sym { font-size: 22px; color: #ABABAB; font-weight: 300; padding-right: 8px; }
    .amt-inp { flex: 1; border: none; outline: none; font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 400; color: #1A1A1A; padding: 18px 0; background: none; letter-spacing: -0.5px; width: 100%; }
    .amt-inp::placeholder { color: #DDD; }
    .add-btn { width: 100%; padding: 17px; background: #1A1A1A; color: #F7F5F2; border: none; border-radius: 14px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all .2s; }
    .add-btn:hover { background: #333; }
    .add-btn:active { transform: scale(.985); background: #2a2a2a; }
    .add-btn:disabled { background: #E0E0E0; color: #ABABAB; cursor: default; }
    .top-banner { background: #1A1A1A; border-radius: 16px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .tb-lbl { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
    .tb-val { font-family: 'Playfair Display', serif; font-size: 20px; color: #F7F5F2; font-weight: 400; }
    .pie-wrap { background: #fff; border-radius: 16px; padding: 8px 0 0; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .cat-rows { display: flex; flex-direction: column; }
    .crow { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #F0EDE9; cursor: pointer; transition: opacity .15s; }
    .crow:hover { opacity: .75; }
    .crow:active { opacity: .55; }
    .crow:last-child { border-bottom: none; }
    .crow-chevron { font-size: 11px; color: #ABABAB; transition: transform .2s; flex-shrink: 0; }
    .crow-chevron.open { transform: rotate(90deg); }
    .sub-entries { background: #FAFAF8; border-radius: 12px; margin: 0 0 4px; overflow: hidden; }
    .sentry { display: flex; align-items: center; gap: 6px; padding: 11px 14px; border-bottom: 1px solid #F0EDE9; }
    .sentry:last-child { border-bottom: none; }
    .sentry-date { font-size: 10px; color: #ABABAB; flex: 1; }
    .sentry-amt { font-family: 'Playfair Display', serif; font-size: 15px; color: #1A1A1A; }
    .sentry-edit { background: none; border: none; font-size: 14px; cursor: pointer; color: #ABABAB; padding: 9px 11px; transition: color .15s, background .15s; border-radius: 8px; min-width: 38px; min-height: 38px; display: flex; align-items: center; justify-content: center; }
    .sentry-edit:hover  { color: #457B9D; background: #EEF4F8; }
    .sentry-edit:active { color: #457B9D; background: #D8EAF4; }
    .sentry-del  { background: none; border: none; font-size: 13px; cursor: pointer; color: #ABABAB; padding: 9px 11px; transition: color .15s, background .15s; border-radius: 8px; min-width: 38px; min-height: 38px; display: flex; align-items: center; justify-content: center; }
    .sentry-del:hover  { color: #EF476F; background: #FEF0F4; }
    .sentry-del:active { color: #EF476F; background: #FCD9E3; }
    .edit-sheet { background: #fff; border-radius: 24px 24px 0 0; padding: 28px 24px max(40px, calc(24px + env(safe-area-inset-bottom, 0px))); width: 100%; max-width: 420px; max-height: 88vh; overflow-y: auto; }
    .edit-handle { width: 36px; height: 4px; background: #E0DDD9; border-radius: 2px; margin: 0 auto 24px; }
    .edit-title { font-family: 'Playfair Display', serif; font-size: 22px; margin-bottom: 20px; color: #1A1A1A; }
    .edit-lbl { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #ABABAB; margin-bottom: 8px; }
    .edit-cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-bottom: 20px; }
    .edit-amt-row { display: flex; align-items: center; background: #F7F5F2; border-radius: 14px; border: 1.5px solid #E8E4DF; padding: 0 16px; margin-bottom: 16px; transition: border-color .2s; }
    .edit-amt-row:focus-within { border-color: #1A1A1A; }
    .edit-save { width: 100%; padding: 15px; background: #1A1A1A; color: #F7F5F2; border: none; border-radius: 13px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; }
    .note-row { display: flex; align-items: center; background: #F7F5F2; border-radius: 12px; border: 1.5px solid #EDEAE6; padding: 0 14px; margin-bottom: 14px; transition: border-color .2s; }
    .note-row:focus-within { border-color: #C8C4BE; }
    .note-ico { font-size: 12px; color: #CDCAC5; padding-right: 9px; flex-shrink: 0; line-height: 1; }
    .note-inp { flex: 1; border: none; outline: none; font-family: 'Inter', sans-serif; font-size: 12.5px; font-weight: 400; color: #555; padding: 11px 0; background: none; width: 100%; }
    .note-inp::placeholder { color: #C8C4BE; }
    .edit-note-row { display: flex; align-items: center; background: #F7F5F2; border-radius: 12px; border: 1.5px solid #EDEAE6; padding: 0 14px; margin-bottom: 16px; transition: border-color .2s; }
    .edit-note-row:focus-within { border-color: #C8C4BE; }
    .enote { font-size: 10px; color: #ABABAB; margin-top: 3px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sentry-note { color: #C4C1BC; font-style: italic; }
    .cdot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .cnm { flex: 1; font-size: 13px; color: #1A1A1A; font-weight: 400; }
    .cpct { font-size: 11px; color: #ABABAB; min-width: 32px; text-align: right; }
    .camt { font-family: 'Playfair Display', serif; font-size: 17px; color: #1A1A1A; min-width: 90px; text-align: right; }
    .elist { display: flex; flex-direction: column; gap: 8px; }
    .eitem { display: flex; align-items: center; gap: 12px; background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
    .eico { width: 40px; height: 40px; background: #F7F5F2; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .einfo { flex: 1; min-width: 0; }
    .ecat { font-size: 13px; font-weight: 500; color: #1A1A1A; }
    .edt  { font-size: 10px; color: #ABABAB; margin-top: 2px; letter-spacing: 0.3px; }
    .eamt { font-family: 'Playfair Display', serif; font-size: 17px; color: #1A1A1A; font-weight: 400; flex-shrink: 0; }
    .edel { background: none; border: none; color: #CCC; cursor: pointer; font-size: 14px; padding: 9px; min-width: 38px; min-height: 38px; display: flex; align-items: center; justify-content: center; transition: color .15s, background .15s; flex-shrink: 0; border-radius: 8px; }
    .edel:hover  { color: #C0392B; background: #FEF0F4; }
    .edel:active { color: #C0392B; background: #FCD9E3; }
    .empty { text-align: center; padding: 60px 20px; color: #ABABAB; }
    .empty-e { font-size: 40px; margin-bottom: 12px; }
    .empty-t { font-size: 13px; line-height: 1.6; }
    .toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: #1A1A1A; color: #F7F5F2; padding: 10px 22px; border-radius: 100px; font-size: 12px; font-weight: 500; letter-spacing: 0.5px; z-index: 200; pointer-events: none; animation: up .2s ease; white-space: nowrap; }
    @keyframes up { from { opacity:0; transform: translateX(-50%) translateY(10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
    .inc-trigger { font-family: 'Inter',sans-serif; font-size: 18px; font-weight: 300; cursor: pointer; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 1px; transition: border-color .2s; }
    .inc-trigger:hover { border-bottom-color: rgba(255,255,255,0.5); }
    @media (max-height: 680px) { .hd { padding: 24px 28px 20px; } .stats { padding: 8px 28px 0; } }
    @media (max-width: 360px) { .cat-grid { gap: 6px; } .cbt-lbl { font-size: 8px; } .content { padding-left: 20px; padding-right: 20px; } }
    .overlay { position: fixed; inset: 0; background: rgba(26,26,26,.45); display: flex; align-items: flex-end; justify-content: center; padding: 20px; z-index: 100; }
    .cbox { background: #fff; border-radius: 20px; padding: 28px 24px; width: 100%; max-width: 400px; text-align: center; }
    .ctitle { font-family: 'Playfair Display', serif; font-size: 22px; margin-bottom: 8px; }
    .csub { font-size: 12px; color: #ABABAB; margin-bottom: 22px; }
    .cbtns { display: flex; gap: 10px; }
    .cno  { flex:1; padding:13px; border:1.5px solid #E8E4DF; border-radius:12px; background:none; cursor:pointer; font-size:13px; font-family:'Inter',sans-serif; color:#888; }
    .cyes { flex:1; padding:13px; background:#1A1A1A; border:none; border-radius:12px; cursor:pointer; font-size:13px; font-weight:500; font-family:'Inter',sans-serif; color:#F7F5F2; }
  `;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: '#1A1A1A', borderRadius: 10, padding: '8px 14px' }}>
        <div style={{ color: '#888', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{d.label}</div>
        <div style={{ color: '#F7F5F2', fontSize: 16, fontFamily: 'Playfair Display,serif' }}>{fmt(d.sum)} €</div>
      </div>
    );
  };

  if (!loaded) return (
    <div className="root">
      <style>{css}</style>
      <div className="empty" style={{ paddingTop: '40vh' }}>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#ABABAB' }}>Učitavanje podataka...</div>
      </div>
    </div>
  );

  return (
    <div className="root">
      <style>{css}</style>

      <div className="hd">
        <div className="hd-top">
          <div>
            <div className="hd-title">Troškovi</div>
            <div className="hd-sub">Osobne financije</div>
          </div>
          <div className="mnav">
            <button className="marr" onClick={prevM}>‹</button>
            <div className="mlbl">{MONTHS[month].slice(0, 3)} {year}</div>
            <button className="marr" onClick={nextM}>›</button>
          </div>
        </div>

        <div className="inc-strip">
          <div className="inc-lbl">Prihodi</div>
          {incomeEditing ? (
            <input
              className="inc-input"
              autoFocus
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={income}
              onChange={e => saveIncome(e.target.value)}
              onBlur={() => setIncomeEditing(false)}
            />
          ) : (
            <div
              className="inc-trigger"
              onClick={() => setIncomeEditing(true)}
              style={{ color: income ? '#F7F5F2' : '#666' }}
            >
              {income ? `${fmt(parseFloat(income))} €` : 'Dodaj prihod →'}
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-lbl">Potrošeno</div>
          <div className="stat-num">{fmt(total)} <span style={{ fontSize: 12 }}>€</span></div>
          {inc > 0 && (
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${spentPct}%`, background: '#1A1A1A' }} />
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat-lbl">Ostaje</div>
          <div className={`stat-num ${left === null ? '' : left < 0 ? 'red' : 'grn'}`}>
            {left !== null ? `${fmt(left)} €` : '—'}
          </div>
          {inc > 0 && left !== null && (
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(0, 100 - spentPct)}%`, background: left < 0 ? '#C0392B' : '#27AE60' }} />
            </div>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tb ${tab === 'add' ? 'on' : ''}`}     onClick={() => setTab('add')}>Dodaj</button>
        <button className={`tb ${tab === 'pregled' ? 'on' : ''}`} onClick={() => setTab('pregled')}>Pregled</button>
        <button className={`tb ${tab === 'lista' ? 'on' : ''}`}   onClick={() => setTab('lista')}>Lista</button>
      </div>

      <div className="content">

        {tab === 'add' && (
          <>
            <div className="fl">Kategorija</div>
            <div className="cat-grid">
              {CATEGORIES.map(c => (
                <button key={c.id} className={`cbt ${cat === c.id ? 'sel' : ''}`} onClick={() => setCat(c.id)}>
                  <span className="cbt-em">{c.emoji}</span>
                  <span className="cbt-lbl">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="fl">Iznos</div>
            <div className="amt-row">
              <span className="amt-sym">€</span>
              <input
                className="amt-inp"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpense()}
              />
            </div>
            <div className="note-row">
              <span className="note-ico">✎</span>
              <input
                className="note-inp"
                type="text"
                placeholder="Napomena  (npr. YouTube, Netflix…)"
                value={note}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExpense()}
                maxLength={80}
              />
            </div>
            <button className="add-btn" onClick={addExpense} disabled={!amount || parseFloat(amount) <= 0}>
              Dodaj trošak
            </button>
          </>
        )}

        {tab === 'pregled' && (
          byCat.length === 0 ? (
            <div className="empty">
              <div className="empty-e">📊</div>
              <div className="empty-t">Još nema troškova<br />za ovaj mjesec</div>
            </div>
          ) : (
            <>
              <div className="top-banner">
                <div>
                  <div className="tb-lbl">Najviše trošiš na</div>
                  <div className="tb-val">{byCat[0].emoji} {byCat[0].label}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tb-lbl">Iznos</div>
                  <div className="tb-val">{fmt(byCat[0].sum)} €</div>
                </div>
              </div>
              <div className="pie-wrap">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={byCat}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={80}
                      paddingAngle={2}
                      dataKey="sum"
                      stroke="none"
                      activeIndex={activeSlice !== null ? byCat.findIndex(c => c.id === activeSlice) : undefined}
                      activeShape={(props) => {
                        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                        const darken = (hex) => {
                          const n = parseInt(hex.slice(1), 16);
                          const r = Math.max(0, (n >> 16) - 40);
                          const g = Math.max(0, ((n >> 8) & 0xff) - 40);
                          const b = Math.max(0, (n & 0xff) - 40);
                          return `rgb(${r},${g},${b})`;
                        };
                        return (
                          <g>
                            <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={darken(fill)} />
                          </g>
                        );
                      }}
                      onClick={(_, index) => setActiveSlice(prev => prev === byCat[index]?.id ? null : byCat[index]?.id)}
                    >
                      {byCat.map((c, i) => <Cell key={i} fill={c.color} cursor="pointer" />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="cat-rows" style={{ padding: '0 20px 12px' }}>
                  {byCat.map(c => {
                    const isOpen = expandedCat === c.id;
                    const entries = expenses.filter(e => e.category === c.id);
                    return (
                      <div key={c.id}>
                        <div className="crow" onClick={() => setExpandedCat(isOpen ? null : c.id)}>
                          <div className="cdot" style={{ background: c.color }} />
                          <div className="cnm">{c.emoji} {c.label}</div>
                          <div className="cpct">{total > 0 ? Math.round((c.sum / total) * 100) : 0}%</div>
                          <div className="camt">{fmt(c.sum)} €</div>
                          <div className={`crow-chevron ${isOpen ? 'open' : ''}`}>›</div>
                        </div>
                        {isOpen && (
                          <div className="sub-entries">
                            {entries.map(e => (
                              <div key={e.id} className="sentry">
                                <div className="sentry-date">{e.date}{e.note && <span className="sentry-note"> · {e.note}</span>}</div>
                                <div className="sentry-amt">{fmt(e.amount)} €</div>
                                <button className="sentry-edit" onClick={() => openEdit(e)} title="Uredi">✎</button>
                                <button className="sentry-del"  onClick={() => setConfirmId(e.id)} title="Obriši">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )
        )}

        {tab === 'lista' && (
          expenses.length === 0 ? (
            <div className="empty">
              <div className="empty-e">📝</div>
              <div className="empty-t">Nema unesenih troškova<br />za ovaj mjesec</div>
            </div>
          ) : (
            <div className="elist">
              {expenses.map(e => {
                const c = CATEGORIES.find(x => x.id === e.category) || CATEGORIES[7];
                return (
                  <div key={e.id} className="eitem">
                    <div className="eico">{c.emoji}</div>
                    <div className="einfo">
                      <div className="ecat">{c.label}</div>
                      <div className="edt">{e.date}</div>
                      {e.note && <div className="enote">{e.note}</div>}
                    </div>
                    <div className="eamt">{fmt(e.amount)} €</div>
                    <button className="edel" onClick={() => setConfirmId(e.id)}>✕</button>
                  </div>
                );
              })}
            </div>
          )
        )}

      </div>

      {toast && <div className="toast">{toast}</div>}

      {confirmId && (
        <div className="overlay" onClick={() => setConfirmId(null)}>
          <div className="cbox" onClick={e => e.stopPropagation()}>
            <div className="ctitle">Obrisati trošak?</div>
            <div className="csub">Ova radnja se ne može poništiti</div>
            <div className="cbtns">
              <button className="cno"  onClick={() => setConfirmId(null)}>Odustani</button>
              <button className="cyes" onClick={() => remove(confirmId)}>Obriši</button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="overlay" onClick={() => setEditItem(null)}>
          <div className="edit-sheet" onClick={e => e.stopPropagation()}>
            <div className="edit-handle" />
            <div className="edit-title">Uredi trošak</div>
            <div className="edit-lbl">Kategorija</div>
            <div className="edit-cat-grid">
              {CATEGORIES.map(c => (
                <button key={c.id} className={`cbt ${editCat === c.id ? 'sel' : ''}`} onClick={() => setEditCat(c.id)}>
                  <span className="cbt-em">{c.emoji}</span>
                  <span className="cbt-lbl">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="edit-lbl">Iznos</div>
            <div className="edit-amt-row">
              <span className="amt-sym">€</span>
              <input
                className="amt-inp"
                type="number"
                inputMode="decimal"
                autoFocus
                value={editAmt}
                onChange={e => setEditAmt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
              />
            </div>
            <div className="edit-note-row">
              <span className="note-ico">✎</span>
              <input
                className="note-inp"
                type="text"
                placeholder="Napomena  (npr. YouTube, Netflix…)"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                maxLength={80}
              />
            </div>
            <button className="edit-save" onClick={saveEdit}>Spremi izmjene</button>
          </div>
        </div>
      )}

    </div>
  );
}
