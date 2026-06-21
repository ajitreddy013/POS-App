import { getLocalDateTimeString } from "../utils/dateUtils";

export const whatsappService = {
  getStatus: async (relayUrl) => {
    if (!relayUrl) return { status: "DISCONNECTED", error: "Relay URL not configured" };
    try {
      const cleanUrl = relayUrl.replace(/\/$/, ""); // Remove trailing slash
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      
      const response = await fetch(`${cleanUrl}/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error("Failed to check WhatsApp relay status:", err);
      return { status: "DISCONNECTED", error: err.name === "AbortError" ? "Request timed out" : err.message };
    }
  },

  // Disconnect / Logout linked WhatsApp device
  logout: async (relayUrl) => {
    if (!relayUrl) return { success: false, error: "Relay URL not configured" };
    try {
      const cleanUrl = relayUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanUrl}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      return await response.json();
    } catch (err) {
      console.error("Failed to logout WhatsApp relay:", err);
      return { success: false, error: err.message };
    }
  },

  // Format bill details into a compact text receipt and send it
  sendBill: async (relayUrl, settings, billData) => {
    if (!relayUrl) return { success: false, error: "WhatsApp Relay URL not set in Settings" };

    // Ensure phone number has country code (defaults to 91 for India if not specified)
    let phone = billData.customerPhone ? billData.customerPhone.trim() : "";
    if (!phone) return { success: false, error: "Customer phone number is required" };
    
    // Remove non-digits
    phone = phone.replace(/\D/g, "");
    const defaultCountryCode = settings.whatsapp_default_country_code || "91";
    if (phone.length === 10) {
      phone = `${defaultCountryCode}${phone}`;
    }

    const name = billData.customerName || 'Customer';
    const tableText = billData.tableNumber === 'Parcel' || !billData.tableNumber ? 'Parcel / Takeaway' : `Table ${billData.tableNumber}`;
    const orderNumber = billData.billNumber || billData.saleNumber;

    const isCash = billData.paymentMethod.toLowerCase() === "cash";
    const paymentHeader = isCash 
      ? `*🔴 CASH PAYMENT - PAY AT COUNTER 🔴*`
      : `*🟢 PAID VIA UPI (ONLINE) 🟢*`;

    const greeting = `Hi *${name}*,\nWe have received your order *#${orderNumber}* for *${tableText}*.`;

    let storeHeader = `🍔 *${settings.bar_name || "CounterFlow Food Truck"}* 🍔`;
    if (settings.address) {
      storeHeader += `\n📍 ${settings.address}`;
    }
    if (settings.contact_number) {
      storeHeader += `\n📞 ${settings.contact_number}`;
    }
    if (settings.gst_number) {
      storeHeader += `\nGSTIN: ${settings.gst_number}`;
    }

    const divider = `------------------------------------`;
    const dateStr = `Date: ${billData.saleDate || getLocalDateTimeString()}`;

    // Format receipt items list in a monospaced block for perfect alignment on WhatsApp
    // Total width = 24 characters to prevent wrapping on narrow mobile screens
    const itemsHeader = `Item         Qty   Amt\n------------------------`;
    const itemsList = billData.items.map(item => {
      const nameStr = item.name.substring(0, 12).padEnd(12);
      const qtyStr = item.quantity.toString().padStart(2);
      const amtStr = (item.unitPrice * item.quantity).toFixed(2).padStart(8);
      return `${nameStr} ${qtyStr} ${amtStr}`;
    }).join("\n");
    
    // Add Subtotal and Total inside the code block so they align with the Amount column
    let summaryList = `------------------------\n`;
    summaryList += "Subtotal:".padStart(15) + " " + billData.subtotal.toFixed(2).padStart(8);
    
    if (billData.discountAmount > 0) {
      summaryList += "\n" + "Discount:".padStart(15) + " " + ("-" + billData.discountAmount.toFixed(2)).padStart(8);
    }
    if (billData.taxAmount > 0) {
      summaryList += "\n" + "Tax:".padStart(15) + " " + billData.taxAmount.toFixed(2).padStart(8);
    }
    summaryList += "\n" + "Total:".padStart(15) + " " + ("₹" + billData.totalAmount.toFixed(2)).padStart(8);

    // Triple backticks force WhatsApp to use a monospaced font
    const receiptTable = "```\n" + itemsHeader + "\n" + itemsList + "\n" + summaryList + "\n```";

    const footerInstruction = isCash 
      ? `*Please pay Cash at the counter* while the kitchen prepares your delicious order! 😋`
      : `Please wait while the kitchen prepares your delicious order! 😋`;

    const footerText = settings.thank_you_message || "Thank you for visiting! Please visit again.";

    // Assemble the complete message
    const message = `${paymentHeader}

${greeting}

${storeHeader}
${divider}
Order No: ${orderNumber}
${dateStr}

${receiptTable}

${divider}
${footerInstruction}
${footerText}`;

    try {
      const cleanUrl = relayUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          message: message
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `HTTP error: ${response.status}`);
      }
      return result;
    } catch (err) {
      console.error("Failed to send WhatsApp bill:", err);
      return { success: false, error: err.message };
    }
  }
};
