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
} from "lucide-react";

const Spendings = () => {
  const [spendings, setSpendings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSpending, setEditingSpending] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: getLocalDateString(),
    end: getLocalDateString(),
  });

  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: "",
    spendingDate: getLocalDateTimeString(new Date()),
    paymentMethod: "cash",
    notes: "",
  });

  const loadSpendings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbService.getSpendings(dateRange);
      setSpendings(data);
    } catch (error) {
      // Failed to load spendings
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadSpendings();
    loadCategories();
  }, [loadSpendings]);


  const loadCategories = async () => {
    try {
      const data = await dbService.getSpendingCategories();
      setCategories(data);
    } catch (error) {
      // Failed to load categories
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSpending) {
        await dbService.updateSpending(editingSpending.id, formData);
      } else {
        await dbService.addSpending(formData);
      }

      resetForm();
      loadSpendings();
    } catch (error) {
      // Failed to save spending
    }
  };

  const handleEdit = (spending) => {
    setEditingSpending(spending);
    setFormData({
      description: spending.description,
      amount: spending.amount.toString(),
      category: spending.category,
      spendingDate: spending.spending_date,
      paymentMethod: spending.payment_method,
      notes: spending.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this spending?")) {
      try {
        await dbService.deleteSpending(id);
        loadSpendings();
      } catch (error) {
        // Failed to delete spending
      }
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      category: "",
      spendingDate: getLocalDateTimeString(new Date()),
      paymentMethod: "cash",
      notes: "",
    });
    setEditingSpending(null);
    setShowForm(false);
  };

  const filteredSpendings = spendings.filter((spending) => {
    const matchesSearch =
      spending.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      spending.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      !selectedCategory || spending.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalSpending = filteredSpendings.reduce(
    (sum, spending) => sum + spending.amount,
    0
  );

  const formatDate = (dateString) => {
    // Parse YYYY-MM-DD HH:mm:ss as local time
    if (!dateString) return "-";
    const [datePart] = dateString.split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    return `${String(day).padStart(2, "0")}/${String(month).padStart(
      2,
      "0"
    )}/${year}`;
  };

  return (
    <div className="spd-root">
      <style>{`
        .spd-root {
          min-height: 100vh;
          padding: 1.5rem 1.5rem 3rem;
          background: linear-gradient(180deg, #fdfbf9 0%, #fff7f2 40%, #f8fafc 100%);
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          color: #1e293b;
        }
        .spd-shell { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }

        .spd-toolbar {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.9rem;
        }
        .spd-search-field { flex: 1 1 220px; display: flex; flex-direction: column; gap: 0.35rem; }
        .spd-field { display: flex; flex-direction: column; gap: 0.35rem; min-width: 150px; }
        .spd-field-label { font-size: 0.7rem; font-weight: 700; color: #94837a; text-transform: uppercase; letter-spacing: 0.07em; }
        .spd-input, .spd-select {
          border: 1px solid #e6ded3;
          border-radius: 12px;
          padding: 0.6rem 0.7rem;
          font-size: 0.88rem;
          color: #221f1a;
          background: #fdfbf7;
          font-family: inherit;
        }
        .spd-input:focus, .spd-select:focus { outline: none; border-color: #b6412c; background: #fff; }
        .spd-search-wrap { position: relative; display: flex; align-items: center; }
        .spd-search-wrap svg { position: absolute; left: 12px; color: #b3a89c; }
        .spd-search-wrap input { padding-left: 36px; width: 100%; }

        .spd-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1.1rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          color: #fff;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(182, 65, 44, 0.25);
          white-space: nowrap;
        }
        .spd-add-btn:hover { filter: brightness(1.05); }

        .spd-summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
        .spd-summary-card {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          padding: 1.2rem 1.3rem;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .spd-summary-icon {
          width: 46px; height: 46px; border-radius: 13px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(182, 65, 44, 0.1); color: #b6412c;
          flex-shrink: 0;
        }
        .spd-summary-icon.entries { background: rgba(15, 23, 42, 0.06); color: #334155; }
        .spd-summary-label { font-size: 0.74rem; font-weight: 800; color: #94837a; text-transform: uppercase; letter-spacing: 0.08em; }
        .spd-summary-value { margin-top: 0.3rem; font-size: 1.55rem; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }

        .spd-panel {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
          overflow: hidden;
        }
        .spd-table-wrap { overflow-x: auto; }
        .spd-table { width: 100%; border-collapse: collapse; min-width: 720px; }
        .spd-table thead th {
          text-align: left;
          padding: 0.8rem 1.1rem;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #94837a;
          background: #fdfbf7;
          border-bottom: 1px solid #f1ebe1;
          white-space: nowrap;
        }
        .spd-table tbody td {
          padding: 0.85rem 1.1rem;
          font-size: 0.86rem;
          color: #3a342e;
          border-bottom: 1px solid #f5f0e9;
          vertical-align: middle;
        }
        .spd-table tbody tr:hover { background: #fffaf6; }
        .spd-table tbody tr:last-child td { border-bottom: none; }
        .spd-table td.amount { font-weight: 700; color: #b91c1c; }

        .spd-category-tag {
          background: rgba(182, 65, 44, 0.1); color: #b6412c;
          font-size: 0.74rem; font-weight: 700; padding: 0.28rem 0.65rem; border-radius: 999px;
        }
        .spd-pay-chip {
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          font-size: 0.7rem;
          display: inline-block;
          background: rgba(39, 174, 96, 0.12); color: #1f9c54;
        }
        .spd-pay-chip.upi { background: rgba(102, 126, 234, 0.12); color: #5a64c4; }
        .spd-pay-chip.card { background: rgba(168, 85, 247, 0.12); color: #9333ea; }
        .spd-pay-chip.bank_transfer { background: rgba(245, 158, 11, 0.12); color: #b45309; }

        .spd-action-buttons { display: flex; gap: 0.4rem; }
        .spd-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 9px;
          border: 1px solid #e6ded3; background: #fdfbf7; color: #57504a; cursor: pointer;
        }
        .spd-icon-btn:hover { background: #f1ebe1; }
        .spd-icon-btn.danger { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
        .spd-icon-btn.danger:hover { background: #fee2e2; }

        .spd-empty-state { text-align: center; padding: 3.5rem 1rem; color: #94837a; }
        .spd-empty-state svg { color: #d9cdbf; margin-bottom: 0.8rem; }
        .spd-empty-state h3 { margin: 0 0 0.3rem; font-size: 1rem; color: #57504a; }
        .spd-empty-state p { margin: 0; font-size: 0.85rem; }

        /* Modal */
        .spd-modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }
        .spd-modal {
          background: #fff; border-radius: 20px; width: 100%; max-width: 560px;
          max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 30px 70px rgba(15, 23, 42, 0.25);
        }
        .spd-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.2rem 1.4rem;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          color: #fff;
        }
        .spd-modal-header h2 { margin: 0; font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 0.6rem; }
        .spd-modal-close {
          background: rgba(255,255,255,0.18); border: none; color: #fff;
          width: 32px; height: 32px; border-radius: 9px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .spd-modal-close:hover { background: rgba(255,255,255,0.3); }
        .spd-modal-body { padding: 1.4rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.3rem; }
        .spd-form-section-title {
          font-size: 0.72rem; font-weight: 800; color: #b6412c;
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .spd-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
        .spd-form-group { display: flex; flex-direction: column; gap: 0.4rem; }
        .spd-form-group label { font-size: 0.78rem; font-weight: 700; color: #57504a; }
        .spd-form-group label.required::after { content: ' *'; color: #b6412c; }
        .spd-form-group input, .spd-form-group select, .spd-form-group textarea {
          border: 1px solid #e6ded3; border-radius: 12px; padding: 0.65rem 0.8rem;
          font-size: 0.9rem; color: #221f1a; background: #fdfbf7; font-family: inherit;
        }
        .spd-form-group input:focus, .spd-form-group select:focus, .spd-form-group textarea:focus {
          outline: none; border-color: #b6412c; background: #fff;
        }
        .spd-form-group textarea { resize: vertical; }
        .spd-modal-actions {
          display: flex; justify-content: flex-end; gap: 0.7rem;
          padding: 1.1rem 1.4rem; border-top: 1px solid #f1ebe1; background: #fdfbf7;
        }
        .spd-btn-cancel {
          padding: 0.65rem 1.2rem; border-radius: 12px; border: 1px solid #e6ded3;
          background: #fff; color: #57504a; font-weight: 700; font-size: 0.86rem; cursor: pointer;
        }
        .spd-btn-cancel:hover { background: #f7f3ed; }
        .spd-btn-submit {
          padding: 0.65rem 1.3rem; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%); color: #fff;
          font-weight: 700; font-size: 0.86rem; cursor: pointer;
          box-shadow: 0 8px 18px rgba(182, 65, 44, 0.25);
        }
        .spd-btn-submit:hover { filter: brightness(1.05); }

        @media (max-width: 760px) {
          .spd-summary-grid { grid-template-columns: 1fr; }
          .spd-toolbar { flex-direction: column; align-items: stretch; }
          .spd-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="spd-shell">
        {/* Toolbar */}
        <div className="spd-toolbar">
          <div className="spd-search-field">
            <span className="spd-field-label">Search</span>
            <div className="spd-search-wrap">
              <Search size={16} />
              <input
                type="text"
                className="spd-input"
                placeholder="Search spendings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="spd-field">
            <span className="spd-field-label">Start Date</span>
            <input
              type="date"
              className="spd-input"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
            />
          </div>
          <div className="spd-field">
            <span className="spd-field-label">End Date</span>
            <input
              type="date"
              className="spd-input"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
            />
          </div>
          <div className="spd-field">
            <span className="spd-field-label">Category</span>
            <select
              className="spd-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <button onClick={() => setShowForm(true)} className="spd-add-btn">
            <Plus size={16} />
            Add Spending
          </button>
        </div>

        {/* Summary */}
        <div className="spd-summary-grid">
          <div className="spd-summary-card">
            <div className="spd-summary-icon"><DollarSign size={22} /></div>
            <div>
              <div className="spd-summary-label">Total Spending</div>
              <div className="spd-summary-value">₹{totalSpending.toFixed(2)}</div>
            </div>
          </div>
          <div className="spd-summary-card">
            <div className="spd-summary-icon entries"><Calendar size={22} /></div>
            <div>
              <div className="spd-summary-label">Total Entries</div>
              <div className="spd-summary-value">{filteredSpendings.length}</div>
            </div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="spd-modal-overlay" onClick={resetForm}>
            <div className="spd-modal" onClick={(e) => e.stopPropagation()}>
              <div className="spd-modal-header">
                <h2><DollarSign size={20} />{editingSpending ? "Edit Spending" : "Add New Spending"}</h2>
                <button onClick={resetForm} className="spd-modal-close"><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="spd-modal-body">
                  <div>
                    <div className="spd-form-section-title"><Receipt size={13} />Spending Details</div>
                    <div className="spd-form-grid">
                      <div className="spd-form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="required">Description</label>
                        <input
                          type="text"
                          value={formData.description}
                          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="What was this expense for?"
                          required
                        />
                      </div>
                      <div className="spd-form-group">
                        <label className="required">Amount (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.amount}
                          onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="spd-form-group">
                        <label className="required">Date</label>
                        <input
                          type="date"
                          value={formData.spendingDate}
                          onChange={(e) => setFormData((prev) => ({ ...prev, spendingDate: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="spd-form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="required">Category</label>
                        <input
                          type="text"
                          value={formData.category}
                          onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                          list="categories"
                          placeholder="Select or enter category"
                          required
                        />
                        <datalist id="categories">
                          {categories.map((category) => (
                            <option key={category} value={category} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="spd-form-section-title"><CreditCard size={13} />Payment Information</div>
                    <div className="spd-form-grid">
                      <div className="spd-form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Payment Method</label>
                        <select
                          value={formData.paymentMethod}
                          onChange={(e) => setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="upi">UPI</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </select>
                      </div>
                      <div className="spd-form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Notes</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                          rows="3"
                          placeholder="Additional notes (optional)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="spd-modal-actions">
                  <button type="button" onClick={resetForm} className="spd-btn-cancel">Cancel</button>
                  <button type="submit" className="spd-btn-submit">{editingSpending ? "Update" : "Add"} Spending</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Spendings List */}
        <div className="spd-panel">
          {loading ? (
            <div className="spd-empty-state">Loading spendings…</div>
          ) : (
            <div className="spd-table-wrap">
              <table className="spd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpendings.map((spending) => (
                    <tr key={spending.id}>
                      <td>{formatDate(spending.spending_date)}</td>
                      <td>{spending.description}</td>
                      <td><span className="spd-category-tag">{spending.category}</span></td>
                      <td className="amount">₹{spending.amount.toFixed(2)}</td>
                      <td>
                        <span className={`spd-pay-chip ${spending.payment_method}`}>
                          {spending.payment_method.replace("_", " ").toUpperCase()}
                        </span>
                      </td>
                      <td>{spending.notes || "-"}</td>
                      <td>
                        <div className="spd-action-buttons">
                          <button onClick={() => handleEdit(spending)} className="spd-icon-btn" title="Edit">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => handleDelete(spending.id)} className="spd-icon-btn danger" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSpendings.length === 0 && (
                <div className="spd-empty-state">
                  <DollarSign size={40} />
                  <h3>No spendings found</h3>
                  <p>Add your first spending entry to get started.</p>
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

// Helper to get local date and time in YYYY-MM-DD HH:mm:ss
function getLocalDateTimeString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Helper to get local date in YYYY-MM-DD
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
