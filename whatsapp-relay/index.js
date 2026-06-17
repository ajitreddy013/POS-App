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
const { Client, LocalAuth } = require("whatsapp-web.js");
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
let client = null;

// Initialize WhatsApp Client
function initializeClient() {
  console.log("Initializing WhatsApp Client...");
  connectionStatus = "INITIALIZING";
  activeQrCode = null;

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, ".wwebjs_auth")
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--js-flags=--max-old-space-size=80"
      ]
    }
  });

  // Client Event Handlers
  client.on("qr", async (qr) => {
    console.log("QR Code received, converting to Data URI...");
    try {
      activeQrCode = await QRCode.toDataURL(qr);
      connectionStatus = "QR_READY";
    } catch (err) {
      console.error("Failed to generate QR Data URI:", err);
    }
  });

  client.on("ready", () => {
    console.log("WhatsApp Client is READY and CONNECTED!");
    connectionStatus = "CONNECTED";
    activeQrCode = null;
  });

  client.on("authenticated", () => {
    console.log("WhatsApp Client authenticated successfully. Syncing chats...");
    connectionStatus = "AUTHENTICATING";
    activeQrCode = null;
  });

  client.on("auth_failure", (msg) => {
    console.error("WhatsApp Authentication failure:", msg);
    cleanupSession();
  });

  client.on("disconnected", (reason) => {
    console.log("WhatsApp Client disconnected:", reason);
    handleDisconnect(reason);
  });

  client.initialize().catch((err) => {
    console.error("Error during client initialization:", err);
    connectionStatus = "DISCONNECTED";
  });
}

// Helper to destroy client and delete local auth files
async function cleanupSession() {
  connectionStatus = "DISCONNECTED";
  activeQrCode = null;

  if (client) {
    try {
      client.removeAllListeners();
      await client.destroy();
    } catch (err) {
      console.error("Error destroying client:", err);
    }
    client = null;
  }

  // Delete auth folder to ensure a fresh scan next time
  const authPath = path.join(__dirname, ".wwebjs_auth");
  if (fs.existsSync(authPath)) {
    try {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log("Deleted .wwebjs_auth session folder.");
    } catch (err) {
      console.error("Failed to delete session folder:", err);
    }
  }

  // Re-initialize client to generate a new QR code
  setTimeout(() => {
    initializeClient();
  }, 3000);
}

// Helper to handle unexpected disconnect without deleting the session files
async function handleDisconnect(reason) {
  console.log(`Handling unexpected disconnect. Reason: ${reason}`);
  
  if (reason === 'LOGOUT') {
    console.log("User logged out. Cleaning up session entirely...");
    return cleanupSession();
  }

  connectionStatus = "DISCONNECTED";
  activeQrCode = null;

  if (client) {
    try {
      client.removeAllListeners();
      await client.destroy();
    } catch (err) {
      console.error("Error destroying client on disconnect:", err);
    }
    client = null;
  }

  console.log("Re-initializing client to attempt automatic reconnection...");
  setTimeout(() => {
    initializeClient();
  }, 5000);
}

// Gracefully restart client without logging out (preserving session files)
async function restartClient() {
  console.log("Gracefully restarting WhatsApp client to reclaim memory...");
  connectionStatus = "INITIALIZING";
  activeQrCode = null;

  
  if (client) {
    try {
      client.removeAllListeners();
      await client.destroy();
    } catch (err) {
      console.error("Error destroying client during restart:", err);
    }
  }
  
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

  // Format phone number to WhatsApp format (e.g. 919876543210@c.us)
  let cleanNumber = to.replace(/\D/g, "");
  if (!cleanNumber.endsWith("@c.us")) {
    cleanNumber = `${cleanNumber}@c.us`;
  }

  try {
    console.log(`Sending message to: ${cleanNumber}`);
    const response = await client.sendMessage(cleanNumber, message);
    res.json({
      success: true,
      messageId: response.id.id
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
    if (client && connectionStatus === "CONNECTED") {
      await client.logout();
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
  startMemoryMonitor();
});

// Monitor memory usage and restart if exceeding threshold to fit 512MB Render free tier
function startMemoryMonitor() {
  // Check memory every 3 minutes
  setInterval(() => {
    try {
      const mem = process.memoryUsage();
      const rssMB = Math.round(mem.rss / 1024 / 1024);
      const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
      console.log(`[Memory Monitor] Node Process RSS: ${rssMB}MB, Heap Used: ${heapUsedMB}MB`);
      
      // If RSS exceeds 200MB, trigger a restart to free memory
      if (rssMB > 200) {
        console.warn(`[Memory Monitor] RSS memory usage (${rssMB}MB) exceeded 200MB. Restarting client to release Chromium...`);
        restartClient();
      }
    } catch (err) {
      console.error("Failed to run memory monitor:", err);
    }
  }, 3 * 60 * 1000);
}
