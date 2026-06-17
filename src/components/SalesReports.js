import { dbService } from "../services/dbService";
import React, { useState, useEffect, useCallback } from "react";
import { BarChart3, Mail, DollarSign, FileText, X, Download, Eye } from "lucide-react";
import { 
  getLocalDateString,
  formatDateForDisplay,
  getStartOfDay,
  getEndOfDay
} from "../utils/dateUtils";

const SalesReports = () => {
  const [sales, setSales] = useState([]);
  const [spendings, setSpendings] = useState([]);
  const [counterBalances, setCounterBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billGenerating, setBillGenerating] = useState(false);

  const normalizeSales = (salesList) => {
    if (!salesList) return [];
    return salesList.map(sale => {
      const saleNumber = sale.saleNumber || sale.sale_number || "";
      const saleType = sale.saleType || sale.sale_type || "parcel";
      const tableNumber = sale.tableNumber || sale.table_number || null;
      const customerName = sale.customerName || sale.customer_name || "Walk-in Customer";
      const customerPhone = sale.customerPhone || sale.customer_phone || "";
      const saleDate = sale.saleDate || sale.sale_date || "";
      const paymentMethod = sale.paymentMethod || sale.payment_method || "Cash";
      const subtotal = sale.subtotal !== undefined ? sale.subtotal : (sale.subtotal_price || 0);
      const taxAmount = sale.taxAmount !== undefined ? sale.taxAmount : (sale.tax_amount || 0);
      const discountAmount = sale.discountAmount !== undefined ? sale.discountAmount : (sale.discount_amount || 0);
      const totalAmount = sale.totalAmount !== undefined ? sale.totalAmount : (sale.total_amount || 0);

      let itemCount = sale.item_count;
      if (itemCount === undefined) {
        itemCount = sale.items ? sale.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
      }

      const totalCostPrice = sale.total_cost_price !== undefined ? sale.total_cost_price : 0;
      const totalSalePrice = sale.total_sale_price !== undefined ? sale.total_sale_price : totalAmount;
      const profit = sale.profit !== undefined ? sale.profit : (totalSalePrice - totalCostPrice);

      return {
        ...sale,
        sale_number: saleNumber,
        sale_type: saleType,
        table_number: tableNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        sale_date: saleDate,
        payment_method: paymentMethod,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        item_count: itemCount,
        total_cost_price: totalCostPrice,
        total_sale_price: totalSalePrice,
        profit: profit,

        saleNumber,
        saleType,
        tableNumber,
        customerName,
        customerPhone,
        saleDate,
        paymentMethod,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
      };
    });
  };

  const normalizeSpendings = (spendingsList) => {
    if (!spendingsList) return [];
    return spendingsList.map(s => ({
      ...s,
      spending_date: s.spending_date || s.spendingDate || "",
      payment_method: s.payment_method || s.paymentMethod || "cash",
      amount: s.amount !== undefined ? Number(s.amount) : 0
    }));
  };

  const normalizeCounterBalances = (balancesList) => {
    if (!balancesList) return [];
    return balancesList.map(b => ({
      ...b,
      balance_date: b.balance_date || b.balanceDate || "",
      opening_balance: b.opening_balance !== undefined ? Number(b.opening_balance) : (b.openingBalance ? Number(b.openingBalance) : 0),
      closing_balance: b.closing_balance !== undefined ? Number(b.closing_balance) : (b.closingBalance ? Number(b.closingBalance) : 0),
    }));
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Create proper date range with start/end times for the selected date
      // Load sales data with details (cost price, sale price, profit)
      const salesData = await dbService.getSalesWithDetails({
        start: getStartOfDay(selectedDate),
        end: getEndOfDay(selectedDate),
      });
      if (salesData) {
        salesData.sort((a, b) => new Date(b.saleDate || b.sale_date) - new Date(a.saleDate || a.sale_date));
      }
      setSales(normalizeSales(salesData));

      // Load spendings data
      const spendingsData = await dbService.getSpendings({
        start: getStartOfDay(selectedDate),
        end: getEndOfDay(selectedDate),
      });
      setSpendings(normalizeSpendings(spendingsData));

      // Load counter balance data
      const counterBalanceData = await dbService.getCounterBalances({
        start: getStartOfDay(selectedDate),
        end: getEndOfDay(selectedDate),
      });
      setCounterBalances(normalizeCounterBalances(counterBalanceData));
    } catch (error) {
      // Failed to load reports data
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };

  const sendEmailReport = async () => {
    try {
      setEmailLoading(true);
      const result = await dbService.sendEmailReportWithPdfs(selectedDate);
      if (result.success) {
        alert("Email report with PDF attachments sent successfully!");
      } else {
        alert(`Failed to send email report: ${result.error}`);
      }
    } catch (error) {
      alert("Failed to send email report");
    } finally {
      setEmailLoading(false);
    }
  };

  const exportSalesReportPDF = async () => {
    try {
      const result = await dbService.exportSalesReport(sales, selectedDate);
      if (result.success) {
        alert(`PDF saved at ${result.filePath}`);
      } else {
        alert('Failed to save PDF: ' + result.error);
      }
    } catch (error) {
      alert('Failed to export PDF');
    }
  };

  const exportFinancialReportPDF = async () => {
    try {
      const reportData = {
        sales,
        spendings,
        counterBalances,
        totalRevenue,
        totalSpendings,
        netIncome,
        totalOpeningBalance,
        totalBalance
      };
      const result = await dbService.exportFinancialReport(reportData, selectedDate);
      if (result.success) {
        alert(`PDF saved at ${result.filePath}`);
      } else {
        alert('Failed to save PDF: ' + result.error);
      }
    } catch (error) {
      alert('Failed to export PDF');
    }
  };

  // Calculate totals
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0);
  const totalSpendings = spendings.reduce(
    (sum, spending) => sum + spending.amount,
    0
  );
  const netIncome = totalRevenue - totalSpendings;
  const totalTransactions = sales.length;
  const totalSpendingEntries = spendings.length;

  // Calculate opening balance totals
  const totalOpeningBalance = counterBalances.reduce(
    (sum, balance) => sum + balance.opening_balance,
    0
  );

  // Calculate total balance (net income + opening balance)
  const totalBalance = netIncome + totalOpeningBalance;

  // Handle viewing individual bill
  const handleViewBill = async (sale) => {
    try {
      // Get detailed sale data with items
      const saleWithItems = await dbService.getSaleWithItems(sale.id);
      
      if (!saleWithItems) {
        alert('Sale data not found');
        return;
      }
      
      // Get bar settings for formatting the bill
      const barSettings = await dbService.getBarSettings();
      
      // Format the sale data for bill generation and preview
      const billData = {
        saleNumber: saleWithItems.sale_number,
        saleType: saleWithItems.sale_type || 'parcel',
        tableNumber: saleWithItems.table_number || null,
        customerName: saleWithItems.customer_name || 'Walk-in Customer',
        customerPhone: saleWithItems.customer_phone || '',
        items: saleWithItems.items || [],
        subtotal: saleWithItems.total_amount - (saleWithItems.tax_amount || 0) + (saleWithItems.discount_amount || 0),
        taxAmount: saleWithItems.tax_amount || 0,
        discountAmount: saleWithItems.discount_amount || 0,
        totalAmount: saleWithItems.total_amount,
        paymentMethod: saleWithItems.payment_method || 'Cash',
        saleDate: saleWithItems.sale_date,
        barSettings: barSettings,
      };
      
      setSelectedBill(billData);
      setShowBillModal(true);
    } catch (error) {
      // Failed to load bill data
      alert('Failed to load bill data');
    }
  };

  // Handle saving bill as PDF
  const handleSaveBillPDF = async () => {
    if (!selectedBill) return;
    
    setBillGenerating(true);
    try {
      const result = await dbService.exportPDF(selectedBill);
      if (result.success) {
        alert(`Bill PDF saved to: ${result.filePath}`);
      } else {
        alert(`Failed to save PDF: ${result.error}`);
      }
    } catch (error) {
      // Failed to generate PDF
      alert('Failed to generate PDF');
    } finally {
      setBillGenerating(false);
    }
  };

  // Close bill modal
  const closeBillModal = () => {
    setSelectedBill(null);
    setShowBillModal(false);
  };

  return (
    <div className="sales-reports">
      <div className="page-header">
        <h1>
          <BarChart3 size={24} /> Sales & Financial Reports
        </h1>
        <button
          onClick={sendEmailReport}
          disabled={emailLoading}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <Mail size={16} />
          {emailLoading ? "Sending..." : "Email Report with PDFs"}
        </button>
      </div>

      {/* Date Selection */}
      <div className="form-row" style={{ padding: "20px 30px" }}>
        <div className="form-group">
          <label>
            Select Date:
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="form-input"
            />
          </label>
        </div>
        <button
          onClick={loadData}
          className="btn btn-primary"
          style={{ marginLeft: "15px", alignSelf: "flex-end" }}
        >
          Generate Report
        </button>
        <button
          onClick={exportSalesReportPDF}
          className="btn btn-secondary"
          style={{ marginLeft: "10px", alignSelf: "flex-end" }}
          disabled={sales.length === 0}
        >
          Export Sales PDF
        </button>
        <button
          onClick={exportFinancialReportPDF}
          className="btn btn-secondary"
          style={{ marginLeft: "10px", alignSelf: "flex-end" }}
          disabled={sales.length === 0 && spendings.length === 0}
        >
          Export Financial PDF
        </button>
      </div>

      {/* Financial Summary */}
      <div className="summary-cards" style={{ margin: "0 30px 20px 30px" }}>
        <div className="summary-card">
          <div className="card-icon">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <h3>Total Revenue</h3>
            <p className="amount">₹{totalRevenue.toFixed(2)}</p>
            <small>{totalTransactions} transactions</small>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <DollarSign size={24} />
          </div>
          <div className="card-content">
            <h3>Total Spendings</h3>
            <p className="amount">₹{totalSpendings.toFixed(2)}</p>
            <small>{totalSpendingEntries} entries</small>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <h3>Net Income</h3>
            <p className={`amount ${netIncome >= 0 ? "positive" : "negative"}`}>
              ₹{netIncome.toFixed(2)}
            </p>
            <small>{netIncome >= 0 ? "Profit" : "Loss"}</small>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <DollarSign size={24} />
          </div>
          <div className="card-content">
            <h3>Opening Balance</h3>
            <p className="amount">₹{totalOpeningBalance.toFixed(2)}</p>
            <small>Total opening balances</small>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <BarChart3 size={24} />
          </div>
          <div className="card-content">
            <h3>Total Balance</h3>
            <p
              className={`amount ${
                totalBalance >= 0 ? "positive" : "negative"
              }`}
            >
              ₹{totalBalance.toFixed(2)}
            </p>
            <small>Net Income + Opening Balance</small>
          </div>
        </div>
      </div>

      {/* Sales Reports Table */}
      <div className="table-container">
        <h3 style={{ margin: "0 30px 20px 30px" }}>Sales Details</h3>
        <table>
          <thead>
            <tr>
              <th>Sale Number</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Date</th>
              <th>Bill</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              <tr>
                <td
                  colSpan="10"
                  style={{ textAlign: "center", padding: "40px" }}
                >
                  Loading...
                </td>
              </tr>
            </tbody>
          ) : sales.length === 0 ? (
            <tbody>
              <tr>
                <td
                  colSpan="10"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "#7f8c8d",
                  }}
                >
                  No sales found for the selected date
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.sale_number}</td>
                  <td>{sale.customer_name || "Walk-in Customer"}</td>
                  <td>{sale.item_count}</td>
                  <td>₹{(sale.total_sale_price || sale.total_amount).toFixed(2)}</td>
                  <td>
                    <span
                      style={{
                        textTransform: "uppercase",
                        fontWeight: "600",
                        letterSpacing: "0.5px",
                        background: (sale.payment_method || sale.paymentMethod) === "upi" ? "rgba(102, 126, 234, 0.15)" : "rgba(39, 174, 96, 0.15)",
                        color: (sale.payment_method || sale.paymentMethod) === "upi" ? "#667eea" : "#27ae60",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "0.75rem",
                      }}
                    >
                      {sale.payment_method || sale.paymentMethod || "cash"}
                    </span>
                  </td>
                  <td>{formatDate(sale.sale_date)}</td>
                  <td>
<button onClick={() => handleViewBill(sale)} className="btn btn-secondary" aria-label="View Bill">
  <Eye size={16} />
</button>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {/* Spendings Table */}
      {spendings.length > 0 && (
        <div className="table-container" style={{ marginTop: "30px" }}>
          <h3 style={{ margin: "0 30px 20px 30px" }}>Spendings Details</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {spendings.map((spending) => (
                <tr key={spending.id}>
                  <td>{formatDate(spending.spending_date)}</td>
                  <td>{spending.description}</td>
                  <td>
                    <span className="category-tag">{spending.category}</span>
                  </td>
                  <td>₹{spending.amount.toFixed(2)}</td>
                  <td>
                    <span
                      className={`payment-method ${spending.payment_method}`}
                    >
                      {spending.payment_method.replace("_", " ").toUpperCase()}
                    </span>
                  </td>
                  <td>{spending.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Opening Balance Table */}
      {counterBalances.length > 0 && (
        <div className="table-container" style={{ marginTop: "30px" }}>
          <h3 style={{ margin: "0 30px 20px 30px" }}>
            Opening Balance Details
          </h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Opening Balance</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {counterBalances.map((balance) => (
                <tr key={balance.id}>
                  <td>{formatDate(balance.balance_date)}</td>
                  <td>₹{balance.opening_balance.toFixed(2)}</td>
                  <td>{balance.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Bill Preview Modal */}
      {showBillModal && selectedBill && (
        <div className="modal-overlay" onClick={closeBillModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <FileText size={20} />
                Bill Preview - {selectedBill.saleNumber}
              </h3>
              <button onClick={closeBillModal} className="close-btn">
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="bill-preview" style={{ fontFamily: "monospace", padding: "10px", background: "#fff", color: "#000", maxWidth: "400px", margin: "0 auto", border: "1px solid #eee", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                {/* Professional Bill Header */}
                <div className="bill-header" style={{ textAlign: "center", marginBottom: "15px" }}>
                  <h2 style={{ margin: "0 0 8px 0", fontSize: "1.4rem", textTransform: "uppercase" }}>{selectedBill.barSettings?.bar_name || 'CounterFlow POS'}</h2>
                  {selectedBill.barSettings?.address && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#333" }}>{selectedBill.barSettings.address}</p>
                  )}
                  {selectedBill.barSettings?.contact_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#333" }}>Ph: {selectedBill.barSettings.contact_number}</p>
                  )}
                  {selectedBill.barSettings?.gst_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#333" }}>GSTIN: {selectedBill.barSettings.gst_number}</p>
                  )}
                  <h3 style={{ margin: "15px 0 5px 0", fontSize: "1.1rem", textDecoration: "underline" }}>TAX INVOICE</h3>
                </div>
                
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />
                
                {/* Bill Details */}
                <div className="bill-details">
                  <div className="bill-info-row">
                    <div>
                      <strong>Bill No:</strong> {selectedBill.saleNumber}
                    </div>
                    <div>
                      <strong>Date:</strong> {formatDate(selectedBill.saleDate)}
                    </div>
                  </div>
                  
                  <div className="bill-info-row">
                    <div>
                      <strong>Type:</strong> {selectedBill.saleType === 'table' ? 'Table' : 'Parcel'}
                      {selectedBill.tableNumber && ` - Table ${selectedBill.tableNumber}`}
                    </div>
                    <div>
                      <strong>Payment:</strong> {selectedBill.paymentMethod?.toUpperCase()}
                    </div>
                  </div>
                  
                  {selectedBill.customerName && selectedBill.customerName !== 'Walk-in Customer' && (
                    <div className="bill-info-row">
                      <div>
                        <strong>Customer:</strong> {selectedBill.customerName}
                      </div>
                      {selectedBill.customerPhone && (
                        <div>
                          <strong>Phone:</strong> {selectedBill.customerPhone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />
                
                {/* Items Table */}
                <div className="bill-items" style={{ margin: "15px 0" }}>
                  <table className="bill-items-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px dashed #000" }}>
                        <th style={{ textAlign: "left", padding: "5px 0" }}>Item</th>
                        <th style={{ textAlign: "center", padding: "5px 0" }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "5px 0" }}>Rate</th>
                        <th style={{ textAlign: "right", padding: "5px 0" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBill.items?.map((item, index) => (
                        <tr key={index}>
                          <td style={{ textAlign: "left", padding: "3px 0" }}>{item.name}</td>
                          <td style={{ textAlign: "center", padding: "3px 0" }}>{item.quantity}</td>
                          <td style={{ textAlign: "right", padding: "3px 0" }}>{item.unitPrice?.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "3px 0" }}>{(item.totalPrice || (item.price * item.quantity))?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />
                
                {/* Bill Summary */}
                <div className="bill-summary" style={{ fontSize: "1rem" }}>
                  <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                    <span>Subtotal:</span>
                    <span>{selectedBill.subtotal?.toFixed(2)}</span>
                  </div>
                  
                  {selectedBill.discountAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                      <span>Discount:</span>
                      <span>-{selectedBill.discountAmount?.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {selectedBill.taxAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "3px 0" }}>
                      <span>Tax:</span>
                      <span>{selectedBill.taxAmount?.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="summary-row total" style={{ display: "flex", justifyContent: "space-between", margin: "10px 0 0 0", fontSize: "1.2rem", fontWeight: "bold" }}>
                    <span>Total:</span>
                    <span>{selectedBill.totalAmount?.toFixed(2)}</span>
                  </div>
                </div>
                
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />
                <div style={{ textAlign: "center", margin: "15px 0 5px 0", fontSize: "1rem", fontWeight: "bold" }}>
                  {selectedBill.barSettings?.thank_you_message || "Thank you for visiting!"}
                </div>
                
              </div>
            </div>
            
            <div className="modal-actions">
              <button onClick={closeBillModal} className="btn btn-secondary">
                Close
              </button>
              <button 
                onClick={handleSaveBillPDF} 
                disabled={billGenerating}
                className="btn btn-primary"
              >
                <Download size={16} />
                {billGenerating ? 'Generating...' : 'Save as PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReports;
