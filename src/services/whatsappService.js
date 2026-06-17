import { getLocalDateTimeString } from "../utils/dateUtils";

export const whatsappService = {
  // Check the connection status of the WhatsApp Cloud-Relay
  getStatus: async (relayUrl) => {
    if (!relayUrl) return { status: "DISCONNECTED", error: "Relay URL not configured" };
    try {
      const cleanUrl = relayUrl.replace(/\/$/, ""); // Remove trailing slash
      const response = await fetch(`${cleanUrl}/status`);
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error("Failed to check WhatsApp relay status:", err);
      return { status: "DISCONNECTED", error: err.message };
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

    // Format receipt items list
    const itemsHeader = `*Qty  Item Name           Price*`;
    const itemsList = billData.items.map(item => {
      const qtyStr = `${item.quantity}x`.padEnd(5);
      const nameStr = item.name.substring(0, 18).padEnd(19);
      const priceStr = `₹${(item.unitPrice * item.quantity).toFixed(2)}`;
      return `${qtyStr}${nameStr}${priceStr}`;
    }).join("\n");

    const divider = `------------------------------------`;
    const headerTitle = `🍔 *${settings.bar_name || "CounterFlow Food Truck"}* 🍔`;
    const billNo = `Bill No: ${billData.billNumber || billData.saleNumber}`;
    const dateStr = `Date: ${billData.saleDate || getLocalDateTimeString()}`;

    let summaryStr = `Subtotal: ₹${billData.subtotal.toFixed(2)}`;
    if (billData.discountAmount > 0) {
      summaryStr += `\nDiscount: -₹${billData.discountAmount.toFixed(2)}`;
    }
    if (billData.taxAmount > 0) {
      summaryStr += `\nTax: ₹${billData.taxAmount.toFixed(2)}`;
    }
    summaryStr += `\n*Total: ₹${billData.totalAmount.toFixed(2)}*`;

    const paymentStr = `Payment: ${billData.paymentMethod.toUpperCase()}`;
    const footerStr = settings.thank_you_message || "Thank you for visiting! Please visit again.";

    // Assemble the complete message
    const message = `${headerTitle}
${divider}
${billNo}
${dateStr}
${divider}
${itemsHeader}
${itemsList}
${divider}
${summaryStr}
${paymentStr}
${divider}
${footerStr}`;

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
