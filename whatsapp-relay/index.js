const path = require("path");
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, ".cache/puppeteer");

const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const path = require("path");
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
        "--disable-gpu"
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
    console.log("WhatsApp Client authenticated successfully.");
  });

  client.on("auth_failure", (msg) => {
    console.error("WhatsApp Authentication failure:", msg);
    cleanupSession();
  });

  client.on("disconnected", (reason) => {
    console.log("WhatsApp Client disconnected:", reason);
    cleanupSession();
  });

  client.initialize().catch((err) => {
    console.error("Error during client initialization:", err);
    connectionStatus = "DISCONNECTED";
  });
}

// Helper to destroy client and delete local auth files
function cleanupSession() {
  connectionStatus = "DISCONNECTED";
  activeQrCode = null;

  if (client) {
    try {
      client.destroy();
    } catch (err) {
      console.error("Error destroying client:", err);
    }
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

// --- EXPRESS ENDPOINTS ---

// Check Status
app.get("/status", (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: activeQrCode
  });
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

  if (!amount || !orderId || !keyId || !keySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: amount, orderId, keyId, and keySecret are required."
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
    const response = await razorpayRequest("POST", "/v1/qr_codes", payload, keyId, keySecret);
    
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

  if (!qrCodeId || !keyId || !keySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: qrCodeId, keyId, and keySecret are required."
    });
  }

  try {
    console.log(`Checking Razorpay status for QR: ${qrCodeId}`);
    const response = await razorpayRequest("GET", `/v1/qr_codes/${qrCodeId}`, null, keyId, keySecret);
    
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

// Create Razorpay Payment Link
app.post("/payment/create-link", async (req, res) => {
  const { amount, orderId, customerName, customerPhone, keyId, keySecret } = req.body;

  if (!amount || !orderId || !keyId || !keySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: amount, orderId, keyId, and keySecret are required."
    });
  }

  try {
    const amountInPaise = Math.round(parseFloat(amount) * 100);
    const expireTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes

    const payload = {
      amount: amountInPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: orderId,
      description: `Payment for Order #${orderId}`,
      customer: {
        name: customerName || "Walk-in Customer",
        contact: customerPhone ? `+91${customerPhone.replace(/\D/g, "")}` : undefined
      },
      notify: {
        sms: false,
        email: false
      },
      reminder_enable: false,
      expire_by: expireTimestamp
    };

    console.log(`Creating Razorpay Payment Link for Order #${orderId}, Amount: ${amountInPaise} paise`);
    const response = await razorpayRequest("POST", "/v1/payment_links", payload, keyId, keySecret);
    
    res.json({
      success: true,
      paymentLinkId: response.id,
      shortUrl: response.short_url,
      status: response.status
    });
  } catch (err) {
    console.error("Razorpay Payment Link creation failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create Payment Link."
    });
  }
});

// Check Razorpay Payment Link Status
app.post("/payment/link-status", async (req, res) => {
  const { paymentLinkId, keyId, keySecret } = req.body;

  if (!paymentLinkId || !keyId || !keySecret) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: paymentLinkId, keyId, and keySecret are required."
    });
  }

  try {
    console.log(`Checking Razorpay status for Payment Link: ${paymentLinkId}`);
    const response = await razorpayRequest("GET", `/v1/payment_links/${paymentLinkId}`, null, keyId, keySecret);
    
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
