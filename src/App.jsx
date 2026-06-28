import { useState, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";

const CategoryIcon = ({ id, size = 20, color = "currentColor", strokeWidth = 1.5 }) => {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 },
  };
  switch (id) {
    case "stanarina":
      return (
        <svg {...p}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "hrana":
      return (
        <svg {...p}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case "transport":
      return (
        <svg {...p}>
          <path d="M19 17H5a2 2 0 0 1-2-2V9l2.2-4.6A1 1 0 0 1 6.1 4h11.8a1 1 0 0 1 .9.6L21 9v6a2 2 0 0 1-2 2z" />
          <circle cx="8.5" cy="17" r="1.5" />
          <circle cx="15.5" cy="17" r="1.5" />
          <path d="M3 9h18" />
        </svg>
      );
    case "kafici":
      return (
        <svg {...p}>
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      );
    case "shopping":
      return (
        <svg {...p}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "zdravlje":
      return (
        <svg {...p}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "pretplate":
      return (
        <svg {...p}>
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      );
    case "stednja":
      return (
        <svg {...p}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "ostalo":
      return (
        <svg {...p}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      );
    default:
      return null;
  }
};

const CATEGORIES = [
  { id: "stanarina", label: "Stanarina", color: "#2D6A4F" },
  { id: "hrana",     label: "Hrana",     color: "#E76F51" },
  { id: "transport", label: "Prijevoz",  color: "#457B9D" },
  { id: "kafici",    label: "Kafići",    color: "#E9C46A" },
  { id: "shopping",  label: "Shopping",  color: "#C77DFF" },
  { id: "zdravlje",  label: "Zdravlje",  color: "#EF476F" },
  { id: "pretplate", label: "Pretplate", color: "#118AB2" },
  { id: "stednja",   label: "Štednja",   color: "#52B788" },
  { id: "ostalo",    label: "Ostalo",    color: "#64748B" },
];

const MONTHS = ["Siječanj","Veljača","Ožujak","Travanj","Svibanj","Lipanj","Srpanj","Kolovoz","Rujan","Listopad","Studeni","Prosinac"];
const fmt = (n) => new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function App() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const [income, setIncome] = useState("");
  const [allExpenses, setAllExpenses] = useState([]);
  const [tab, setTab] = useState("add");
  const [cat, setCat] = useState("hrana");
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState(null);
  const [toastFading, setToastFading] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [incomeEditing, setIncomeEditing] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [activeSlice, setActiveSlice] = useState(null);
  const [editAmt, setEditAmt] = useState("");
  const [editCat, setEditCat] = useState("");
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState("");
  const toastTimer = useRef(null);
  const fadeTimer  = useRef(null);

  const expenses = allExpenses.filter(e => {
    const parts = e.date.split('.');
    if (parts.length >= 3) {
      const eMonth = parseInt(parts[1], 10) - 1;
      const eYear = parseInt(parts[2], 10);
      return eMonth === month && eYear === year;
    }
    return false;
  });

  const flash = (msg, duration = 1800) => {
    clearTimeout(toastTimer.current);
    clearTimeout(fadeTimer.current);
    setToast(msg);
    setToastFading(false);
    toastTimer.current = setTimeout(() => {
      setToastFading(true);
      fadeTimer.current = setTimeout(() => {
        setToast(null);
        setToastFading(false);
      }, 350);
    }, duration);
  };

  const handleSave = () => flash("Vaše promjene su uspješno pohranjene", 2500);

  const addExpense = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const trimmedNote = note.trim();
    const newDate = new Date();
    const formattedDate = `${newDate.getDate()}.${newDate.getMonth() + 1}.${newDate.getFullYear()}.`;
    const e = { id: Date.now(), category: cat, amount: val, date: formattedDate, ...(trimmedNote && { note: trimmedNote }) };
    const next = [e, ...allExpenses];
    setAllExpenses(next);
    setAmount("");
    setNote("");
    flash("Dodano ✓");
    setTab("pregled");
  };

  const remove = (id) => {
    const next = allExpenses.filter(e => e.id !== id);
    setAllExpenses(next);
    setConfirmId(null);
  };

  const saveIncome = (v) => {
    setIncome(v);
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

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: 'var(--color-surface-2)', borderRadius: 10, padding: '8px 14px', border: '1px solid var(--color-glass-border-md)' }}>
        <div style={{ color: 'var(--color-on-dark-subtle)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>{d.label}</div>
        <div style={{ color: 'var(--color-on-dark)', fontSize: 16, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>{fmt(d.sum)} €</div>
      </div>
    );
  };

  return (
    <div className="root">

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
            <div className="inc-trigger" onClick={() => setIncomeEditing(true)}>
              {income
                ? <>{fmt(parseFloat(income))} €<span className="inc-edit-ico">✎</span></>
                : <span className="inc-add">+ Dodaj prihod</span>
              }
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-lbl">Potrošeno</div>
          <div className="stat-num">{fmt(total)}<span className="stat-curr"> €</span></div>
          {inc > 0 && (
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${spentPct}%`, background: 'var(--color-accent)', opacity: 0.85 }} />
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat-lbl">Ostaje</div>
          <div className={`stat-num ${left === null ? '' : left < 0 ? 'red' : 'grn'}`}>
            {left !== null ? <>{fmt(left)}<span className="stat-curr"> €</span></> : '—'}
          </div>
          {inc > 0 && left !== null && (
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(0, 100 - spentPct)}%`, background: left < 0 ? '#FF6B6B' : '#4ADE80' }} />
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
                  <CategoryIcon
                    id={c.id}
                    size={22}
                    color={cat === c.id ? 'var(--color-primary)' : 'var(--color-accent)'}
                    strokeWidth={1.5}
                  />
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
                  <div className="tb-val" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CategoryIcon id={byCat[0].id} size={18} color="var(--color-accent)" strokeWidth={1.5} />
                    {byCat[0].label}
                  </div>
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
                          <div className="cnm">
                            <CategoryIcon id={c.id} size={14} color={c.color} strokeWidth={2} />
                            {c.label}
                          </div>
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
                    <div className="eico" style={{ background: c.color + '26' }}>
                      <CategoryIcon id={c.id} size={20} color={c.color} strokeWidth={1.5} />
                    </div>
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

      <div className="save-bar">
        <button className="save-btn" onClick={handleSave}>Spremi</button>
      </div>

      {toast && <div className={`toast${toastFading ? ' fading' : ''}`}>{toast}</div>}

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
                  <CategoryIcon
                    id={c.id}
                    size={22}
                    color={editCat === c.id ? 'var(--color-primary)' : 'var(--color-accent)'}
                    strokeWidth={1.5}
                  />
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
