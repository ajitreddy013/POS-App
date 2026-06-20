import { dbService } from "../services/dbService";
import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capawesome-team/capacitor-file-opener";
import { BarChart3, Mail, DollarSign, FileText, X, Download, Eye, ChevronDown } from "lucide-react";
import { 
  getLocalDateString,
  formatDateForDisplay,
  getStartOfDay,
  getEndOfDay,
  formatDateToYMD,
  getPreviousDay
} from "../utils/dateUtils";
import useBarSettings from "../utils/useBarSettings";

const SalesReports = () => {
  const { barSettings } = useBarSettings();
  const [sales, setSales] = useState([]);
  const [spendings, setSpendings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailLoading, setEmailLoading] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState(getLocalDateString());

  const handlePresetSelect = (preset) => {
    const todayStr = getLocalDateString();
    let start = todayStr;
    let end = todayStr;

    if (preset === "today") {
      start = todayStr;
      end = todayStr;
    } else if (preset === "yesterday") {
      const yst = getPreviousDay(todayStr);
      start = yst;
      end = yst;
    } else if (preset === "thisMonth") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = formatDateToYMD(firstDay);
      end = todayStr;
    } else if (preset === "lastMonth") {
      const now = new Date();
      const firstDayLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLast = new Date(now.getFullYear(), now.getMonth(), 0);
      start = formatDateToYMD(firstDayLast);
      end = formatDateToYMD(lastDayLast);
    }

    setStartDate(start);
    setEndDate(end);
  };

  const getActivePreset = () => {
    const todayStr = getLocalDateString();
    const yst = getPreviousDay(todayStr);
    
    const now = new Date();
    const firstDayThisMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 1));
    const firstDayLastMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastDayLastMonth = formatDateToYMD(new Date(now.getFullYear(), now.getMonth(), 0));

    if (startDate === todayStr && endDate === todayStr) {
      return "today";
    } else if (startDate === yst && endDate === yst) {
      return "yesterday";
    } else if (startDate === firstDayThisMonth && endDate === todayStr) {
      return "thisMonth";
    } else if (startDate === firstDayLastMonth && endDate === lastDayLastMonth) {
      return "lastMonth";
    }
    return "custom";
  };
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billGenerating, setBillGenerating] = useState(false);
  const [openSections, setOpenSections] = useState({
    sales: true,
    spendings: false,
  });

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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const salesData = await dbService.getSalesWithDetails({
        start: getStartOfDay(startDate),
        end: getEndOfDay(endDate),
      });
      if (salesData) {
        salesData.sort((a, b) => new Date(b.saleDate || b.sale_date) - new Date(a.saleDate || a.sale_date));
      }
      setSales(normalizeSales(salesData));

      const spendingsData = await dbService.getSpendings({
        start: getStartOfDay(startDate),
        end: getEndOfDay(endDate),
      });
      setSpendings(normalizeSpendings(spendingsData));

    } catch (error) {
      // Failed to load reports data
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };



  const exportSalesReportPDF = async () => {
    try {
      const doc = new jsPDF();
      let reportDate = "All Time";
      if (startDate === endDate) {
        reportDate = formatDateForDisplay(startDate);
      } else {
        reportDate = `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
      }
      
      doc.setFontSize(18);
      doc.text("Sales Report", 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Date: ${reportDate}`, 14, 30);
      
      const tableColumn = ["Sale Number", "Customer", "Date", "Payment", "Total Amount"];
      const tableRows = [];
      
      sales.forEach(sale => {
        const saleData = [
          sale.sale_number || sale.saleNumber,
          sale.customer_name || sale.customerName || "Walk-in",
          formatDateForDisplay(sale.sale_date || sale.saleDate),
          (sale.payment_method || sale.paymentMethod || "").toUpperCase(),
          `Rs ${parseFloat(sale.total_amount || sale.totalAmount || 0).toFixed(2)}`
        ];
        tableRows.push(saleData);
      });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185] }
      });
      
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 40;
      doc.text(`Total Sales Revenue: Rs ${totalRevenue.toFixed(2)}`, 14, finalY + 15);
      
      const fileName = `Report-${startDate}-to-${endDate}.pdf`;
      
      if (Capacitor.isNativePlatform()) {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });
        
        await FileOpener.openFile({
          path: result.uri,
          mimeType: 'application/pdf'
        });
      } else {
        doc.save(fileName);
      }
      
    } catch (error) {
      alert('Failed to generate PDF: ' + error.message + '\n' + error.stack);
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

      // Normalize fields — DB stores camelCase on web, snake_case via Electron
      const saleNumber   = saleWithItems.saleNumber   || saleWithItems.sale_number   || sale.saleNumber   || sale.sale_number || '';
      const saleType     = saleWithItems.saleType     || saleWithItems.sale_type     || sale.saleType     || sale.sale_type || 'parcel';
      const tableNumber  = saleWithItems.tableNumber  || saleWithItems.table_number  || sale.tableNumber  || sale.table_number || null;
      const customerName = saleWithItems.customerName || saleWithItems.customer_name || sale.customerName || sale.customer_name || 'Walk-in Customer';
      const customerPhone= saleWithItems.customerPhone|| saleWithItems.customer_phone|| sale.customerPhone|| sale.customer_phone|| '';
      const saleDate     = saleWithItems.saleDate     || saleWithItems.sale_date     || sale.saleDate     || sale.sale_date || '';
      const paymentMethod= saleWithItems.paymentMethod|| saleWithItems.payment_method|| sale.paymentMethod|| sale.payment_method|| 'cash';
      
      const totalAmount  = saleWithItems.totalAmount  !== undefined ? saleWithItems.totalAmount  : (saleWithItems.total_amount !== undefined ? saleWithItems.total_amount : (saleWithItems.total_sale_price !== undefined ? saleWithItems.total_sale_price : (sale.totalAmount !== undefined ? sale.totalAmount : (sale.total_amount !== undefined ? sale.total_amount : (sale.total_sale_price || 0)))));
      const discountAmount= saleWithItems.discountAmount!== undefined ? saleWithItems.discountAmount: (saleWithItems.discount_amount !== undefined ? saleWithItems.discount_amount : (sale.discountAmount !== undefined ? sale.discountAmount : (sale.discount_amount || 0)));
      const taxAmount    = saleWithItems.taxAmount    !== undefined ? saleWithItems.taxAmount    : (saleWithItems.tax_amount !== undefined ? saleWithItems.tax_amount : (sale.taxAmount !== undefined ? sale.taxAmount : (sale.tax_amount || 0)));
      
      const subtotal     = saleWithItems.subtotal     !== undefined ? saleWithItems.subtotal     : (sale.subtotal !== undefined ? sale.subtotal : (totalAmount - taxAmount + discountAmount));
      const items        = saleWithItems.items || sale.items || [];
      
      const billData = {
        saleNumber,
        saleType,
        tableNumber,
        customerName,
        customerPhone,
        items,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        paymentMethod,
        saleDate,
        barSettings,
      };
      
      setSelectedBill(billData);
      setShowBillModal(true);
    } catch (error) {
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

  const toggleSection = (section) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <div className="sales-reports">

      {/* Date Selection */}
      <div className="reports-toolbar-section">
        {/* Preset Selector */}
        <div className="reports-presets-container">
          <button
            type="button"
            className={`reports-preset-btn ${getActivePreset() === "yesterday" ? "active" : ""}`}
            onClick={() => handlePresetSelect("yesterday")}
          >
            Yesterday
          </button>
          <button
            type="button"
            className={`reports-preset-btn ${getActivePreset() === "today" ? "active" : ""}`}
            onClick={() => handlePresetSelect("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={`reports-preset-btn ${getActivePreset() === "thisMonth" ? "active" : ""}`}
            onClick={() => handlePresetSelect("thisMonth")}
          >
            This Month
          </button>
          <button
            type="button"
            className={`reports-preset-btn ${getActivePreset() === "lastMonth" ? "active" : ""}`}
            onClick={() => handlePresetSelect("lastMonth")}
          >
            Last Month
          </button>
        </div>

        {/* Custom Date Fields */}
        <div className="reports-date-fields">
          <div className="reports-date-field">
            <span className="reports-date-label">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="reports-date-input"
            />
          </div>
          <div className="reports-date-field">
            <span className="reports-date-label">End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="reports-date-input"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="reports-action-buttons">
          <button
            onClick={loadData}
            className="reports-btn-primary"
          >
            Generate Report
          </button>
          <button
            onClick={exportSalesReportPDF}
            className="reports-btn-secondary"
            disabled={sales.length === 0}
          >
            <Download size={16} style={{ marginRight: '6px' }} />
            Download
          </button>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="summary-cards" style={{ margin: "0 12px 20px 12px" }}>
        <div className="summary-card">
          <div className="card-header">
            <h3>Total Sales</h3>
            <div className="card-icon"><BarChart3 size={16} /></div>
          </div>
          <div className="value">₹{totalRevenue.toFixed(0)}</div>
          <div className="card-subtext" style={{ fontSize: '11px', color: '#7f766a', fontWeight: '600', marginTop: '4px' }}>
            {totalTransactions} transactions
          </div>
        </div>

        <div className="summary-card">
          <div className="card-header">
            <h3>Total Spendings</h3>
            <div className="card-icon"><DollarSign size={16} /></div>
          </div>
          <div className="value">₹{totalSpendings.toFixed(0)}</div>
          <div className="card-subtext" style={{ fontSize: '11px', color: '#7f766a', fontWeight: '600', marginTop: '4px' }}>
            {totalSpendingEntries} entries
          </div>
        </div>

        <div className="summary-card">
          <div className="card-header">
            <h3>Net Income</h3>
            <div className="card-icon"><BarChart3 size={16} /></div>
          </div>
          <div className={`value ${netIncome >= 0 ? 'positive' : 'negative'}`}>
            ₹{netIncome.toFixed(0)}
          </div>
          <div className="card-subtext" style={{ fontSize: '11px', color: '#7f766a', fontWeight: '600', marginTop: '4px' }}>
            Revenue - Spendings
          </div>
        </div>
      </div>

      {/* Sales Reports Table */}
      <div className="table-container reports-collapse-card">
        <button
          type="button"
          className="reports-collapse-header"
          onClick={() => toggleSection("sales")}
        >
          <div>
            <h3>Sales Details</h3>
            <span>{totalTransactions} transactions</span>
          </div>
          <ChevronDown className={openSections.sales ? "open" : ""} size={20} />
        </button>
        {openSections.sales && (
          <table className="reports-table">
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
                  <td colSpan="10" style={{ textAlign: "center", padding: "40px" }}>
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
        )}
      </div>

      {/* Spendings Table */}
      {spendings.length > 0 && (
        <div className="table-container reports-collapse-card" style={{ marginTop: "30px" }}>
          <button
            type="button"
            className="reports-collapse-header"
            onClick={() => toggleSection("spendings")}
          >
            <div>
              <h3>Spendings Details</h3>
              <span>{totalSpendingEntries} entries</span>
            </div>
            <ChevronDown className={openSections.spendings ? "open" : ""} size={20} />
          </button>
          {openSections.spendings && (
            <table className="spendings-table">
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
                      <span className={`payment-method ${spending.payment_method}`}>
                        {spending.payment_method.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td>{spending.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
              <div className="bill-preview" style={{ padding: "10px 20px", background: "#fff", color: "#333", width: "100%", boxSizing: "border-box" }}>
                
                {/* Shop Details Header */}
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <h2 style={{ margin: "0 0 5px 0", fontSize: "1.5rem", fontWeight: "bold", color: "#111" }}>
                    {barSettings?.bar_name || "CounterFlow POS"}
                  </h2>
                  {barSettings?.address && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#6c757d" }}>
                      📍 {barSettings.address}
                    </p>
                  )}
                  {barSettings?.contact_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#6c757d" }}>
                      📞 {barSettings.contact_number}
                    </p>
                  )}
                  {barSettings?.gst_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.9rem", color: "#6c757d", fontWeight: "500" }}>
                      GSTIN: {barSettings.gst_number}
                    </p>
                  )}
                </div>
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />

                {/* Bill Details Grid */}
                <div className="bill-details" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "25px", padding: "15px", background: "#f8f9fa", borderRadius: "10px", border: "1px solid #e9ecef" }}>
                  <div>
                    <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Bill No</div>
                    <div style={{ fontWeight: "600", fontSize: "1.1rem", color: "#111" }}>{selectedBill.saleNumber}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</div>
                    <div style={{ fontWeight: "600", fontSize: "1.1rem", color: "#111" }}>{formatDate(selectedBill.saleDate)}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Type</div>
                    <div style={{ fontWeight: "600", fontSize: "1.1rem", color: "#111" }}>
                      {selectedBill.saleType === 'table' ? 'Table' : 'Parcel'}
                      {selectedBill.tableNumber && ` - T${selectedBill.tableNumber}`}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment</div>
                    <div style={{ fontWeight: "600", fontSize: "1.1rem", color: "#111" }}>{selectedBill.paymentMethod?.toUpperCase()}</div>
                  </div>
                  
                  {selectedBill.customerName && selectedBill.customerName !== 'Walk-in Customer' && (
                    <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "5px", paddingTop: "15px", borderTop: "1px dashed #dee2e6" }}>
                      <div>
                        <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Customer</div>
                        <div style={{ fontWeight: "600", color: "#111" }}>{selectedBill.customerName}</div>
                      </div>
                      {selectedBill.customerPhone && (
                        <div>
                          <div style={{ color: "#6c757d", fontSize: "0.85rem", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone</div>
                          <div style={{ fontWeight: "600", color: "#111" }}>{selectedBill.customerPhone}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <hr style={{ borderTop: "1px dashed #000", margin: "10px 0" }} />
                
                {/* Items Table */}
                <div className="bill-items" style={{ margin: "20px 0" }}>
                  <table className="bill-items-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "1rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e9ecef", color: "#6c757d" }}>
                        <th style={{ textAlign: "left", padding: "10px 5px", fontWeight: "600" }}>Item</th>
                        <th style={{ textAlign: "center", padding: "10px 5px", fontWeight: "600" }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "10px 5px", fontWeight: "600" }}>Rate</th>
                        <th style={{ textAlign: "right", padding: "10px 5px", fontWeight: "600" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBill.items?.map((item, index) => (
                        <tr key={index} style={{ borderBottom: "1px solid #f8f9fa" }}>
                          <td style={{ textAlign: "left", padding: "10px 5px" }}>{item.name}</td>
                          <td style={{ textAlign: "center", padding: "10px 5px" }}>{item.quantity}</td>
                          <td style={{ textAlign: "right", padding: "10px 5px" }}>{item.unitPrice?.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "10px 5px", fontWeight: "500" }}>{(item.totalPrice || (item.price * item.quantity))?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Bill Summary */}
                <div className="bill-summary" style={{ fontSize: "1.05rem", padding: "15px", background: "#f8f9fa", borderRadius: "10px", marginTop: "15px" }}>
                  <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "5px 0", color: "#495057" }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: "500" }}>₹{selectedBill.subtotal?.toFixed(2)}</span>
                  </div>
                  
                  {selectedBill.discountAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "5px 0", color: "#e53e3e" }}>
                      <span>Discount</span>
                      <span style={{ fontWeight: "500" }}>-₹{selectedBill.discountAmount?.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {selectedBill.taxAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "5px 0", color: "#495057" }}>
                      <span>Tax</span>
                      <span style={{ fontWeight: "500" }}>₹{selectedBill.taxAmount?.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="summary-row total" style={{ display: "flex", justifyContent: "space-between", margin: "15px 0 0 0", paddingTop: "15px", borderTop: "2px solid #e9ecef", fontSize: "1.3rem", fontWeight: "bold", color: "#111" }}>
                    <span>Total</span>
                    <span>₹{selectedBill.totalAmount?.toFixed(2)}</span>
                  </div>
                </div>

                {/* Thank You Message */}
                <div style={{ textAlign: "center", marginTop: "20px", padding: "10px", fontSize: "0.95rem", fontStyle: "italic", color: "#6c757d", borderTop: "1px dashed #000" }}>
                  {barSettings?.thank_you_message || "Thank you for visiting! Please visit again."}
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
