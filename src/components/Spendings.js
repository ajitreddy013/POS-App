import { dbService } from "../services/dbService";
import React, { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Plus,
  Edit,
  Trash2,
  Calendar,
  Search,
  X,
  Receipt,
  CreditCard,
  Tag,
  FileText,
  IndianRupee,
} from "lucide-react";

const PRESET_CATEGORIES = [
  "Raw Materials",
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Transport",
  "Marketing",
  "Equipment",
  "Others",
];

function getLocalDateString() {
  const today = new Date();
  return (
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0")
  );
}

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
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSpending, setEditingSpending] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState(PRESET_CATEGORIES);
  const [customCategory, setCustomCategory] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(),
    endDate: getLocalDateString(),
  });
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadSpendings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getSpendings(dateRange);
      setSpendings(data);
    } catch (err) {
      console.error("Failed to load spendings:", err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadSpendings();
  }, [loadSpendings]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await dbService.getSpendingCategories();
      if (data && data.length > 0) {
        const merged = Array.from(new Set([...PRESET_CATEGORIES, ...data]));
        setCategories(merged);
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  };

  // Map form state → DB record (fixes camelCase → snake_case + type coercion)
  const buildDbRecord = (form) => ({
    description: form.description.trim(),
    amount: Number(form.amount),
    category: form.category.trim(),
    spending_date: form.spendingDate,
    payment_method: form.paymentMethod,
    notes: form.notes.trim(),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.description.trim()) return setError("Description is required.");
    if (!formData.amount || Number(formData.amount) <= 0) return setError("Enter a valid amount.");
    if (!formData.category.trim()) return setError("Category is required.");

    setSubmitting(true);
    try {
      const record = buildDbRecord(formData);
      if (editingSpending) {
        await dbService.updateSpending(editingSpending.id, record);
      } else {
        await dbService.addSpending(record);
      }
      resetForm();
      loadSpendings();
      loadCategories();
    } catch (err) {
      console.error("Failed to save spending:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (spending) => {
    setEditingSpending(spending);
    setFormData({
      description: spending.description || "",
      amount: spending.amount != null ? String(spending.amount) : "",
      category: spending.category || "",
      spendingDate: (spending.spending_date || "").split(" ")[0] || getLocalDateString(),
      paymentMethod: spending.payment_method || "cash",
      notes: spending.notes || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this spending?")) {
      try {
        await dbService.deleteSpending(id);
        loadSpendings();
      } catch (err) {
        console.error("Failed to delete spending:", err);
      }
    }
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM, spendingDate: getLocalDateString() });
    setEditingSpending(null);
    setShowForm(false);
    setError("");
    setCustomCategory("");
  };

  const handleCategoryChip = (cat) => {
    setFormData((prev) => ({ ...prev, category: cat }));
    setCustomCategory("");
  };

  const filteredSpendings = spendings.filter((spending) => {
    const desc = (spending.description || "").toLowerCase();
    const cat = (spending.category || "").toLowerCase();
    const matchesSearch =
      desc.includes(searchTerm.toLowerCase()) ||
      cat.includes(searchTerm.toLowerCase());
    const matchesCategory =
      !selectedCategory || spending.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalSpending = filteredSpendings.reduce(
    (sum, s) => sum + (Number(s.amount) || 0),
    0
  );

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const [datePart] = (dateString || "").split(" ");
    const parts = datePart.split("-");
    if (parts.length !== 3) return dateString;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const paymentLabel = (method) => {
    const map = {
      cash: "Cash",
      card: "Card",
      upi: "UPI",
      bank_transfer: "Bank Transfer",
    };
    return map[method] || method;
  };

  return (
    <div className="spd-root">
      <style>{`
        .spd-root {
          min-height: 100vh;
          padding: 1.5rem 1.25rem 3rem;
          background: linear-gradient(180deg, #fdfbf9 0%, #fff7f2 40%, #f8fafc 100%);
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          color: #1e293b;
        }
        .spd-shell { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }

        /* ── Toolbar ── */
        .spd-toolbar {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          box-shadow: 0 4px 18px rgba(15,23,42,0.05);
          padding: 1rem 1.2rem;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.8rem;
        }
        .spd-toolbar-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-right: auto;
        }
        .spd-toolbar-title svg { color: #b6412c; }
        .spd-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .spd-field-label {
          font-size: 0.68rem; font-weight: 700; color: #94837a;
          text-transform: uppercase; letter-spacing: 0.07em;
        }
        .spd-input, .spd-select {
          border: 1px solid #e6ded3; border-radius: 10px;
          padding: 0.55rem 0.75rem; font-size: 0.875rem;
          color: #221f1a; background: #fdfbf7; font-family: inherit;
          min-width: 130px;
        }
        .spd-input:focus, .spd-select:focus {
          outline: none; border-color: #b6412c; background: #fff;
          box-shadow: 0 0 0 3px rgba(182,65,44,0.1);
        }
        .spd-search-wrap { position: relative; display: flex; align-items: center; }
        .spd-search-wrap svg { position: absolute; left: 10px; color: #b3a89c; pointer-events: none; }
        .spd-search-wrap .spd-input { padding-left: 34px; min-width: 200px; }

        .spd-add-btn {
          display: inline-flex; align-items: center; gap: 0.45rem;
          padding: 0.6rem 1.1rem; border-radius: 11px; border: none;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          color: #fff; font-size: 0.875rem; font-weight: 700;
          cursor: pointer; box-shadow: 0 6px 16px rgba(182,65,44,0.3);
          white-space: nowrap; transition: filter 0.15s;
          align-self: flex-end;
        }
        .spd-add-btn:hover { filter: brightness(1.08); }

        /* ── Summary cards ── */
        .spd-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.9rem;
        }
        .spd-summary-card {
          background: #ffffff; border: 1px solid #ece4d8;
          border-radius: 16px; padding: 1.1rem 1.2rem;
          box-shadow: 0 4px 18px rgba(15,23,42,0.04);
          display: flex; align-items: center; gap: 0.9rem;
        }
        .spd-summary-icon {
          width: 44px; height: 44px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .spd-summary-icon.spend { background: rgba(182,65,44,0.1); color: #b6412c; }
        .spd-summary-icon.count { background: rgba(15,23,42,0.06); color: #334155; }
        .spd-summary-icon.avg   { background: rgba(39,174,96,0.1); color: #16a34a; }
        .spd-summary-label { font-size: 0.7rem; font-weight: 800; color: #94837a; text-transform: uppercase; letter-spacing: 0.08em; }
        .spd-summary-value { margin-top: 0.25rem; font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }

        /* ── Table panel ── */
        .spd-panel {
          background: #ffffff; border: 1px solid #ece4d8;
          border-radius: 18px; box-shadow: 0 4px 18px rgba(15,23,42,0.04);
          overflow: hidden;
        }
        .spd-panel-header {
          padding: 0.9rem 1.2rem;
          border-bottom: 1px solid #f1ebe1;
          font-size: 0.78rem; font-weight: 800;
          color: #57504a; text-transform: uppercase; letter-spacing: 0.06em;
          display: flex; align-items: center; justify-content: space-between;
        }
        .spd-table-wrap { overflow-x: auto; }
        .spd-table { width: 100%; border-collapse: collapse; min-width: 680px; }
        .spd-table thead th {
          text-align: left; padding: 0.75rem 1rem;
          font-size: 0.7rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.06em;
          color: #94837a; background: #fdfbf7;
          border-bottom: 1px solid #f1ebe1; white-space: nowrap;
        }
        .spd-table tbody td {
          padding: 0.8rem 1rem; font-size: 0.855rem;
          color: #3a342e; border-bottom: 1px solid #f5f0e9;
          vertical-align: middle;
        }
        .spd-table tbody tr:hover { background: #fffaf6; }
        .spd-table tbody tr:last-child td { border-bottom: none; }
        .spd-table td.amount { font-weight: 700; color: #b91c1c; }

        .spd-category-tag {
          background: rgba(182,65,44,0.09); color: #b6412c;
          font-size: 0.72rem; font-weight: 700;
          padding: 0.25rem 0.6rem; border-radius: 999px;
        }
        .spd-pay-chip {
          font-weight: 700; letter-spacing: 0.03em;
          padding: 0.25rem 0.65rem; border-radius: 999px;
          font-size: 0.7rem; display: inline-block;
        }
        .spd-pay-chip.cash  { background: rgba(39,174,96,0.1); color: #1f9c54; }
        .spd-pay-chip.upi   { background: rgba(102,126,234,0.1); color: #5a64c4; }
        .spd-pay-chip.card  { background: rgba(168,85,247,0.1); color: #9333ea; }
        .spd-pay-chip.bank_transfer { background: rgba(245,158,11,0.1); color: #b45309; }

        .spd-action-buttons { display: flex; gap: 0.35rem; }
        .spd-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 8px;
          border: 1px solid #e6ded3; background: #fdfbf7; color: #57504a; cursor: pointer;
          transition: background 0.12s;
        }
        .spd-icon-btn:hover { background: #f1ebe1; }
        .spd-icon-btn.danger { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
        .spd-icon-btn.danger:hover { background: #fee2e2; }

        .spd-empty-state { text-align: center; padding: 3rem 1rem; color: #94837a; }
        .spd-empty-state svg { color: #d9cdbf; margin-bottom: 0.8rem; }
        .spd-empty-state h3 { margin: 0 0 0.3rem; font-size: 1rem; color: #57504a; }
        .spd-empty-state p  { margin: 0; font-size: 0.85rem; }

        /* ── Modal / Form ── */
        .spd-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
          animation: spd-fade-in 0.15s ease;
        }
        @keyframes spd-fade-in { from { opacity: 0; } to { opacity: 1; } }

        .spd-drawer {
          background: #fff; border-radius: 22px;
          width: 100%; max-width: 520px;
          max-height: 92vh; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 32px 80px rgba(15,23,42,0.28);
          animation: spd-slide-up 0.2s ease;
        }
        @keyframes spd-slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        .spd-drawer-header {
          padding: 1.1rem 1.3rem 1rem;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          display: flex; align-items: center; gap: 0.7rem;
        }
        .spd-drawer-header h2 {
          margin: 0; flex: 1;
          font-size: 1.05rem; font-weight: 800; color: #fff;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .spd-close-btn {
          width: 32px; height: 32px; border-radius: 9px;
          background: rgba(255,255,255,0.2); border: none;
          color: #fff; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
          transition: background 0.12s;
        }
        .spd-close-btn:hover { background: rgba(255,255,255,0.35); }

        .spd-drawer-body {
          flex: 1; overflow-y: auto; padding: 1.3rem;
          display: flex; flex-direction: column; gap: 1.2rem;
        }

        .spd-section-label {
          font-size: 0.68rem; font-weight: 800; color: #b6412c;
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 0.7rem; display: flex; align-items: center; gap: 0.4rem;
        }

        .spd-fgroup { display: flex; flex-direction: column; gap: 0.35rem; }
        .spd-fgroup label {
          font-size: 0.78rem; font-weight: 700; color: #57504a;
        }
        .spd-fgroup label .req { color: #b6412c; }
        .spd-fgroup input,
        .spd-fgroup select,
        .spd-fgroup textarea {
          border: 1px solid #e6ded3; border-radius: 11px;
          padding: 0.65rem 0.85rem; font-size: 0.9rem;
          color: #221f1a; background: #fdfbf7; font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .spd-fgroup input:focus,
        .spd-fgroup select:focus,
        .spd-fgroup textarea:focus {
          outline: none; border-color: #b6412c; background: #fff;
          box-shadow: 0 0 0 3px rgba(182,65,44,0.1);
        }
        .spd-fgroup textarea { resize: vertical; min-height: 72px; }

        .spd-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }

        /* Category chips */
        .spd-cat-chips {
          display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.5rem;
        }
        .spd-cat-chip {
          padding: 0.3rem 0.7rem; border-radius: 999px;
          border: 1.5px solid #e6ded3; background: #fdfbf7;
          font-size: 0.75rem; font-weight: 600; color: #57504a;
          cursor: pointer; transition: all 0.12s;
        }
        .spd-cat-chip:hover { border-color: #b6412c; color: #b6412c; background: #fff5f3; }
        .spd-cat-chip.active { border-color: #b6412c; background: #b6412c; color: #fff; }

        /* Payment method radio-style buttons */
        .spd-pay-options { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.5rem; }
        .spd-pay-option input { display: none; }
        .spd-pay-option label {
          display: block; text-align: center; padding: 0.5rem 0.4rem;
          border: 1.5px solid #e6ded3; border-radius: 10px;
          background: #fdfbf7; font-size: 0.75rem; font-weight: 700;
          color: #57504a; cursor: pointer; transition: all 0.12s;
        }
        .spd-pay-option input:checked + label {
          border-color: #b6412c; background: #b6412c; color: #fff;
        }
        .spd-pay-option label:hover { border-color: #b6412c; color: #b6412c; }
        .spd-pay-option input:checked + label:hover { color: #fff; }
        .spd-pay-option .pay-icon { display: block; font-size: 1rem; margin-bottom: 2px; }

        /* Error */
        .spd-error {
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 10px; padding: 0.65rem 0.9rem;
          font-size: 0.83rem; color: #b91c1c; font-weight: 600;
        }

        /* Amount input with rupee prefix */
        .spd-amount-wrap { position: relative; display: flex; align-items: center; }
        .spd-amount-wrap svg { position: absolute; left: 11px; color: #94837a; pointer-events: none; }
        .spd-amount-wrap input { padding-left: 34px; }

        .spd-drawer-footer {
          padding: 1rem 1.3rem;
          border-top: 1px solid #f1ebe1;
          background: #fdfbf7;
          display: flex; justify-content: flex-end; gap: 0.7rem;
        }
        .spd-btn-cancel {
          padding: 0.65rem 1.2rem; border-radius: 11px;
          border: 1px solid #e6ded3; background: #fff;
          color: #57504a; font-weight: 700; font-size: 0.875rem;
          cursor: pointer; font-family: inherit;
        }
        .spd-btn-cancel:hover { background: #f7f3ed; }
        .spd-btn-submit {
          padding: 0.65rem 1.4rem; border-radius: 11px; border: none;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          color: #fff; font-weight: 700; font-size: 0.875rem;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 6px 16px rgba(182,65,44,0.28);
          transition: filter 0.15s;
          opacity: 1;
        }
        .spd-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .spd-btn-submit:not(:disabled):hover { filter: brightness(1.08); }

        /* ── Responsive ── */
        @media (max-width: 700px) {
          .spd-summary-grid { grid-template-columns: 1fr 1fr; }
          .spd-toolbar { flex-direction: column; align-items: stretch; }
          .spd-toolbar-title { margin-right: 0; }
          .spd-row { grid-template-columns: 1fr; }
          .spd-pay-options { grid-template-columns: repeat(2,1fr); }
          .spd-summary-grid .spd-summary-card:last-child { grid-column: 1/-1; }
        }
      `}</style>

      <div className="spd-shell">

        {/* ── Toolbar ── */}
        <div className="spd-toolbar">
          <div className="spd-toolbar-title">
            <Receipt size={20} />
            Spendings
          </div>

          <div className="spd-field">
            <span className="spd-field-label">From</span>
            <input
              type="date"
              className="spd-input"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
            />
          </div>
          <div className="spd-field">
            <span className="spd-field-label">To</span>
            <input
              type="date"
              className="spd-input"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
            />
          </div>
          <div className="spd-field">
            <span className="spd-field-label">Category</span>
            <select
              className="spd-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="spd-field">
            <span className="spd-field-label">Search</span>
            <div className="spd-search-wrap">
              <Search size={15} />
              <input
                type="text"
                className="spd-input"
                placeholder="Search…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <button onClick={() => { setError(""); setShowForm(true); }} className="spd-add-btn">
            <Plus size={16} /> Add Spending
          </button>
        </div>

        {/* ── Summary ── */}
        <div className="spd-summary-grid">
          <div className="spd-summary-card">
            <div className="spd-summary-icon spend"><IndianRupee size={21} /></div>
            <div>
              <div className="spd-summary-label">Total Spent</div>
              <div className="spd-summary-value">₹{totalSpending.toFixed(2)}</div>
            </div>
          </div>
          <div className="spd-summary-card">
            <div className="spd-summary-icon count"><Calendar size={21} /></div>
            <div>
              <div className="spd-summary-label">Entries</div>
              <div className="spd-summary-value">{filteredSpendings.length}</div>
            </div>
          </div>
          <div className="spd-summary-card">
            <div className="spd-summary-icon avg"><DollarSign size={21} /></div>
            <div>
              <div className="spd-summary-label">Average</div>
              <div className="spd-summary-value">
                ₹{filteredSpendings.length > 0
                  ? (totalSpending / filteredSpendings.length).toFixed(2)
                  : "0.00"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Form Modal ── */}
        {showForm && (
          <div
            className="spd-overlay"
            onClick={resetForm}
          >
            <div
              className="spd-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="spd-drawer-header">
                <h2>
                  <DollarSign size={18} />
                  {editingSpending ? "Edit Spending" : "New Spending"}
                </h2>
                <button className="spd-close-btn" onClick={resetForm}>
                  <X size={17} />
                </button>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <div className="spd-drawer-body">
                  {error && <div className="spd-error">{error}</div>}

                  {/* ── Details section ── */}
                  <div>
                    <div className="spd-section-label">
                      <FileText size={12} /> Expense Details
                    </div>
                    <div className="spd-fgroup" style={{ marginBottom: "0.85rem" }}>
                      <label>Description <span className="req">*</span></label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="What was this expense for?"
                        autoFocus
                      />
                    </div>

                    <div className="spd-row">
                      <div className="spd-fgroup">
                        <label>Amount (₹) <span className="req">*</span></label>
                        <div className="spd-amount-wrap">
                          <IndianRupee size={15} />
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={formData.amount}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, amount: e.target.value }))
                            }
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="spd-fgroup">
                        <label>Date <span className="req">*</span></label>
                        <input
                          type="date"
                          value={formData.spendingDate}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, spendingDate: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Category section ── */}
                  <div>
                    <div className="spd-section-label">
                      <Tag size={12} /> Category <span className="req" style={{ fontSize: "0.65rem" }}>*</span>
                    </div>
                    <div className="spd-cat-chips">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={`spd-cat-chip${formData.category === cat ? " active" : ""}`}
                          onClick={() => handleCategoryChip(cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="spd-fgroup" style={{ marginTop: "0.7rem" }}>
                      <label style={{ fontSize: "0.72rem", color: "#94837a" }}>
                        Or type a custom category
                      </label>
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => {
                          setCustomCategory(e.target.value);
                          setFormData((prev) => ({ ...prev, category: e.target.value }));
                        }}
                        placeholder="Enter custom category…"
                      />
                    </div>
                    {formData.category && (
                      <div style={{
                        marginTop: "0.4rem", fontSize: "0.76rem", color: "#57504a",
                        display: "flex", alignItems: "center", gap: "0.3rem"
                      }}>
                        <Tag size={12} style={{ color: "#b6412c" }} />
                        Selected: <strong>{formData.category}</strong>
                      </div>
                    )}
                  </div>

                  {/* ── Payment section ── */}
                  <div>
                    <div className="spd-section-label">
                      <CreditCard size={12} /> Payment Method
                    </div>
                    <div className="spd-pay-options">
                      {[
                        { value: "cash", label: "Cash", icon: "💵" },
                        { value: "upi",  label: "UPI",  icon: "📱" },
                        { value: "card", label: "Card", icon: "💳" },
                        { value: "bank_transfer", label: "Bank", icon: "🏦" },
                      ].map((opt) => (
                        <div className="spd-pay-option" key={opt.value}>
                          <input
                            type="radio"
                            id={`pm-${opt.value}`}
                            name="paymentMethod"
                            value={opt.value}
                            checked={formData.paymentMethod === opt.value}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))
                            }
                          />
                          <label htmlFor={`pm-${opt.value}`}>
                            <span className="pay-icon">{opt.icon}</span>
                            {opt.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Notes ── */}
                  <div className="spd-fgroup">
                    <label>Notes <span style={{ color: "#94837a", fontSize: "0.72rem" }}>(optional)</span></label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Any additional details…"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="spd-drawer-footer">
                  <button type="button" className="spd-btn-cancel" onClick={resetForm}>
                    Cancel
                  </button>
                  <button type="submit" className="spd-btn-submit" disabled={submitting}>
                    {submitting
                      ? "Saving…"
                      : editingSpending
                      ? "Update Spending"
                      : "Add Spending"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Spendings table ── */}
        <div className="spd-panel">
          <div className="spd-panel-header">
            <span>Spending Records</span>
            <span style={{ color: "#b6412c" }}>{filteredSpendings.length} entries</span>
          </div>
          {loading ? (
            <div className="spd-empty-state">Loading…</div>
          ) : (
            <div className="spd-table-wrap">
              <table className="spd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpendings.map((spending) => (
                    <tr key={spending.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatDate(spending.spending_date)}
                      </td>
                      <td>{spending.description}</td>
                      <td>
                        <span className="spd-category-tag">{spending.category}</span>
                      </td>
                      <td className="amount">
                        ₹{Number(spending.amount).toFixed(2)}
                      </td>
                      <td>
                        <span className={`spd-pay-chip ${spending.payment_method}`}>
                          {paymentLabel(spending.payment_method)}
                        </span>
                      </td>
                      <td style={{ color: "#94837a", fontSize: "0.82rem" }}>
                        {spending.notes || "—"}
                      </td>
                      <td>
                        <div className="spd-action-buttons">
                          <button
                            onClick={() => handleEdit(spending)}
                            className="spd-icon-btn"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(spending.id)}
                            className="spd-icon-btn danger"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredSpendings.length === 0 && (
                <div className="spd-empty-state">
                  <Receipt size={38} />
                  <h3>No spendings found</h3>
                  <p>
                    {searchTerm || selectedCategory
                      ? "Try adjusting your filters."
                      : "Click \"Add Spending\" to record your first expense."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Spendings;
