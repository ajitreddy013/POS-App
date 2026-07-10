import { dbService } from "../services/dbService";
import React, { useState, useEffect, useCallback } from "react";
import { Plus, X, DollarSign, ChevronDown } from "lucide-react";
import {
  getLocalDateString,
  formatDateForDisplay,
  formatDateToYMD,
  getPreviousDay,
} from "../utils/dateUtils";

const PRESET_CATEGORIES = [
  "Raw Materials", "Rent", "Utilities", "Salaries",
  "Maintenance", "Transport", "Marketing", "Equipment", "Others",
];

const EMPTY_FORM = {
  description: "",
  amount: "",
  category: "",
  spendingDate: getLocalDateString(),
  paymentMethod: "cash",
  notes: "",
};

const Spendings = () => {
  const [spendings, setSpendings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSpending, setEditingSpending] = useState(null);
  const [categories, setCategories] = useState(PRESET_CATEGORIES);
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [openSection, setOpenSection] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const getActivePreset = () => {
    const today = getLocalDateString();
    const yst = getPreviousDay(today);
    const now = new Date();
    const firstThisMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 1));
    const firstLastMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastDayLastMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 0));
    if (startDate === today && endDate === today) return "today";
    if (startDate === yst && endDate === yst) return "yesterday";
    if (startDate === firstThisMonth && endDate === today) return "thisMonth";
    if (startDate === firstLastMonth && endDate === lastDayLastMonth) return "lastMonth";
    return "custom";
  };

  const handlePreset = (preset) => {
    const today = getLocalDateString();
    const now = new Date();
    if (preset === "today") { setStartDate(today); setEndDate(today); }
    else if (preset === "yesterday") {
      const yst = getPreviousDay(today);
      setStartDate(yst); setEndDate(yst);
    } else if (preset === "thisMonth") {
      setStartDate(formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(today);
    } else if (preset === "lastMonth") {
      setStartDate(formatDateToYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 0)));
    }
  };

  const loadSpendings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getSpendings({ startDate, endDate });
      const sorted = (data || []).sort((a, b) => new Date(b.spending_date) - new Date(a.spending_date));
      setSpendings(sorted);
    } catch (_e) { /* silent */ } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { loadSpendings(); }, [loadSpendings]);

  useEffect(() => {
    dbService.getSpendingCategories().then((data) => {
      if (data?.length) setCategories(Array.from(new Set([...PRESET_CATEGORIES, ...data])));
    }).catch(() => {});
  }, []);

  const buildRecord = (f) => ({
    description: f.description.trim(),
    amount: Number(f.amount),
    category: f.category.trim(),
    spending_date: f.spendingDate,
    payment_method: f.paymentMethod,
    notes: f.notes.trim(),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.description.trim()) return setError("Description is required.");
    if (!formData.amount || Number(formData.amount) <= 0) return setError("Enter a valid amount.");
    if (!formData.category.trim()) return setError("Select a category.");
    setSubmitting(true);
    try {
      if (editingSpending) {
        await dbService.updateSpending(editingSpending.id, buildRecord(formData));
      } else {
        await dbService.addSpending(buildRecord(formData));
      }
      resetForm();
      loadSpendings();
    } catch (_e) {
      setError("Failed to save. Please try again.");
    } finally { setSubmitting(false); }
  };

  const handleEdit = (s) => {
    setEditingSpending(s);
    setFormData({
      description: s.description || "",
      amount: s.amount != null ? String(s.amount) : "",
      category: s.category || "",
      spendingDate: (s.spending_date || "").split(" ")[0] || getLocalDateString(),
      paymentMethod: s.payment_method || "cash",
      notes: s.notes || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this spending?")) {
      try { await dbService.deleteSpending(id); loadSpendings(); } catch (_e) { /* silent */ }
    }
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM, spendingDate: getLocalDateString() });
    setEditingSpending(null);
    setShowForm(false);
    setError("");
  };

  const totalSpending = spendings.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const cashSpending = spendings.filter(s => (s.payment_method || '').toLowerCase() === 'cash').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const upiSpending = spendings.filter(s => (s.payment_method || '').toLowerCase() === 'upi').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const activePreset = getActivePreset();

  const payLabel = (m) => ({ cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank" }[m] || m);

  return (
    <div className="spd-root">
      <style>{`
        .spd-root {
          min-height: 100vh;
          background: #f6f3ee;
          font-family: 'Outfit', -apple-system, sans-serif;
          color: #221f1a;
          padding-bottom: 80px;
        }

        /* ── Sticky header ── */
        .spd-hdr {
          background: #fff;
          border-bottom: 1px solid #e6ded3;
          padding: 14px 16px 0;
          position: sticky; top: 0; z-index: 10;
        }
        .spd-hdr-row {
          display: flex; align-items: center;
          justify-content: space-between; gap: 10px;
          padding-bottom: 12px;
        }
        .spd-hdr-title { font-size: 1.1rem; font-weight: 800; color: #221f1a; margin: 0; }
        .spd-add-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 8px 14px; border-radius: 999px; border: none;
          background: #b6412c; color: #fff;
          font-size: 0.8rem; font-weight: 700; cursor: pointer;
          font-family: inherit; white-space: nowrap;
        }

        /* ── Pills ── */
        .spd-pills {
          display: flex; gap: 6px; overflow-x: auto; padding-bottom: 12px;
          scrollbar-width: none;
        }
        .spd-pills::-webkit-scrollbar { display: none; }
        .spd-pill {
          padding: 7px 14px; border-radius: 999px;
          border: 1.5px solid #e6ded3; background: #fff; color: #57504a;
          font-size: 0.8rem; font-weight: 700; cursor: pointer;
          white-space: nowrap; font-family: inherit; flex-shrink: 0;
        }
        .spd-pill.active { background: #b6412c; border-color: #b6412c; color: #fff; }

        /* ── Date row ── */
        .spd-dates {
          display: flex; gap: 10px; padding: 10px 16px 14px;
          background: #fff; border-bottom: 1px solid #e6ded3;
        }
        .spd-date-field { display: flex; flex-direction: column; gap: 3px; flex: 1; }
        .spd-date-label {
          font-size: 0.68rem; font-weight: 700; color: #94837a;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .spd-date-input {
          border: 1.5px solid #e6ded3; border-radius: 10px;
          padding: 8px 10px; font-size: 0.84rem; color: #221f1a;
          background: #fdfbf7; font-family: inherit;
          width: 100%; box-sizing: border-box;
        }
        .spd-date-input:focus { outline: none; border-color: #b6412c; }

        /* ── Body ── */
        .spd-body { padding: 14px 14px 0; display: flex; flex-direction: column; gap: 12px; }

        /* ── Summary cards ── */
        .spd-sum-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .spd-sum-value.green { color: #1b7543; }
        .spd-sum-value.blue  { color: #5a64c4; }
        .spd-sum-card {
          background: #fff; border: 1px solid #e6ded3; border-radius: 16px;
          padding: 14px 14px 12px;
        }
        .spd-sum-label {
          font-size: 0.7rem; font-weight: 700; color: #94837a;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .spd-sum-value { font-size: 1.4rem; font-weight: 800; margin: 6px 0 2px; letter-spacing: -0.02em; }
        .spd-sum-value.red   { color: #b91c1c; }
        .spd-sum-value.dark  { color: #221f1a; }
        .spd-sum-sub { font-size: 0.74rem; color: #94837a; font-weight: 600; }
        .spd-sum-full {
          grid-column: 1 / -1;
          background: linear-gradient(135deg, #b6412c 0%, #d0553c 100%);
          border: none;
        }
        .spd-sum-full .spd-sum-label { color: rgba(255,255,255,0.75); }
        .spd-sum-full .spd-sum-value { color: #fff; }
        .spd-sum-full .spd-sum-sub   { color: rgba(255,255,255,0.7); }

        /* ── Panel ── */
        .spd-panel {
          background: #fff; border: 1px solid #e6ded3; border-radius: 16px; overflow: hidden;
        }
        .spd-panel-hdr {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; cursor: pointer; border: none; background: none;
          width: 100%; text-align: left; font-family: inherit;
        }
        .spd-panel-hdr-left { display: flex; flex-direction: column; gap: 1px; }
        .spd-panel-title { font-size: 0.95rem; font-weight: 800; color: #221f1a; }
        .spd-panel-count { font-size: 0.74rem; color: #94837a; font-weight: 600; }
        .spd-chev { color: #94837a; transition: transform 0.2s; }
        .spd-chev.open { transform: rotate(180deg); }

        /* ── Spending cards ── */
        .spd-card {
          padding: 12px 16px; border-top: 1px solid #f1ebe1;
          display: flex; align-items: center; gap: 12px;
        }
        .spd-card:first-child { border-top: none; }
        .spd-card-icon {
          width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; background: rgba(185,28,28,0.08);
        }
        .spd-card-main { flex: 1; min-width: 0; }
        .spd-card-desc {
          font-size: 0.88rem; font-weight: 700; color: #221f1a;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .spd-card-meta { font-size: 0.74rem; color: #94837a; margin-top: 2px; }
        .spd-card-right { text-align: right; flex-shrink: 0; }
        .spd-card-amount { font-size: 0.95rem; font-weight: 800; color: #b91c1c; }
        .spd-card-pay { font-size: 0.7rem; color: #94837a; margin-top: 2px; }
        .spd-cat-tag {
          background: rgba(182,65,44,0.1); color: #b6412c;
          font-size: 0.66rem; font-weight: 700;
          padding: 2px 7px; border-radius: 999px; display: inline-block;
        }
        .spd-card-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .spd-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 8px;
          border: 1px solid #e6ded3; background: #fdfbf7;
          color: #57504a; cursor: pointer; font-size: 0.75rem;
        }
        .spd-icon-btn:hover { background: #f1ebe1; }
        .spd-icon-btn.del { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
        .spd-icon-btn.del:hover { background: #fee2e2; }

        .spd-empty { text-align: center; padding: 32px 16px; color: #94837a; font-size: 0.88rem; }
        .spd-empty-icon { font-size: 2rem; margin-bottom: 8px; }

        /* ── Modal ── */
        .spd-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.5);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 1000;
        }
        @media (min-height: 600px) {
          .spd-overlay { align-items: center; padding: 1rem; }
        }

        .spd-modal {
          background: #fff; width: 100%; max-width: 440px;
          border-radius: 20px 20px 0 0;
          max-height: 90vh; display: flex; flex-direction: column;
          box-shadow: 0 -8px 40px rgba(15,23,42,0.22);
          animation: spd-up 0.2s ease;
          overflow: hidden;
        }
        @media (min-height: 600px) {
          .spd-modal { border-radius: 20px; box-shadow: 0 24px 60px rgba(15,23,42,0.28); animation: spd-in 0.18s ease; }
        }
        @keyframes spd-up  { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes spd-in  { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }

        .spd-modal-hdr {
          padding: 14px 16px 12px;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          display: flex; align-items: center; gap: 8px; flex-shrink: 0;
        }
        .spd-modal-hdr h2 {
          margin: 0; flex: 1; font-size: 0.95rem; font-weight: 800; color: #fff;
          display: flex; align-items: center; gap: 6px;
        }
        .spd-modal-close {
          width: 28px; height: 28px; border-radius: 8px;
          background: rgba(255,255,255,0.2); border: none; color: #fff;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .spd-modal-close:hover { background: rgba(255,255,255,0.35); }

        /* form scroll fix */
        .spd-modal form { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

        .spd-modal-body {
          flex: 1; overflow-y: auto; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 10px;
        }

        .spd-fg { display: flex; flex-direction: column; gap: 4px; }
        .spd-fg label { font-size: 0.72rem; font-weight: 700; color: #57504a; }
        .spd-fg .req { color: #b6412c; }
        .spd-fg input,
        .spd-fg select,
        .spd-fg textarea {
          border: 1.5px solid #e6ded3; border-radius: 10px;
          padding: 9px 11px; font-size: 0.875rem;
          color: #221f1a; background: #fdfbf7; font-family: inherit;
        }
        .spd-fg input:focus,
        .spd-fg select:focus,
        .spd-fg textarea:focus {
          outline: none; border-color: #b6412c; background: #fff;
          box-shadow: 0 0 0 3px rgba(182,65,44,0.08);
        }
        .spd-fg textarea { resize: none; }

        .spd-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

        /* Amount ₹ prefix */
        .spd-amt { position: relative; }
        .spd-amt-sign {
          position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
          font-size: 0.85rem; font-weight: 700; color: #94837a; pointer-events: none;
        }
        .spd-amt input { padding-left: 22px; }

        /* Category chips */
        .spd-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .spd-chip {
          padding: 4px 10px; border-radius: 999px;
          border: 1.5px solid #e6ded3; background: #fdfbf7;
          font-size: 0.72rem; font-weight: 600; color: #57504a;
          cursor: pointer; font-family: inherit; line-height: 1.4;
        }
        .spd-chip:hover { border-color: #b6412c; color: #b6412c; }
        .spd-chip.on { border-color: #b6412c; background: #b6412c; color: #fff; }

        /* Payment pills */
        .spd-pm { display: flex; gap: 6px; }
        .spd-pm-opt { flex: 1; }
        .spd-pm-opt input { display: none; }
        .spd-pm-opt label {
          display: block; text-align: center; padding: 7px 4px;
          border: 1.5px solid #e6ded3; border-radius: 9px;
          background: #fdfbf7; font-size: 0.72rem; font-weight: 700;
          color: #57504a; cursor: pointer; font-family: inherit;
        }
        .spd-pm-opt input:checked + label { border-color: #b6412c; background: #b6412c; color: #fff; }
        .spd-pm-opt label:hover { border-color: #b6412c; color: #b6412c; }
        .spd-pm-opt input:checked + label:hover { color: #fff; }

        .spd-err {
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; padding: 8px 12px;
          font-size: 0.8rem; color: #b91c1c; font-weight: 600;
        }

        .spd-modal-foot {
          padding: 10px 16px 14px;
          border-top: 1px solid #f1ebe1; background: #fdfbf7;
          display: flex; justify-content: flex-end; gap: 8px; flex-shrink: 0;
        }
        .spd-btn-cancel {
          padding: 9px 16px; border-radius: 10px;
          border: 1px solid #e6ded3; background: #fff;
          color: #57504a; font-weight: 700; font-size: 0.83rem;
          cursor: pointer; font-family: inherit;
        }
        .spd-btn-cancel:hover { background: #f7f3ed; }
        .spd-btn-save {
          padding: 9px 18px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          color: #fff; font-weight: 700; font-size: 0.83rem;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 4px 12px rgba(182,65,44,0.25);
        }
        .spd-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      {/* ── Sticky header ── */}
      <div className="spd-hdr">
        <div className="spd-hdr-row">
          <p className="spd-hdr-title">Spendings</p>
          <button className="spd-add-btn" onClick={() => { setError(""); setShowForm(true); }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="spd-pills">
          {[
            { key: "yesterday", label: "Yesterday" },
            { key: "today",     label: "Today" },
            { key: "thisMonth", label: "This Month" },
            { key: "lastMonth", label: "Last Month" },
          ].map((p) => (
            <button
              key={p.key}
              className={`spd-pill${activePreset === p.key ? " active" : ""}`}
              onClick={() => handlePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Date range ── */}
      <div className="spd-dates">
        <div className="spd-date-field">
          <span className="spd-date-label">From</span>
          <input type="date" className="spd-date-input" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="spd-date-field">
          <span className="spd-date-label">To</span>
          <input type="date" className="spd-date-input" value={endDate}
            onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="spd-body">
        {/* ── Summary ── */}
        <div className="spd-sum-grid">
          <div className="spd-sum-card">
            <div className="spd-sum-label">Cash</div>
            <div className="spd-sum-value green">₹{cashSpending.toFixed(0)}</div>
            <div className="spd-sum-sub">{spendings.filter(s => (s.payment_method || '').toLowerCase() === 'cash').length} entries</div>
          </div>
          <div className="spd-sum-card">
            <div className="spd-sum-label">UPI</div>
            <div className="spd-sum-value blue">₹{upiSpending.toFixed(0)}</div>
            <div className="spd-sum-sub">{spendings.filter(s => (s.payment_method || '').toLowerCase() === 'upi').length} entries</div>
          </div>
          <div className="spd-sum-card">
            <div className="spd-sum-label">Total</div>
            <div className="spd-sum-value red">₹{totalSpending.toFixed(0)}</div>
            <div className="spd-sum-sub">{spendings.length} entries</div>
          </div>
        </div>

        {/* ── Spending list panel ── */}
        <div className="spd-panel">
          <button className="spd-panel-hdr" onClick={() => setOpenSection((v) => !v)}>
            <div className="spd-panel-hdr-left">
              <span className="spd-panel-title">Entries</span>
              <span className="spd-panel-count">{spendings.length} records</span>
            </div>
            <ChevronDown className={`spd-chev${openSection ? " open" : ""}`} size={18} />
          </button>

          {openSection && (
            loading ? (
              <div className="spd-empty">Loading…</div>
            ) : spendings.length === 0 ? (
              <div className="spd-empty">
                <div className="spd-empty-icon">💸</div>
                No spendings for this period
              </div>
            ) : (
              spendings.map((s) => (
                <div key={s.id} className="spd-card">
                  <div className="spd-card-icon">{s.payment_method === 'upi' ? '💳' : '💵'}</div>
                  <div className="spd-card-main">
                    <div className="spd-card-desc">{s.description || "—"}</div>
                    <div className="spd-card-meta">
                      {formatDateForDisplay(s.spending_date)}
                      {s.category
                        ? <> · <span className="spd-cat-tag">{s.category}</span></>
                        : null}
                    </div>
                  </div>
                  <div className="spd-card-right">
                    <div className="spd-card-amount">-₹{Number(s.amount).toFixed(0)}</div>
                    <div className="spd-card-pay">{payLabel(s.payment_method)}</div>
                  </div>
                  <div className="spd-card-actions">
                    <button className="spd-icon-btn" onClick={() => handleEdit(s)} title="Edit">✏️</button>
                    <button className="spd-icon-btn del" onClick={() => handleDelete(s.id)} title="Delete">🗑</button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* ── Add / Edit form modal ── */}
      {showForm && (
        <div className="spd-overlay" onClick={resetForm}>
          <div className="spd-modal" onClick={(e) => e.stopPropagation()}>

            <div className="spd-modal-hdr">
              <h2><DollarSign size={15} />{editingSpending ? "Edit Spending" : "New Spending"}</h2>
              <button className="spd-modal-close" onClick={resetForm}><X size={14} /></button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="spd-modal-body">
                {error && <div className="spd-err">{error}</div>}

                <div className="spd-fg">
                  <label>Description <span className="req">*</span></label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What was this expense for?"
                    autoFocus
                  />
                </div>

                <div className="spd-row2">
                  <div className="spd-fg">
                    <label>Amount <span className="req">*</span></label>
                    <div className="spd-amt">
                      <span className="spd-amt-sign">₹</span>
                      <input
                        type="number" step="0.01" min="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="spd-fg">
                    <label>Date <span className="req">*</span></label>
                    <input
                      type="date"
                      value={formData.spendingDate}
                      onChange={(e) => setFormData((p) => ({ ...p, spendingDate: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="spd-fg">
                  <label>Category <span className="req">*</span></label>
                  <div className="spd-chips">
                    {categories.map((cat) => (
                      <button
                        key={cat} type="button"
                        className={`spd-chip${formData.category === cat ? " on" : ""}`}
                        onClick={() => setFormData((p) => ({ ...p, category: cat }))}
                      >{cat}</button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                    placeholder="Or type custom category…"
                    style={{ marginTop: "6px" }}
                  />
                </div>

                <div className="spd-fg">
                  <label>Payment Method</label>
                  <div className="spd-pm">
                    {[
                      { v: "cash", l: "Cash" },
                      { v: "upi",  l: "UPI" },
                      { v: "card", l: "Card" },
                      { v: "bank_transfer", l: "Bank" },
                    ].map((o) => (
                      <div className="spd-pm-opt" key={o.v}>
                        <input type="radio" id={`pm-${o.v}`} name="pm" value={o.v}
                          checked={formData.paymentMethod === o.v}
                          onChange={() => setFormData((p) => ({ ...p, paymentMethod: o.v }))} />
                        <label htmlFor={`pm-${o.v}`}>{o.l}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="spd-fg">
                  <label>Notes <span style={{ color: "#94837a", fontWeight: 500 }}>(optional)</span></label>
                  <textarea rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Any additional details…"
                  />
                </div>
              </div>

              <div className="spd-modal-foot">
                <button type="button" className="spd-btn-cancel" onClick={resetForm}>Cancel</button>
                <button type="submit" className="spd-btn-save" disabled={submitting}>
                  {submitting ? "Saving…" : editingSpending ? "Update" : "Add Spending"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Spendings;
