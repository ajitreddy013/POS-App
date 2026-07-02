import Dexie from "dexie";
import { getLocalDateTimeString } from "../utils/dateUtils";
import { getFirebaseDb } from "../firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";

// Check if running inside Electron
const isElectron = typeof window !== "undefined" && !!window.electronAPI;

// Initialize Dexie for Browser/Tablet Standalone Mode
let db = null;
if (!isElectron) {
  db = new Dexie("CounterFlowPOS");
  db.version(2).stores({
    products: "++id, name, variant, sku, barcode, price, cost, category, counter_stock, godown_stock, min_stock_level, max_stock_level",
    sales: "++id, saleNumber, saleType, tableNumber, customerName, customerPhone, subtotal, taxAmount, discountAmount, totalAmount, paymentMethod, saleDate",
    spendings: "++id, description, amount, category, spending_date, payment_method, notes",
    counter_balance: "balance_date, opening_balance, closing_balance, notes",
    pending_bills: "++id, billNumber, saleType, tableNumber, customerName, customerPhone, subtotal, totalAmount",
    tables: "++id, name, capacity, area, status",
    table_orders: "tableId",
    daily_transfers: "++id, transfer_date",
    bar_settings: "id"
  });

  // Seed sample tables and default bar settings if the browser database is empty
  db.on("ready", async () => {
    if (localStorage.getItem("db_seeded_v2") === "true") {
      return;
    }
    const tableCount = await db.table("tables").count();
    if (tableCount === 0) {
      const sampleTables = [
        { name: "T1", capacity: 4, area: "Indoor", status: "available" },
        { name: "T2", capacity: 4, area: "Indoor", status: "available" },
        { name: "T3", capacity: 2, area: "Indoor", status: "available" },
        { name: "T4", capacity: 6, area: "Outdoor", status: "available" },
        { name: "T5", capacity: 4, area: "Outdoor", status: "available" }
      ];
      await db.table("tables").bulkAdd(sampleTables);
    }

    const settingsCount = await db.bar_settings.count();
    if (settingsCount === 0) {
      await db.bar_settings.add({
        id: 1,
        bar_name: "CounterFlow Food Truck",
        contact_number: "9876543210",
        gst_number: "",
        address: "Food Truck Street, Lane 1",
        thank_you_message: "Thank you for visiting! Please come back soon.",
        printing_enabled: 0,
        whatsapp_enabled: 0,
        whatsapp_relay_url: "",
        whatsapp_template_name: "counterflow_pos_receipt",
        whatsapp_language_code: "en",
        whatsapp_default_country_code: "91",
        admin_password: "123456"
      });
    }
    localStorage.setItem("db_seeded_v2", "true");
  });
}

// Unified Database Service Export
export const dbService = {
  // --- PRODUCT OPERATIONS ---
  getProducts: async () => {
    if (isElectron) return await window.electronAPI.getProducts();
    const local = await db.products.toArray();
    if (local.length > 0) return local;

    // Local DB is empty — pull from Firestore
    const firestoreDb = getFirebaseDb();
    if (!firestoreDb) return [];

    const snap = await getDocs(collection(firestoreDb, 'products'));
    if (snap.empty) return [];

    const rows = snap.docs.map(d => {
      const data = d.data();
      const numId = Number(data.id);
      return {
        ...(numId > 0 ? { id: numId } : {}),
        name: data.name || '',
        price: Number(data.price) || 0,
        category: data.category || 'General',
        image: data.image || '',
        description: data.description || '',
        dietary_type: data.dietary_type || 'veg',
        counter_stock: 0,
        godown_stock: 0,
      };
    });

    // Seed local DB — but return Firestore rows directly even if seeding fails
    try {
      await db.products.bulkPut(rows);
      return await db.products.toArray();
    } catch (_) {
      return rows;
    }
  },

  addProduct: async (product) => {
    if (isElectron) return await window.electronAPI.addProduct(product);
    const id = await db.products.add({
      ...product,
      counter_stock: product.counter_stock || 0,
      godown_stock: product.godown_stock || 0
    });
    return { success: true, id };
  },

  updateProduct: async (id, product) => {
    if (isElectron) return await window.electronAPI.updateProduct(id, product);
    await db.products.update(Number(id), product);
    return { success: true };
  },

  deleteProduct: async (id) => {
    if (isElectron) return await window.electronAPI.deleteProduct(id);
    await db.products.delete(Number(id));
    return { success: true };
  },

  // --- INVENTORY OPERATIONS ---
  getInventory: async () => {
    if (isElectron) return await window.electronAPI.getInventory();
    const products = await db.products.toArray();
    return products.map(p => ({
      id: p.id,
      product_id: p.id,
      name: p.name,
      variant: p.variant,
      sku: p.sku,
      godown_stock: p.godown_stock || 0,
      counter_stock: p.counter_stock || 0,
      min_stock_level: p.min_stock_level || 0,
      max_stock_level: p.max_stock_level || 0
    }));
  },

  updateStock: async (productId, godownStock, counterStock) => {
    if (isElectron) return await window.electronAPI.updateStock(productId, godownStock, counterStock);
    await db.products.update(Number(productId), {
      godown_stock: Number(godownStock),
      counter_stock: Number(counterStock)
    });
    return { success: true };
  },

  transferStock: async (productId, quantity, fromLocation, toLocation) => {
    if (isElectron) return await window.electronAPI.transferStock(productId, quantity, fromLocation, toLocation);
    const prod = await db.products.get(Number(productId));
    if (!prod) throw new Error("Product not found");

    const qty = Number(quantity);
    let newGodown = prod.godown_stock || 0;
    let newCounter = prod.counter_stock || 0;

    if (fromLocation === "godown" && toLocation === "counter") {
      newGodown -= qty;
      newCounter += qty;
    } else if (fromLocation === "counter" && toLocation === "godown") {
      newCounter -= qty;
      newGodown += qty;
    }

    await db.products.update(Number(productId), {
      godown_stock: newGodown,
      counter_stock: newCounter
    });
    return { success: true };
  },

  // --- SALES OPERATIONS ---
  createSale: async (saleData) => {
    if (isElectron) return await window.electronAPI.createSale(saleData);
    
    // Prevent duplicate entries
    if (saleData.saleNumber) {
      const existing = await db.sales.where("saleNumber").equals(saleData.saleNumber).first();
      if (existing) {
        return { success: true, id: existing.id, alreadyExisted: true };
      }
    }

    // Deduct stock for each sold product
    for (const item of saleData.items) {
      const prod = await db.products.get(Number(item.productId));
      if (prod) {
        const newCounterStock = Math.max(0, (prod.counter_stock || 0) - item.quantity);
        await db.products.update(Number(item.productId), { counter_stock: newCounterStock });
      }
    }

    // Save sale locally
    const finalSaleData = { ...saleData, saleDate: saleData.saleDate || getLocalDateTimeString() };
    const id = await db.sales.add(finalSaleData);

    // Mirror to Firestore for cross-device sync (fire-and-forget)
    try {
      const firestoreDb = getFirebaseDb();
      if (firestoreDb) {
        await addDoc(collection(firestoreDb, 'sales'), { ...finalSaleData, localId: id });
      }
    } catch (_) {}

    return { success: true, id };
  },

  deleteSaleByNumber: async (saleNumber) => {
    if (isElectron || !db) return { success: false };
    try {
      const sale = await db.sales.where("saleNumber").equals(saleNumber).first();
      if (sale) {
        // Restock products
        for (const item of sale.items) {
          const prod = await db.products.get(Number(item.productId));
          if (prod) {
            const newCounterStock = (prod.counter_stock || 0) + item.quantity;
            await db.products.update(Number(item.productId), { counter_stock: newCounterStock });
          }
        }
        // Delete sale
        await db.sales.delete(sale.id);
        return { success: true };
      }
    } catch (err) {
      console.error("Failed to delete sale by number:", saleNumber, err);
    }
    return { success: false };
  },

  getSales: async (dateRange) => {
    if (isElectron) return await window.electronAPI.getSales(dateRange);

    // On a new device, seed local DB from Firestore if empty
    const localCount = await db.sales.count();
    if (localCount === 0) {
      try {
        const firestoreDb = getFirebaseDb();
        if (firestoreDb) {
          const snap = await getDocs(collection(firestoreDb, 'sales'));
          if (!snap.empty) {
            for (const d of snap.docs) {
              const data = d.data();
              const { localId, ...saleFields } = data;
              const exists = saleFields.saleNumber
                ? await db.sales.where('saleNumber').equals(saleFields.saleNumber).first()
                : null;
              if (!exists) await db.sales.add(saleFields);
            }
          }
        }
      } catch (_) {}
    }

    let q = db.sales;
    if (dateRange && (dateRange.startDate || dateRange.start) && (dateRange.endDate || dateRange.end)) {
      const start = dateRange.startDate || dateRange.start;
      const end = dateRange.endDate || dateRange.end;
      return await q.filter(s => {
        const sDate = s.saleDate.substring(0, 10);
        return sDate >= start.substring(0, 10) && sDate <= end.substring(0, 10);
      }).toArray();
    }
    return await q.toArray();
  },

  getSalesWithDetails: async (dateRange) => {
    if (isElectron) return await window.electronAPI.getSalesWithDetails(dateRange);
    return await dbService.getSales(dateRange);
  },

  fixSaleDateFormats: async () => {
    if (isElectron || !db) return;
    const sales = await db.sales.toArray();
    for (const sale of sales) {
      if (sale.saleDate && (sale.saleDate.includes('T') || sale.saleDate.includes('Z'))) {
        try {
          const dateObj = new Date(sale.saleDate);
          if (isNaN(dateObj.getTime())) continue;
          
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          const hours = String(dateObj.getHours()).padStart(2, "0");
          const minutes = String(dateObj.getMinutes()).padStart(2, "0");
          const seconds = String(dateObj.getSeconds()).padStart(2, "0");
          const localString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          
          await db.sales.update(sale.id, { saleDate: localString });
        } catch (e) {
          console.error("Failed to fix sale date format for sale:", sale.id, e);
        }
      }
    }
  },

  getSaleWithItems: async (saleId) => {
    if (isElectron) return await window.electronAPI.getSaleWithItems(saleId);
    return await db.sales.get(Number(saleId));
  },

  // --- SETTINGS OPERATIONS ---
  getBarSettings: async () => {
    if (isElectron) return await window.electronAPI.getBarSettings();
    let settings = await db.bar_settings.get(1);
    if (settings) {
      if (settings.razorpay_enabled === undefined) {
        settings.razorpay_enabled = 1;
      }
      if (settings.upi_provider === undefined) {
        settings.upi_provider = "cashfree";
      }
      if (settings.upi_vpa === undefined) {
        settings.upi_vpa = "";
      }
      if (!settings.admin_password) {
        settings.admin_password = "123456";
        await db.bar_settings.put(settings);
      }
      if (settings.offer_enabled === undefined) settings.offer_enabled = false;
      if (!Array.isArray(settings.offer_dates)) settings.offer_dates = [];
      if (settings.delivery_enabled === undefined) settings.delivery_enabled = false;
      return settings;
    }
    return {
      bar_name: "CounterFlow Food Truck",
      contact_number: "",
      gst_number: "",
      address: "",
      thank_you_message: "Thank you for visiting!",
      printing_enabled: 0,
      whatsapp_enabled: 0,
      whatsapp_relay_url: "",
      whatsapp_template_name: "counterflow_pos_receipt",
      whatsapp_language_code: "en",
      whatsapp_default_country_code: "91",
      razorpay_enabled: 1,
      upi_provider: "cashfree",
      upi_vpa: "",
      admin_password: "123456",
      hosted_app_url: "https://counterflow-kiosk.web.app/"
    };
  },

  saveBarSettings: async (settings) => {
    if (isElectron) return await window.electronAPI.saveBarSettings(settings);
    const existing = await db.bar_settings.get(1) || {};
    await db.bar_settings.put({
      id: 1,
      bar_name: settings.bar_name || settings.barName,
      contact_number: settings.contact_number || settings.contactNumber,
      gst_number: settings.gst_number || settings.gstNumber,
      address: settings.address,
      thank_you_message: settings.thank_you_message || settings.thankYouMessage,
      printing_enabled: settings.printing_enabled !== undefined ? Number(settings.printing_enabled) : 0,
      whatsapp_enabled: settings.whatsapp_enabled !== undefined ? Number(settings.whatsapp_enabled) : 0,
      whatsapp_relay_url: settings.whatsapp_relay_url || "",
      whatsapp_template_name: settings.whatsapp_template_name || "counterflow_pos_receipt",
      whatsapp_language_code: settings.whatsapp_language_code || "en",
      whatsapp_default_country_code: settings.whatsapp_default_country_code || "91",
      razorpay_enabled: settings.razorpay_enabled !== undefined ? Number(settings.razorpay_enabled) : 1,
      upi_provider: settings.upi_provider || settings.upiProvider || "cashfree",
      upi_vpa: settings.upi_vpa || settings.upiVpa || "",
      admin_password: settings.admin_password || existing.admin_password || "123456",
      hosted_app_url: settings.hosted_app_url || "",
      offer_enabled: settings.offer_enabled === true,
      offer_dates: Array.isArray(settings.offer_dates) ? settings.offer_dates : [],
      delivery_enabled: settings.delivery_enabled === true,
    });
    return { success: true };
  },

  // --- TABLES OPERATIONS ---
  getTables: async () => {
    if (isElectron) return await window.electronAPI.getTables();
    return await db.table("tables").toArray();
  },

  addTable: async (table) => {
    if (isElectron) return await window.electronAPI.addTable(table);
    const id = await db.table("tables").add({
      ...table,
      status: table.status || "available"
    });
    return { success: true, id };
  },

  updateTable: async (id, table) => {
    if (isElectron) return await window.electronAPI.updateTable(id, table);
    await db.table("tables").update(Number(id), table);
    return { success: true };
  },

  deleteTable: async (id) => {
    if (isElectron) return await window.electronAPI.deleteTable(id);
    await db.table("tables").delete(Number(id));
    return { success: true };
  },

  getTableOrder: async (tableId) => {
    if (isElectron) return await window.electronAPI.getTableOrder(tableId);
    const order = await db.table_orders.get(Number(tableId));
    return order ? JSON.parse(order.items) : [];
  },

  saveTableOrder: async (orderData) => {
    if (isElectron) return await window.electronAPI.saveTableOrder(orderData);
    await db.table_orders.put({
      tableId: Number(orderData.tableId),
      items: JSON.stringify(orderData.items),
      updated_at: getLocalDateTimeString()
    });
    return { success: true };
  },

  clearTableOrder: async (tableId) => {
    if (isElectron) return await window.electronAPI.clearTableOrder(tableId);
    await db.table_orders.delete(Number(tableId));
    return { success: true };
  },

  // --- PENDING BILLS OPERATIONS ---
  addPendingBill: async (billData) => {
    if (isElectron) return await window.electronAPI.addPendingBill(billData);
    const id = await db.pending_bills.add({
      ...billData,
      items: JSON.stringify(billData.items)
    });
    return { success: true, id };
  },

  getPendingBills: async () => {
    if (isElectron) return await window.electronAPI.getPendingBills();
    const bills = await db.pending_bills.toArray();
    return bills.map(b => ({
      ...b,
      items: typeof b.items === "string" ? JSON.parse(b.items) : b.items
    }));
  },

  updatePendingBill: async (id, billData) => {
    if (isElectron) return await window.electronAPI.updatePendingBill(id, billData);
    await db.pending_bills.update(Number(id), {
      ...billData,
      items: JSON.stringify(billData.items)
    });
    return { success: true };
  },

  deletePendingBill: async (id) => {
    if (isElectron) return await window.electronAPI.deletePendingBill(id);
    await db.pending_bills.delete(Number(id));
    return { success: true };
  },

  clearPendingBill: async (id) => {
    if (isElectron) return await window.electronAPI.clearPendingBill(id);
    await db.pending_bills.delete(Number(id));
    return { success: true };
  },

  // --- SPENDINGS OPERATIONS ---
  addSpending: async (spending) => {
    if (isElectron) return await window.electronAPI.addSpending(spending);
    const id = await db.spendings.add(spending);
    return { success: true, id };
  },

  updateSpending: async (id, spending) => {
    if (isElectron) return await window.electronAPI.updateSpending(id, spending);
    await db.spendings.update(Number(id), spending);
    return { success: true };
  },

  deleteSpending: async (id) => {
    if (isElectron) return await window.electronAPI.deleteSpending(id);
    await db.spendings.delete(Number(id));
    return { success: true };
  },

  getSpendings: async (dateRange) => {
    if (isElectron) return await window.electronAPI.getSpendings(dateRange);
    let query = db.spendings;
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const start = dateRange.startDate;
      const end = dateRange.endDate;
      return await query.filter(s => s.spending_date >= start && s.spending_date <= end).toArray();
    }
    return await query.toArray();
  },

  getSpendingCategories: async () => {
    if (isElectron) return await window.electronAPI.getSpendingCategories();
    const spendings = await db.spendings.toArray();
    const cats = [...new Set(spendings.map(s => s.category))];
    return cats.length > 0 ? cats : ["Raw Materials", "Rent", "Utilities", "Salaries", "Maintenance", "Others"];
  },

  getDailySpendingTotal: async (date) => {
    if (isElectron) return await window.electronAPI.getDailySpendingTotal(date);
    const spendings = await db.spendings.filter(s => s.spending_date === date).toArray();
    return spendings.reduce((sum, s) => sum + s.amount, 0);
  },

  // --- COUNTER BALANCE OPERATIONS ---
  addCounterBalance: async (balance) => {
    if (isElectron) return await window.electronAPI.addCounterBalance(balance);
    await db.counter_balance.put(balance);
    return { success: true };
  },

  updateCounterBalance: async (date, balance) => {
    if (isElectron) return await window.electronAPI.updateCounterBalance(date, balance);
    await db.counter_balance.update(date, balance);
    return { success: true };
  },

  getCounterBalance: async (date) => {
    if (isElectron) return await window.electronAPI.getCounterBalance(date);
    return await db.counter_balance.get(date);
  },

  getCounterBalances: async (dateRange) => {
    if (isElectron) return await window.electronAPI.getCounterBalances(dateRange);
    let query = db.counter_balance;
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const start = dateRange.startDate;
      const end = dateRange.endDate;
      return await query.filter(c => c.balance_date >= start && c.balance_date <= end).toArray();
    }
    return await query.toArray();
  },

  getPreviousDayClosingBalance: async (date) => {
    if (isElectron) return await window.electronAPI.getPreviousDayClosingBalance(date);
    const balances = await db.counter_balance.toArray();
    const sorted = balances
      .filter(b => b.balance_date < date)
      .sort((a, b) => (a.balance_date > b.balance_date ? -1 : 1));
    return sorted.length > 0 ? sorted[0].closing_balance : 0;
  },

  // --- NO-OPS & FALLBACKS FOR PRINTERS/EMAILS IN WEB MODE ---
  getPrinterStatus: async () => {
    if (isElectron) return await window.electronAPI.getPrinterStatus();
    return { connected: false, device: "Standalone Web Mode - Printing Disabled" };
  },
  configurePrinter: async (config) => {
    if (isElectron) return await window.electronAPI.configurePrinter(config);
    return { success: true };
  },
  testPrinterConnection: async () => {
    if (isElectron) return await window.electronAPI.testPrinterConnection();
    return { success: true };
  },
  reconnectPrinter: async () => {
    if (isElectron) return await window.electronAPI.reconnectPrinter();
    return { success: true };
  },
  printBill: async (billData) => {
    if (isElectron) return await window.electronAPI.printBill(billData);
    return { success: true }; // Bypassed in web mode
  },
  getEmailSettings: async () => {
    if (isElectron) return await window.electronAPI.getEmailSettings();
    return { enabled: false };
  },
  saveEmailSettings: async () => {
    return true;
  },
  testEmailConnection: async () => {
    return { success: true };
  },
  sendTestEmail: async () => {
    return { success: true };
  },
  sendDailyEmailNow: async () => {
    return { success: true };
  },
  sendEmailReportWithPdfs: async () => {
    return { success: true };
  },
  exportStockReport: async () => ({ success: true, message: "Exported" }),
  exportTransferReport: async () => ({ success: true, message: "Exported" }),
  exportSalesReport: async () => ({ success: true, message: "Exported" }),
  exportFinancialReport: async () => ({ success: true, message: "Exported" }),
  exportPendingBillsReport: async () => ({ success: true, message: "Exported" }),
  exportDailyReport: async () => ({ success: true, message: "Exported" }),
  saveDailyTransfer: async (transferData) => {
    if (isElectron) return await window.electronAPI.saveDailyTransfer(transferData);
    const id = await db.daily_transfers.add({
      transfer_date: transferData.transfer_date,
      total_items: transferData.total_items,
      total_quantity: transferData.total_quantity,
      items_transferred: typeof transferData.items_transferred === "string" 
        ? transferData.items_transferred 
        : JSON.stringify(transferData.items_transferred),
      created_at: new Date().toISOString()
    });
    return { id, ...transferData, created_at: new Date().toISOString() };
  },
  getDailyTransfers: async (dateRange) => {
    if (isElectron) return await window.electronAPI.getDailyTransfers(dateRange);
    let query = db.daily_transfers;
    const start = dateRange?.start || dateRange?.startDate;
    const end = dateRange?.end || dateRange?.endDate;
    let transfers;
    if (start && end) {
      transfers = await query.filter(t => t.transfer_date >= start && t.transfer_date <= end).toArray();
    } else {
      transfers = await query.toArray();
    }
    return transfers.map(t => ({
      ...t,
      items_transferred: typeof t.items_transferred === "string" ? JSON.parse(t.items_transferred) : t.items_transferred
    }));
  },
  getStockMovements: async (limit) => {
    if (isElectron) return await window.electronAPI.getStockMovements(limit);
    return []; // Return empty array fallback in Dexie mode
  },
  exportPDF: async (billData) => {
    if (isElectron) return await window.electronAPI.exportPDF(billData);
    return { success: true, filePath: "Downloaded/Saved locally (Bypassed)" };
  },
  resetApplication: async () => {
    if (isElectron) return await window.electronAPI.resetApplication();
    localStorage.removeItem("db_seeded_v2");
    await db.delete();
    window.location.reload();
  },
  closeSellAndGenerateReports: async () => {
    return { success: true };
  }
};
