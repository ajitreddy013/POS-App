require("dotenv").config();
const path = require("path");
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, ".cache/puppeteer");

// Intercept console logs to expose them via endpoint for easy debugging on Render
const logEntries = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  logEntries.push(`[${new Date().toISOString()}] [INFO] ${args.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(" ")}`);
  if (logEntries.length > 500) logEntries.shift();
  originalLog.apply(console, args);
};

console.error = (...args) => {
  logEntries.push(`[${new Date().toISOString()}] [ERROR] ${args.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(" ")}`);
  if (logEntries.length > 500) logEntries.shift();
  originalError.apply(console, args);
};

console.warn = (...args) => {
  logEntries.push(`[${new Date().toISOString()}] [WARN] ${args.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(" ")}`);
  if (logEntries.length > 500) logEntries.shift();
  originalWarn.apply(console, args);
};

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require("express");
const cors = require("cors");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const https = require("https");

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Global State
let connectionStatus = "INITIALIZING"; // INITIALIZING, QR_READY, CONNECTED, DISCONNECTED
let activeQrCode = null; // Store QR code data URI
let sock = null;

// Initialize WhatsApp Client (Baileys)
async function initializeClient() {
  console.log("Initializing WhatsApp Client (Baileys)...");
  connectionStatus = "INITIALIZING";
  activeQrCode = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, ".auth_info_baileys"));
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger: pino({ level: 'silent' }), // Prevent huge memory logs
      browser: ['CounterFlow POS', 'MacOS', '1.0.0'], // Identify as MacOS device
      syncFullHistory: false // Reduce memory footprint further
    });

    // Save credentials whenever they are updated
    sock.ev.on("creds.update", saveCreds);

    // Handle connection updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("QR Code received, converting to Data URI...");
        try {
          activeQrCode = await QRCode.toDataURL(qr);
          connectionStatus = "QR_READY";
        } catch (err) {
          console.error("Failed to generate QR Data URI:", err);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log("WhatsApp connection closed. Reason:", statusCode, "Reconnect:", shouldReconnect);
        
        connectionStatus = "DISCONNECTED";
        activeQrCode = null;

        if (shouldReconnect) {
          console.log("Reconnecting in 3 seconds...");
          setTimeout(initializeClient, 3000);
        } else {
          console.log("User logged out. Session is invalid.");
          cleanupSession();
        }
      } else if (connection === "open") {
        console.log("WhatsApp Client is READY and CONNECTED!");
        connectionStatus = "CONNECTED";
        activeQrCode = null;
      }
    });

  } catch (err) {
    console.error("Error during Baileys initialization:", err);
    connectionStatus = "DISCONNECTED";
  }
}

// Helper to destroy client and delete local auth files
async function cleanupSession() {
  connectionStatus = "DISCONNECTED";
  activeQrCode = null;

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock = null;
    } catch (err) {
      console.error("Error destroying client:", err);
    }
  }

  // Delete auth folder to ensure a fresh scan next time
  const authPath = path.join(__dirname, ".auth_info_baileys");
  if (fs.existsSync(authPath)) {
    try {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log("Deleted .auth_info_baileys session folder.");
    } catch (err) {
      console.error("Failed to delete session folder:", err);
    }
  }

  // Re-initialize client to generate a new QR code
  setTimeout(() => {
    initializeClient();
  }, 3000);
}

// --- EXPRESS ENDPOINTS ---

// Check Status
app.get("/status", (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: activeQrCode
  });
});

// View Deployed Logs
app.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(logEntries.join("\n"));
});

// Send WhatsApp Receipt
app.post("/send", async (req, res) => {
  const { to, message } = req.body;

  if (connectionStatus !== "CONNECTED") {
    return res.status(400).json({
      success: false,
      error: "WhatsApp Client is not connected. Scan the QR code in settings."
    });
  }

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: "Missing fields: 'to' and 'message' are required."
    });
  }

  // Format phone number to WhatsApp format (e.g. 919876543210@s.whatsapp.net)
  let cleanNumber = to.replace(/\D/g, "");
  if (!cleanNumber.endsWith("@s.whatsapp.net")) {
    cleanNumber = `${cleanNumber}@s.whatsapp.net`;
  }

  try {
    console.log(`Sending message to: ${cleanNumber}`);
    const response = await sock.sendMessage(cleanNumber, { text: message });
    res.json({
      success: true,
      messageId: response?.key?.id
    });
  } catch (err) {
    console.error(`Failed to send message to ${cleanNumber}:`, err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to send message."
    });
  }
});

// Logout / Disconnect WhatsApp Link
app.post("/logout", async (req, res) => {
  console.log("Logging out and unlinking WhatsApp...");
  try {
    if (sock && connectionStatus === "CONNECTED") {
      await sock.logout();
    }
    cleanupSession();
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Error during logout:", err);
    cleanupSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- RAZORPAY PAYMENT INTEGRATION ---

// Helper to make authenticated requests to Razorpay
function razorpayRequest(method, path, body, keyId, keySecret) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const options = {
      hostname: "api.razorpay.com",
      port: 443,
      path: path,
      method: method,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error ? parsed.error.description : `HTTP Error ${res.statusCode}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${responseBody}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Create Razorpay Dynamic QR Code
app.post("/payment/create-qr", async (req, res) => {
  const { amount, orderId, keyId, keySecret } = req.body;
  const rzpKeyId = keyId || process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!amount || !orderId || !rzpKeyId || !rzpKeySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: amount, orderId, and Razorpay credentials (keyId/keySecret) must be configured."
    });
  }

  try {
    // Razorpay expects amount in paise (e.g. ₹150.00 is 15000 paise)
    const amountInPaise = Math.round(parseFloat(amount) * 100);
    
    // Set expiration to 10 minutes from now (600 seconds)
    const expireTimestamp = Math.floor(Date.now() / 1000) + 600;

    const payload = {
      type: "upi_qr",
      name: "Food Truck POS",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: amountInPaise,
      description: `Payment for Order #${orderId}`,
      close_by: expireTimestamp
    };

    console.log(`Creating Razorpay QR Code for Order #${orderId}, Amount: ${amountInPaise} paise`);
    const response = await razorpayRequest("POST", "/v1/qr_codes", payload, rzpKeyId, rzpKeySecret);
    
    res.json({
      success: true,
      qrCodeId: response.id,
      qrImageUrl: response.image_url,
      status: response.status
    });
  } catch (err) {
    console.error("Razorpay QR creation failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create QR code."
    });
  }
});

// Check Razorpay QR Payment Status
app.post("/payment/status", async (req, res) => {
  const { qrCodeId, keyId, keySecret } = req.body;
  const rzpKeyId = keyId || process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!qrCodeId || !rzpKeyId || !rzpKeySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: qrCodeId and Razorpay credentials must be configured."
    });
  }

  try {
    console.log(`Checking Razorpay status for QR: ${qrCodeId}`);
    const response = await razorpayRequest("GET", `/v1/qr_codes/${qrCodeId}`, null, rzpKeyId, rzpKeySecret);
    
    // If status is closed or payments_count_received > 0, it's paid
    const isPaid = response.status === "closed" || response.payments_count_received > 0;
    
    res.json({
      success: true,
      paid: isPaid,
      status: response.status,
      paymentsCount: response.payments_count_received
    });
  } catch (err) {
    console.error("Razorpay status check failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch QR status."
    });
  }
});

// Create Razorpay Order for Standard Checkout
app.post("/payment/create-order", async (req, res) => {
  const { amount, orderId, keyId, keySecret } = req.body;
  const rzpKeyId = keyId || process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!amount || !orderId || !rzpKeyId || !rzpKeySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: amount, orderId, and Razorpay credentials must be configured."
    });
  }

  try {
    const amountInPaise = Math.round(parseFloat(amount) * 100);

    const payload = {
      amount: amountInPaise,
      currency: "INR",
      receipt: orderId
    };

    console.log(`Creating Razorpay Order for Receipt #${orderId}, Amount: ${amountInPaise} paise`);
    const response = await razorpayRequest("POST", "/v1/orders", payload, rzpKeyId, rzpKeySecret);
    
    res.json({
      success: true,
      orderId: response.id,
      amount: response.amount,
      currency: response.currency,
      keyId: rzpKeyId // Send the key back so frontend can initialize checkout
    });
  } catch (err) {
    console.error("Razorpay Order creation failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create Order."
    });
  }
});

// Check Razorpay Payment Link Status
app.post("/payment/link-status", async (req, res) => {
  const { paymentLinkId, keyId, keySecret } = req.body;
  const rzpKeyId = keyId || process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!paymentLinkId || !rzpKeyId || !rzpKeySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: paymentLinkId and Razorpay credentials must be configured."
    });
  }

  try {
    console.log(`Checking Razorpay status for Payment Link: ${paymentLinkId}`);
    const response = await razorpayRequest("GET", `/v1/payment_links/${paymentLinkId}`, null, rzpKeyId, rzpKeySecret);
    
    const isPaid = response.status === "paid";
    
    res.json({
      success: true,
      paid: isPaid,
      status: response.status
    });
  } catch (err) {
    console.error("Razorpay Payment Link status check failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch Payment Link status."
    });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`WhatsApp Cloud-Relay Server running on port ${port}`);
  initializeClient();
});
