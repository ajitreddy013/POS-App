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

  // Listen to external sales sync completed to auto-refresh reports
  useEffect(() => {
    window.addEventListener('saleCompleted', loadData);
    return () => window.removeEventListener('saleCompleted', loadData);
  }, [loadData]);


  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };



  const exportSalesReportPDF = async () => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const BRAND = [182, 65, 44];

      let reportDateLabel = "All Time";
      if (startDate === endDate) {
        reportDateLabel = formatDateForDisplay(startDate);
      } else {
        reportDateLabel = `${formatDateForDisplay(startDate)} – ${formatDateForDisplay(endDate)}`;
      }

      const shopName = barSettings?.bar_name || "CounterFlow POS";
      const address = barSettings?.address || "";
      const contact = barSettings?.contact_number || "";
      const gst = barSettings?.gst_number || "";

      // ── Centered shop header ──
      const drawShopHeader = () => {
        let y = 18;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.setTextColor(20, 20, 20);
        doc.text(shopName, pageWidth / 2, y, { align: "center" });
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        if (address) {
          doc.text(address, pageWidth / 2, y, { align: "center" });
          y += 5;
        }
        const contactLine = [contact ? `Phone: ${contact}` : "", gst ? `GSTIN: ${gst}` : ""]
          .filter(Boolean)
          .join("   |   ");
        if (contactLine) {
          doc.text(contactLine, pageWidth / 2, y, { align: "center" });
          y += 5;
        }

        y += 3;
        doc.setDrawColor(...BRAND);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageWidth - margin, y);
        y += 9;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...BRAND);
        doc.text("SALES REPORT", margin, y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(100, 100, 100);
        doc.text(reportDateLabel, pageWidth - margin, y, { align: "right" });

        return y + 8;
      };

      let cursorY = drawShopHeader();

      // ── Summary boxes ──
      const boxGap = 5;
      const boxWidth = (contentWidth - boxGap * 2) / 3;
      const boxHeight = 20;
      const summaryItems = [
        { label: "TOTAL SALES", value: `Rs ${totalRevenue.toFixed(2)}`, color: [27, 117, 67] },
        { label: "TOTAL SPENDINGS", value: `Rs ${totalSpendings.toFixed(2)}`, color: [185, 28, 28] },
        { label: "NET INCOME", value: `Rs ${netIncome.toFixed(2)}`, color: netIncome >= 0 ? [27, 117, 67] : [185, 28, 28] },
      ];

      summaryItems.forEach((item, i) => {
        const x = margin + i * (boxWidth + boxGap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(x, cursorY, boxWidth, boxHeight, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.3);
        doc.setTextColor(120, 120, 120);
        doc.text(item.label, x + 4, cursorY + 7);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12.5);
        doc.setTextColor(...item.color);
        doc.text(item.value, x + 4, cursorY + 16);
      });

      cursorY += boxHeight + 10;

      // ── Sales table ──
      const tableColumn = ["Sale #", "Customer", "Date", "Payment", "Amount"];
      const tableRows = sales.map((sale) => [
        sale.sale_number || sale.saleNumber,
        sale.customer_name || sale.customerName || "Walk-in",
        formatDateForDisplay(sale.sale_date || sale.saleDate),
        (sale.payment_method || sale.paymentMethod || "").toUpperCase(),
        `Rs ${parseFloat(sale.total_amount || sale.totalAmount || 0).toFixed(2)}`,
      ]);

      const drawFooter = () => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.6);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generated on ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, pageHeight - 8);
        doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - margin, pageHeight - 8, { align: "right" });
      };

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: cursorY,
        margin: { left: margin, right: margin, bottom: 16 },
        styles: { fontSize: 9, cellPadding: 3, textColor: [51, 65, 85], lineColor: [241, 245, 249], lineWidth: 0.15 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 9 },
        alternateRowStyles: { fillColor: [253, 251, 247] },
        columnStyles: { 4: { halign: "right" } },
        foot: [["", "", "", "Total Revenue", `Rs ${totalRevenue.toFixed(2)}`]],
        footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 9.5, lineWidth: 0.15, lineColor: [226, 232, 240] },
        didDrawPage: drawFooter,
      });

      let finalY = doc.lastAutoTable.finalY + 12;

      // ── Spendings table ──
      if (spendings.length > 0) {
        if (finalY > pageHeight - 60) {
          doc.addPage();
          finalY = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...BRAND);
        doc.text("SPENDINGS", margin, finalY);
        finalY += 6;

        const spendColumn = ["Date", "Description", "Category", "Payment", "Amount"];
        const spendRows = spendings.map((s) => [
          formatDateForDisplay(s.spending_date),
          s.description || "-",
          s.category || "-",
          (s.payment_method || "").replace("_", " ").toUpperCase(),
          `Rs ${Number(s.amount).toFixed(2)}`,
        ]);

        autoTable(doc, {
          head: [spendColumn],
          body: spendRows,
          startY: finalY,
          margin: { left: margin, right: margin, bottom: 16 },
          styles: { fontSize: 9, cellPadding: 3, textColor: [51, 65, 85], lineColor: [241, 245, 249], lineWidth: 0.15 },
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold", fontSize: 9 },
          alternateRowStyles: { fillColor: [253, 251, 247] },
          columnStyles: { 4: { halign: "right" } },
          foot: [["", "", "", "Total Spendings", `Rs ${totalSpendings.toFixed(2)}`]],
          footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 9.5, lineWidth: 0.15, lineColor: [226, 232, 240] },
          didDrawPage: drawFooter,
        });
      }

      const fileName = `Sales-Report-${startDate}-to-${endDate}.pdf`;

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
    <div className="rpt-root">
      <style>{`
        .rpt-root {
          min-height: 100vh;
          padding: 1.5rem 1.5rem 3rem;
          background: linear-gradient(180deg, #fdfbf9 0%, #fff7f2 40%, #f8fafc 100%);
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          color: #1e293b;
        }
        .rpt-shell { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.1rem; }

        .rpt-toolbar {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
          padding: 1.1rem 1.25rem;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 1rem;
        }
        .rpt-date-fields { display: flex; gap: 0.75rem; flex: 1 1 280px; }
        .rpt-date-field { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; min-width: 130px; }
        .rpt-date-label { font-size: 0.7rem; font-weight: 700; color: #94837a; text-transform: uppercase; letter-spacing: 0.07em; }
        .rpt-date-input {
          border: 1px solid #e6ded3;
          border-radius: 12px;
          padding: 0.6rem 0.7rem;
          font-size: 0.88rem;
          color: #221f1a;
          background: #fdfbf7;
          font-family: inherit;
        }
        .rpt-date-input:focus { outline: none; border-color: #b6412c; background: #fff; }

        .rpt-presets { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .rpt-preset-btn {
          padding: 0.6rem 0.95rem;
          border-radius: 12px;
          border: 1px solid #e6ded3;
          background: #fdfbf7;
          color: #57504a;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .rpt-preset-btn:hover { border-color: #d8c3b5; }
        .rpt-preset-btn.active { background: #b6412c; border-color: #b6412c; color: #fff; }

        .rpt-download-btn {
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
        .rpt-download-btn:hover { filter: brightness(1.05); }

        .rpt-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }
        .rpt-summary-card {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          padding: 1.2rem 1.3rem;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
        }
        .rpt-summary-top { display: flex; align-items: center; justify-content: space-between; }
        .rpt-summary-top span {
          font-size: 0.74rem; font-weight: 800; color: #94837a;
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .rpt-summary-icon {
          width: 34px; height: 34px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .rpt-summary-icon.sales { background: rgba(27, 117, 67, 0.1); color: #1b7543; }
        .rpt-summary-icon.spend { background: rgba(185, 28, 28, 0.1); color: #b91c1c; }
        .rpt-summary-icon.net { background: rgba(182, 65, 44, 0.1); color: #b6412c; }
        .rpt-summary-value { margin-top: 0.7rem; font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; }
        .rpt-summary-value.positive { color: #1b7543; }
        .rpt-summary-value.negative { color: #b91c1c; }
        .rpt-summary-sub { margin-top: 0.3rem; font-size: 0.78rem; color: #94837a; font-weight: 600; }

        .rpt-panel {
          background: #ffffff;
          border: 1px solid #ece4d8;
          border-radius: 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
          overflow: hidden;
        }
        .rpt-panel-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.05rem 1.3rem;
          background: linear-gradient(180deg, #fffaf6 0%, #ffffff 100%);
          border-bottom: 1px solid #f1ebe1;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .rpt-panel-header h3 { margin: 0; font-size: 1.02rem; font-weight: 800; color: #221f1a; }
        .rpt-panel-header span.rpt-panel-count { font-size: 0.78rem; color: #94837a; font-weight: 600; }
        .rpt-panel-header svg.chev { color: #94837a; transition: transform 0.2s ease; }
        .rpt-panel-header svg.chev.open { transform: rotate(180deg); }

        .rpt-table-wrap { overflow-x: auto; }
        .rpt-table { width: 100%; border-collapse: collapse; min-width: 640px; }
        .rpt-table thead th {
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
        .rpt-table tbody td {
          padding: 0.85rem 1.1rem;
          font-size: 0.86rem;
          color: #3a342e;
          border-bottom: 1px solid #f5f0e9;
          vertical-align: middle;
        }
        .rpt-table tbody tr:hover { background: #fffaf6; }
        .rpt-table tbody tr:last-child td { border-bottom: none; }
        .rpt-empty-state { text-align: center; padding: 3rem 1rem; color: #94837a; font-size: 0.9rem; }

        .rpt-pay-chip {
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          font-size: 0.7rem;
          display: inline-block;
        }
        .rpt-pay-chip.upi { background: rgba(102, 126, 234, 0.12); color: #5a64c4; }
        .rpt-pay-chip.cash { background: rgba(39, 174, 96, 0.12); color: #1f9c54; }

        .rpt-bill-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 10px;
          border: 1px solid #e6ded3; background: #fdfbf7; color: #57504a; cursor: pointer;
        }
        .rpt-bill-btn:hover { background: #f1ebe1; }

        .rpt-category-tag {
          background: rgba(182, 65, 44, 0.1); color: #b6412c;
          font-size: 0.74rem; font-weight: 700; padding: 0.28rem 0.65rem; border-radius: 999px;
        }

        @media (max-width: 760px) {
          .rpt-summary-grid { grid-template-columns: 1fr; }
          .rpt-toolbar { flex-direction: column; align-items: stretch; }
          .rpt-presets { justify-content: stretch; }
          .rpt-presets .rpt-preset-btn { flex: 1; text-align: center; }
        }
      `}</style>

      <div className="rpt-shell">
        {/* Toolbar: date range, presets, download */}
        <div className="rpt-toolbar">
          <div className="rpt-date-fields">
            <div className="rpt-date-field">
              <span className="rpt-date-label">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rpt-date-input"
              />
            </div>
            <div className="rpt-date-field">
              <span className="rpt-date-label">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rpt-date-input"
              />
            </div>
          </div>

          <div className="rpt-presets">
            <button type="button" className={`rpt-preset-btn ${getActivePreset() === "yesterday" ? "active" : ""}`} onClick={() => handlePresetSelect("yesterday")}>Yesterday</button>
            <button type="button" className={`rpt-preset-btn ${getActivePreset() === "today" ? "active" : ""}`} onClick={() => handlePresetSelect("today")}>Today</button>
            <button type="button" className={`rpt-preset-btn ${getActivePreset() === "thisMonth" ? "active" : ""}`} onClick={() => handlePresetSelect("thisMonth")}>This Month</button>
            <button type="button" className={`rpt-preset-btn ${getActivePreset() === "lastMonth" ? "active" : ""}`} onClick={() => handlePresetSelect("lastMonth")}>Last Month</button>
          </div>

          <button onClick={exportSalesReportPDF} className="rpt-download-btn" title="Download Report PDF">
            <Download size={16} />
            Download PDF
          </button>
        </div>

        {/* Financial Summary */}
        <div className="rpt-summary-grid">
          <div className="rpt-summary-card">
            <div className="rpt-summary-top">
              <span>Total Sales</span>
              <div className="rpt-summary-icon sales"><BarChart3 size={16} /></div>
            </div>
            <div className="rpt-summary-value">₹{totalRevenue.toFixed(0)}</div>
            <div className="rpt-summary-sub">{totalTransactions} transactions</div>
          </div>

          <div className="rpt-summary-card">
            <div className="rpt-summary-top">
              <span>Total Spendings</span>
              <div className="rpt-summary-icon spend"><DollarSign size={16} /></div>
            </div>
            <div className="rpt-summary-value">₹{totalSpendings.toFixed(0)}</div>
            <div className="rpt-summary-sub">{totalSpendingEntries} entries</div>
          </div>

          <div className="rpt-summary-card">
            <div className="rpt-summary-top">
              <span>Net Income</span>
              <div className="rpt-summary-icon net"><BarChart3 size={16} /></div>
            </div>
            <div className={`rpt-summary-value ${netIncome >= 0 ? 'positive' : 'negative'}`}>₹{netIncome.toFixed(0)}</div>
            <div className="rpt-summary-sub">Revenue − Spendings</div>
          </div>
        </div>

        {/* Sales Reports Table */}
        <div className="rpt-panel">
          <button type="button" className="rpt-panel-header" onClick={() => toggleSection("sales")}>
            <div>
              <h3>Sales Details</h3>
              <span className="rpt-panel-count">{totalTransactions} transactions</span>
            </div>
            <ChevronDown className={`chev ${openSections.sales ? "open" : ""}`} size={20} />
          </button>
          {openSections.sales && (
            <div className="rpt-table-wrap">
              <table className="rpt-table">
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
                    <tr><td colSpan="7"><div className="rpt-empty-state">Loading…</div></td></tr>
                  </tbody>
                ) : sales.length === 0 ? (
                  <tbody>
                    <tr><td colSpan="7"><div className="rpt-empty-state">No sales found for the selected date</div></td></tr>
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
                          <span className={`rpt-pay-chip ${(sale.payment_method || sale.paymentMethod) === "upi" ? "upi" : "cash"}`}>
                            {sale.payment_method || sale.paymentMethod || "cash"}
                          </span>
                        </td>
                        <td>{formatDate(sale.sale_date)}</td>
                        <td>
                          <button onClick={() => handleViewBill(sale)} className="rpt-bill-btn" aria-label="View Bill">
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Spendings Table */}
        {spendings.length > 0 && (
          <div className="rpt-panel">
            <button type="button" className="rpt-panel-header" onClick={() => toggleSection("spendings")}>
              <div>
                <h3>Spendings Details</h3>
                <span className="rpt-panel-count">{totalSpendingEntries} entries</span>
              </div>
              <ChevronDown className={`chev ${openSections.spendings ? "open" : ""}`} size={20} />
            </button>
            {openSections.spendings && (
              <div className="rpt-table-wrap">
                <table className="rpt-table">
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
                        <td><span className="rpt-category-tag">{spending.category}</span></td>
                        <td>₹{spending.amount.toFixed(2)}</td>
                        <td>
                          <span className={`rpt-pay-chip ${spending.payment_method === 'upi' ? 'upi' : 'cash'}`}>
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
          </div>
        )}
      </div>

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
            
            <div className="modal-content" style={{ padding: "12px", background: "#f6f3ee" }}>
              <div className="bill-preview" style={{ padding: "16px", background: "#fff", color: "#221f1a", width: "100%", boxSizing: "border-box", borderRadius: "12px", border: "1px solid #e6ded3", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                
                {/* Shop Details Header */}
                <div style={{ textAlign: "center", marginBottom: "15px" }}>
                  <h2 style={{ margin: "0 0 5px 0", fontSize: "1.4rem", fontWeight: "800", color: "#b6412c" }}>
                    {barSettings?.bar_name || "CounterFlow POS"}
                  </h2>
                  {barSettings?.address && (
                    <p style={{ margin: "2px 0", fontSize: "0.82rem", color: "#7f766a" }}>
                      📍 {barSettings.address}
                    </p>
                  )}
                  {barSettings?.contact_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.82rem", color: "#7f766a" }}>
                      📞 {barSettings.contact_number}
                    </p>
                  )}
                  {barSettings?.gst_number && (
                    <p style={{ margin: "2px 0", fontSize: "0.82rem", color: "#7f766a", fontWeight: "700" }}>
                      GSTIN: {barSettings.gst_number}
                    </p>
                  )}
                </div>
                <hr style={{ borderTop: "1.5px dashed #e6ded3", margin: "12px 0" }} />

                {/* Bill Details List */}
                <div className="bill-details" style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "8px", 
                  marginBottom: "20px", 
                  padding: "12px", 
                  background: "#fdfbf7", 
                  borderRadius: "8px", 
                  border: "1px solid #e6ded3",
                  fontSize: "0.88rem"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#7f766a" }}>Bill No:</span>
                    <strong style={{ color: "#221f1a" }}>{selectedBill.saleNumber}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#7f766a" }}>Date:</span>
                    <strong style={{ color: "#221f1a" }}>{formatDate(selectedBill.saleDate)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#7f766a" }}>Type:</span>
                    <strong style={{ color: "#221f1a" }}>
                      {selectedBill.saleType === 'table' ? 'Table' : 'Parcel'}
                      {selectedBill.tableNumber && ` - T${selectedBill.tableNumber}`}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#7f766a" }}>Payment Method:</span>
                    <strong style={{ color: "#221f1a", textTransform: "uppercase" }}>{selectedBill.paymentMethod}</strong>
                  </div>
                  
                  {selectedBill.customerName && selectedBill.customerName !== 'Walk-in Customer' && (
                    <>
                      <div style={{ borderTop: "1px dashed #e6ded3", marginTop: "4px", paddingTop: "8px" }} />
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#7f766a" }}>Customer:</span>
                        <strong style={{ color: "#221f1a" }}>{selectedBill.customerName}</strong>
                      </div>
                      {selectedBill.customerPhone && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#7f766a" }}>Phone:</span>
                          <strong style={{ color: "#221f1a" }}>{selectedBill.customerPhone}</strong>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <hr style={{ borderTop: "1.5px dashed #e6ded3", margin: "12px 0" }} />
                
                {/* Items Table */}
                <div className="bill-items" style={{ margin: "15px 0" }}>
                  <table className="bill-items-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1.5px solid #e6ded3", color: "#7f766a" }}>
                        <th style={{ textAlign: "left", padding: "6px 2px", fontWeight: "700" }}>Item</th>
                        <th style={{ textAlign: "center", padding: "6px 2px", fontWeight: "700", width: "40px" }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "6px 2px", fontWeight: "700", width: "70px" }}>Rate</th>
                        <th style={{ textAlign: "right", padding: "6px 2px", fontWeight: "700", width: "80px" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBill.items?.map((item, index) => (
                        <tr key={index} style={{ borderBottom: "1px solid #fdfbf7" }}>
                          <td style={{ textAlign: "left", padding: "8px 2px", color: "#221f1a", fontWeight: "500" }}>{item.name}</td>
                          <td style={{ textAlign: "center", padding: "8px 2px", color: "#221f1a" }}>{item.quantity}</td>
                          <td style={{ textAlign: "right", padding: "8px 2px", color: "#7f766a" }}>₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "8px 2px", fontWeight: "700", color: "#221f1a" }}>₹{Number(item.totalPrice || (item.price * item.quantity) || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Bill Summary */}
                <div className="bill-summary" style={{ fontSize: "0.92rem", padding: "12px", background: "#fdfbf7", borderRadius: "8px", border: "1px solid #e6ded3", marginTop: "15px" }}>
                  <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", color: "#7f766a" }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: "600", color: "#221f1a" }}>₹{Number(selectedBill.subtotal || 0).toFixed(2)}</span>
                  </div>
                  
                  {selectedBill.discountAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", color: "#dc2626" }}>
                      <span>Discount</span>
                      <span style={{ fontWeight: "600" }}>-₹{Number(selectedBill.discountAmount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  
                  {selectedBill.taxAmount > 0 && (
                    <div className="summary-row" style={{ display: "flex", justifyContent: "space-between", margin: "4px 0", color: "#7f766a" }}>
                      <span>Tax</span>
                      <span style={{ fontWeight: "600", color: "#221f1a" }}>₹{Number(selectedBill.taxAmount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="summary-row total" style={{ display: "flex", justifyContent: "space-between", margin: "10px 0 0 0", paddingTop: "10px", borderTop: "1.5px solid #e6ded3", fontSize: "1.15rem", fontWeight: "900", color: "#b6412c" }}>
                    <span>Total</span>
                    <span>₹{Number(selectedBill.totalAmount || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Thank You Message */}
                <div style={{ textAlign: "center", marginTop: "15px", padding: "10px 5px 0 5px", fontSize: "0.85rem", fontStyle: "italic", color: "#7f766a", borderTop: "1.5px dashed #e6ded3" }}>
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
