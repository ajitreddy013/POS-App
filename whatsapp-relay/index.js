require('dotenv').config();
const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache/puppeteer');

// Intercept console logs to expose them via endpoint for easy debugging on Render
const logEntries = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  logEntries.push(
    `[${new Date().toISOString()}] [INFO] ${args.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')}`
  );
  if (logEntries.length > 500) logEntries.shift();
  originalLog.apply(console, args);
};

console.error = (...args) => {
  logEntries.push(
    `[${new Date().toISOString()}] [ERROR] ${args.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')}`
  );
  if (logEntries.length > 500) logEntries.shift();
  originalError.apply(console, args);
};

console.warn = (...args) => {
  logEntries.push(
    `[${new Date().toISOString()}] [WARN] ${args.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')}`
  );
  if (logEntries.length > 500) logEntries.shift();
  originalWarn.apply(console, args);
};

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const cors = require('cors');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const https = require('https');

// Initialize Firebase Admin SDK (v14+ modular API)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccountPath = path.join(__dirname, 'service-account.json');

// Use a flag instead of admin.apps.length which is unreliable in firebase-admin v14+
let firebaseInitialized = false;

if (fs.existsSync(serviceAccountPath)) {
  console.log(
    'Initializing Firebase Admin SDK using local service-account.json...'
  );
  try {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({ credential: cert(serviceAccount) });
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.error(
      'Failed to initialize Firebase Admin SDK using service-account.json:',
      err
    );
  }
} else if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  console.log('Initializing Firebase Admin SDK using Environment Variables...');
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    firebaseInitialized = true;
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
} else {
  console.warn(
    'Firebase credentials not found (no service-account.json or environment variables). Cloud integrations disabled.'
  );
}

const app = express();
const port = process.env.PORT || 8080;
const relayVersion = '2026-06-28-delivery-webhook-fix-v5';

app.use(cors());
app.use(express.json());

// Global State
let connectionStatus = 'INITIALIZING'; // INITIALIZING, QR_READY, CONNECTED, DISCONNECTED
let activeQrCode = null; // Store QR code data URI
let sock = null;

// Initialize WhatsApp Client (Baileys)
async function initializeClient() {
  console.log('Initializing WhatsApp Client (Baileys)...');
  connectionStatus = 'INITIALIZING';
  activeQrCode = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, '.auth_info_baileys')
    );
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger: pino({ level: 'silent' }), // Prevent huge memory logs
      browser: ['CounterFlow POS', 'MacOS', '1.0.0'], // Identify as MacOS device
      syncFullHistory: false, // Reduce memory footprint further
    });

    // Save credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('QR Code received, converting to Data URI...');
        try {
          activeQrCode = await QRCode.toDataURL(qr);
          connectionStatus = 'QR_READY';
        } catch (err) {
          console.error('Failed to generate QR Data URI:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(
          'WhatsApp connection closed. Reason:',
          statusCode,
          'Reconnect:',
          shouldReconnect
        );

        connectionStatus = 'DISCONNECTED';
        activeQrCode = null;

        if (shouldReconnect) {
          console.log('Reconnecting in 3 seconds...');
          setTimeout(initializeClient, 3000);
        } else {
          console.log('User logged out. Session is invalid.');
          cleanupSession();
        }
      } else if (connection === 'open') {
        console.log('WhatsApp Client is READY and CONNECTED!');
        connectionStatus = 'CONNECTED';
        activeQrCode = null;
      }
    });
  } catch (err) {
    console.error('Error during Baileys initialization:', err);
    connectionStatus = 'DISCONNECTED';
  }
}

// Helper to destroy client and delete local auth files
async function cleanupSession() {
  connectionStatus = 'DISCONNECTED';
  activeQrCode = null;

  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock = null;
    } catch (err) {
      console.error('Error destroying client:', err);
    }
  }

  // Delete auth folder to ensure a fresh scan next time
  const authPath = path.join(__dirname, '.auth_info_baileys');
  if (fs.existsSync(authPath)) {
    try {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('Deleted .auth_info_baileys session folder.');
    } catch (err) {
      console.error('Failed to delete session folder:', err);
    }
  }

  // Re-initialize client to generate a new QR code
  setTimeout(() => {
    initializeClient();
  }, 3000);
}

// Helper to format phone number to WhatsApp format (e.g. 919876543210@s.whatsapp.net)
function formatWhatsAppNumber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  // If it's exactly 10 digits, assume it's an Indian number and prepend country code 91
  if (clean.length === 10) {
    clean = `91${clean}`;
  }
  // Ensure it ends with @s.whatsapp.net suffix
  if (!clean.endsWith('@s.whatsapp.net')) {
    clean = `${clean}@s.whatsapp.net`;
  }
  return clean;
}

// Helper to retrieve settings dynamically from Firestore
async function getShopSettings() {
  let settings = {
    bar_name: 'Malabar Waffle',
    address: '',
    contact_number: '',
    gst_number: '',
    thank_you_message: 'Thank you for visiting! Please visit again.'
  };
  if (firebaseInitialized) {
    try {
      const db = getFirestore();
      const settingsDoc = await db.collection('settings').doc('bar_settings').get();
      if (settingsDoc.exists) {
        const data = settingsDoc.data();
        settings.bar_name = data.bar_name || settings.bar_name;
        settings.address = data.address || '';
        settings.contact_number = data.contact_number || '';
        settings.gst_number = data.gst_number || '';
        settings.thank_you_message = data.thank_you_message || settings.thank_you_message;
      }
    } catch (err) {
      console.warn('Failed to load shop settings:', err.message);
    }
  }
  return settings;
}

// Unified template formatting builder
function buildUnifiedReceiptMessage(shopName, settings, orderData) {
  const {
    orderNumber,
    customerName,
    customerPhone,
    tableNumber,
    totalAmount,
    paymentMethod,
    paymentStatus,
    items = [],
    subtotal = 0,
    discountAmount = 0,
    taxAmount = 0,
    deliveryFee = 0,
    orderType = 'dine_in',
    deliveryAddress = null,
  } = orderData;

  const name = customerName || 'Customer';
  const isDelivery = orderType === 'delivery';

  // Status Header
  const isPaid = paymentStatus === 'paid' || paymentMethod === 'upi';
  let statusHeader;
  if (isDelivery) {
    statusHeader = isPaid
      ? `*🟢 DELIVERY ORDER — PAID ONLINE 🟢*`
      : `*🛵 DELIVERY ORDER — CASH ON DELIVERY 🛵*`;
  } else {
    statusHeader = isPaid
      ? `*🟢 PAID VIA UPI (ONLINE) 🟢*`
      : `*🔴 CASH PAYMENT - PAY AT COUNTER 🔴*`;
  }

  // Personalized greeting
  const hasTable = tableNumber && tableNumber !== 'Parcel' && tableNumber !== 'Takeaway' && tableNumber !== 'Kiosk' && tableNumber !== 'Website' && tableNumber !== 'Online';
  const tableSuffix = hasTable ? ` for *Table ${tableNumber}*` : '';
  const greeting = `Hi *${name}*,\nWe have received your ${isPaid ? 'payment & ' : ''}order *#${orderNumber}*${tableSuffix}.`;

  // Store info header
  let storeHeader = `*${shopName}*`;
  if (settings.address) {
    storeHeader += `\n${settings.address}`;
  }
  if (settings.contact_number) {
    storeHeader += `\n${settings.contact_number}`;
  }
  if (settings.gst_number) {
    storeHeader += `\nGSTIN: ${settings.gst_number}`;
  }

  // Receipt details
  const divider = `------------------------------------`;
  const dateStr = `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Items list monospaced table (if items are available)
  let receiptTable = '';
  if (items && items.length > 0) {
    const itemsHeader = `Item         Qty   Amt\n------------------------`;
    const itemsList = items.map(item => {
      const nameStr = (item.name || '').substring(0, 12).padEnd(12);
      const qtyStr = (item.quantity || 1).toString().padStart(2);
      const amtStr = (item.totalPrice || (item.unitPrice * item.quantity) || 0).toFixed(2).padStart(8);
      return `${nameStr} ${qtyStr} ${amtStr}`;
    }).join('\n');

    const calcSubtotal = subtotal || items.reduce((sum, item) => sum + (item.totalPrice || (item.unitPrice * item.quantity) || 0), 0);

    const fmtAmt = (val, sign = '') => (sign + '₹' + Number(Math.abs(val)).toFixed(2)).padStart(10);

    let summaryList = `------------------------\n`;
    summaryList += "Subtotal".padEnd(14) + fmtAmt(calcSubtotal);

    if (discountAmount > 0) {
      summaryList += "\n" + "Discount".padEnd(14) + fmtAmt(discountAmount, '-');
    }
    if (taxAmount > 0) {
      summaryList += "\n" + "Tax".padEnd(14) + fmtAmt(taxAmount);
    }
    if (deliveryFee > 0) {
      summaryList += "\n" + "Delivery".padEnd(14) + fmtAmt(deliveryFee);
    }
    summaryList += "\n------------------------\n" + "TOTAL".padEnd(14) + fmtAmt(totalAmount);

    receiptTable = "\n```\n" + itemsHeader + "\n" + itemsList + "\n" + summaryList + "\n```\n";
  } else {
    receiptTable = `\nTotal Amount: *₹${Number(totalAmount).toFixed(2)}*\n`;
  }

  // Footer instruction
  let footerInstruction;
  if (isDelivery) {
    footerInstruction = isPaid
      ? `Our delivery team will contact you and bring your order to your address! 🛵`
      : `*Please keep cash ready for our delivery agent!* 🛵`;
  } else {
    footerInstruction = isPaid
      ? `Please wait while the kitchen prepares your delicious order! 😋`
      : `*Please pay Cash at the counter* while the kitchen prepares your delicious order! 😋`;
  }

  const footerText = settings.thank_you_message || "Thank you for visiting! Please visit again.";

  // Delivery address block
  let deliveryBlock = '';
  if (isDelivery && deliveryAddress) {
    deliveryBlock = `\n*Deliver to:*\n${deliveryAddress.address || ''}${deliveryAddress.landmark ? ', ' + deliveryAddress.landmark : ''}\nPincode: ${deliveryAddress.pincode || ''}\n`;
  }

  // Assemble the message
  return `${statusHeader}

${greeting}
${deliveryBlock}
${storeHeader}
${divider}
Order No: ${orderNumber}
${dateStr}
${receiptTable}
${divider}
${footerInstruction}
${footerText}`;
}

// --- EXPRESS ENDPOINTS ---

// Health / deployment diagnostics
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'whatsapp-relay',
    version: relayVersion,
  });
});

// Check Status
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: activeQrCode,
  });
});

// View Deployed Logs
app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(logEntries.join('\n'));
});

// Send WhatsApp Receipt
app.post('/send', async (req, res) => {
  const { to, message } = req.body;

  if (connectionStatus !== 'CONNECTED') {
    return res.status(400).json({
      success: false,
      error: 'WhatsApp Client is not connected. Scan the QR code in settings.',
    });
  }

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: "Missing fields: 'to' and 'message' are required.",
    });
  }

  // Format phone number to WhatsApp format
  const cleanNumber = formatWhatsAppNumber(to);

  try {
    console.log(`Sending message to: ${cleanNumber}`);
    const response = await sock.sendMessage(cleanNumber, { text: message });
    res.json({
      success: true,
      messageId: response?.key?.id,
    });
  } catch (err) {
    console.error(`Failed to send message to ${cleanNumber}:`, err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to send message.',
    });
  }
});

// Logout / Disconnect WhatsApp Link
app.post('/logout', async (req, res) => {
  console.log('Logging out and unlinking WhatsApp...');
  try {
    if (sock && connectionStatus === 'CONNECTED') {
      await sock.logout();
    }
    cleanupSession();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error during logout:', err);
    cleanupSession();
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- PAYMENT INTEGRATION ---

// Helper to make authenticated requests to Cashfree
function cashfreeRequest(method, path, body, clientHeaders = {}) {
  return new Promise((resolve, reject) => {
    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    const isProd = (process.env.CASHFREE_ENV || '').toUpperCase() === 'PRODUCTION' || (process.env.CASHFREE_ENV || '').toUpperCase() === 'PROD';
    
    if (!clientId || !clientSecret) {
      return reject(new Error('Cashfree credentials (CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET) are missing.'));
    }

    const hostname = isProd ? 'api.cashfree.com' : 'sandbox.cashfree.com';
    const basePath = `/pg${path}`;
    const data = body ? JSON.stringify(body) : '';

    const options = {
      hostname: hostname,
      port: 443,
      path: basePath,
      method: method,
      headers: {
        'x-api-version': '2023-08-01',
        'x-client-id': clientId,
        'x-client-secret': clientSecret,
        'x-client-device': clientHeaders['x-client-device'] || 'mobile',
        'x-client-os': clientHeaders['x-client-os'] || 'android',
        'x-client-rendering-type': clientHeaders['x-client-rendering-type'] || 'mweb',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const errorMessage = parsed.message || `HTTP Error ${res.statusCode}: ${responseBody}`;
            reject(new Error(errorMessage));
          }
        } catch (err) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            reject(new Error(`Failed to parse response: ${responseBody}`));
          } else {
            reject(new Error(`HTTP Error ${res.statusCode}: ${responseBody}`));
          }
        }
      });
    });

    req.on('error', (err) => { reject(err); });

    if (data) { req.write(data); }
    req.end();
  });
}



// Create Cashfree PG Order
app.post('/payment/cashfree/create-order', async (req, res) => {
  const { amount, orderId, phone, name, isKiosk } = req.body;
  const cfClientId = process.env.CASHFREE_CLIENT_ID;
  const cfClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const cfEnv = process.env.CASHFREE_ENV || 'TEST';

  if (!amount || !orderId || !cfClientId || !cfClientSecret) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: amount and orderId must be provided, and Cashfree credentials must be configured on the server.',
    });
  }

  try {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `91${formattedPhone}`;
    }
    if (formattedPhone.length < 10) {
      formattedPhone = '919999999999';
    }

    // For kiosk, append timestamp so retries don't clash with existing CF orders
    const cfOrderId = isKiosk ? `${String(orderId)}_${Date.now()}` : String(orderId);

    const payload = {
      order_id: cfOrderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${String(orderId)}`,
        customer_phone: formattedPhone.slice(-10),
        customer_name: name || 'Customer',
        customer_email: 'customer@malabarwaffle.com',
      },
      order_meta: {
        return_url: isKiosk
          ? 'https://pos-app-nqsm.onrender.com/payment-done'
          : (req.body.returnUrl || `${req.headers.origin || 'https://counterflow-kiosk.web.app'}/?payment=success&orderId=${orderId}`),
        notify_url: 'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
      },
      order_note: `Order ${orderId}`,
      order_tags: {
        order_number: String(orderId)
      }
    };

    // If Kiosk/Counter Mode, restrict to UPI (using correct order_meta nested structure)
    if (isKiosk || !req.body.returnUrl) {
      payload.order_meta.payment_methods_filters = {
        methods: {
          action: 'ALLOW',
          values: ['upi']
        }
      };
    }

    // Set desktop device headers for Kiosk Mode checkouts to force QR code view by default on Cashfree
    let clientHeaders = {};
    if (isKiosk) {
      clientHeaders = {
        'x-client-device': 'desktop',
        'x-client-os': 'windows',
        'x-client-rendering-type': 'web'
      };
    }

    console.log(`Creating Cashfree Order for ${orderId} (CF id: ${cfOrderId}), isKiosk: ${isKiosk}, Amount: ${payload.order_amount}`);
    const response = await cashfreeRequest('POST', '/orders', payload, clientHeaders);

    const isProd = cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';

    // Construct the checkout redirect link pointing to our customer website's SDK checkout page
    // For kiosk, always use the customer website base so the CF SDK checkout page loads correctly
    const webBase = isKiosk
      ? 'https://counterflow-kiosk.web.app'
      : (req.body.returnUrl
          ? new URL(req.body.returnUrl).origin
          : (req.headers.origin || 'https://counterflow-kiosk.web.app'));
    const paymentLink = `${webBase}/#/checkout?sessionId=${response.payment_session_id}&env=${isProd ? 'production' : 'sandbox'}`;

    console.log(`Cashfree Order ${response.order_id} created. Payment link: ${paymentLink}`);

    res.json({
      success: true,
      paymentSessionId: response.payment_session_id,
      cfOrderId: response.order_id,
      orderId: response.order_id,
      environment: isProd ? 'production' : 'sandbox',
      upiLink: '',
      paymentLink: paymentLink,
    });
  } catch (err) {
    console.error('Cashfree Order creation failed:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Cashfree Order.',
    });
  }
});

// Payment-done landing page — Cashfree return_url for kiosk browser payments
app.get('/payment-done', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f0fdf4; color: #166534; }
    .icon { font-size: 72px; margin-bottom: 16px; }
    h1 { font-size: 1.6rem; margin: 0 0 8px; }
    p { color: #4b5563; font-size: 1rem; margin: 4px 0; }
    button { margin-top: 24px; padding: 10px 28px; font-size: 1rem; font-weight: 700;
             background: #166534; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <h1>Payment Successful!</h1>
  <p>Returning to app…</p>
  <button onclick="window.close()">Return to App</button>
  <script>
    try {
      if (window.opener && !window.opener.closed) { window.opener.focus(); }
    } catch(e) {}
    window.close();
  </script>
</body>
</html>`);
});

// Kiosk hosted payment — creates Cashfree order, returns native Cashfree hosted page URL
// App opens this URL in the external browser; webhook confirms payment via Firestore.
app.post('/payment/cashfree/kiosk-order', async (req, res) => {
  const { amount, orderId, phone, name } = req.body;
  const cfClientId = process.env.CASHFREE_CLIENT_ID;
  const cfClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const cfEnv = process.env.CASHFREE_ENV || 'TEST';

  if (!amount || !orderId || !cfClientId || !cfClientSecret) {
    return res.status(400).json({ success: false, error: 'Missing required fields or Cashfree credentials.' });
  }

  try {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
    if (formattedPhone.length < 10) formattedPhone = '919999999999';

    const isProd = cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';
    const cfOrderId = `${String(orderId)}_${Date.now()}`;

    const payload = {
      order_id: cfOrderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${String(orderId)}`,
        customer_phone: formattedPhone.slice(-10),
        customer_name: name || 'Customer',
        customer_email: 'customer@malabarwaffle.com',
      },
      order_meta: {
        return_url: 'https://pos-app-nqsm.onrender.com/payment-done',
        notify_url: 'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
        payment_methods: 'upi',
      },
      order_note: `Order #${orderId}`,
      order_tags: { order_number: String(orderId) },
    };

    const clientHeaders = {
      'x-client-device': 'desktop',
      'x-client-os': 'windows',
      'x-client-rendering-type': 'web',
    };

    console.log(`[Kiosk Order] Creating Cashfree order for POS #${orderId}, CF ID: ${cfOrderId}`);
    const order = await cashfreeRequest('POST', '/orders', payload, clientHeaders);
    console.log(`[Kiosk Order] CF order response keys: ${Object.keys(order).join(', ')}`);
    console.log(`[Kiosk Order] payment_link: ${order.payment_link}, session: ${order.payment_session_id}`);

    // Use Cashfree's own payment_link if present, otherwise construct from session ID
    const hostedUrl = order.payment_link
      || (isProd
        ? `https://payments.cashfree.com/order/#${order.payment_session_id}`
        : `https://sandbox.cashfree.com/order/#${order.payment_session_id}`);

    console.log(`[Kiosk Order] Hosted URL: ${hostedUrl}`);

    res.json({
      success: true,
      cfOrderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      hostedUrl,
      environment: isProd ? 'production' : 'sandbox',
    });
  } catch (err) {
    console.error('[Kiosk Order] Failed:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to create kiosk order.' });
  }
});

// Check Cashfree order payment status by CF order ID
app.post('/payment/cashfree/order-status', async (req, res) => {
  const { cfOrderId } = req.body;
  if (!cfOrderId) return res.status(400).json({ success: false, error: 'Missing cfOrderId.' });
  try {
    const order = await cashfreeRequest('GET', `/orders/${cfOrderId}`);
    const paid = order.order_status === 'PAID';
    console.log(`[Order Status] CF order ${cfOrderId}: ${order.order_status}`);
    res.json({ success: true, status: order.order_status, paid });
  } catch (err) {
    console.error(`[Order Status] Failed for ${cfOrderId}:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cashfree UPI QR — create order + initiate UPI QR in one call
// Returns a base64 QR image the app renders in-app; webhook fires when customer pays.
app.post('/payment/cashfree/upi-qr', async (req, res) => {
  const { amount, orderId, phone, name } = req.body;
  const cfClientId = process.env.CASHFREE_CLIENT_ID;
  const cfClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const cfEnv = process.env.CASHFREE_ENV || 'TEST';

  if (!amount || !orderId || !cfClientId || !cfClientSecret) {
    return res.status(400).json({ success: false, error: 'Missing required fields or Cashfree credentials.' });
  }

  try {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
    if (formattedPhone.length < 10) formattedPhone = '919999999999';

    const isProd = cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';

    // 1. Create the order
    const cfOrderId = `${String(orderId)}_${Date.now()}`;
    const orderPayload = {
      order_id: cfOrderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${String(orderId)}`,
        customer_phone: formattedPhone.slice(-10),
        customer_name: name || 'Customer',
        customer_email: 'customer@malabarwaffle.com',
      },
      order_meta: {
        notify_url: 'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
      },
      order_note: `Order ${orderId}`,
      order_tags: { order_number: String(orderId) },
    };

    console.log(`[UPI QR] Creating Cashfree order for ${orderId}, amount: ${orderPayload.order_amount}`);
    const order = await cashfreeRequest('POST', '/orders', orderPayload);

    // 2. Initiate UPI QR payment — Cashfree returns a base64 QR image
    const payPayload = {
      payment_session_id: order.payment_session_id,
      payment_method: {
        upi: {
          channel: 'qrcode',
        },
      },
    };

    console.log(`[UPI QR] Initiating UPI QR for order ${order.order_id}`);
    const payResponse = await cashfreeRequest('POST', '/orders/pay', payPayload);
    console.log(`[UPI QR] Pay response for ${order.order_id}:`, JSON.stringify(payResponse));

    const qrData = payResponse?.data?.payload?.qrcode || '';

    if (!qrData) {
      console.error('[UPI QR] No QR data returned. Full response:', JSON.stringify(payResponse));
      return res.status(502).json({ success: false, error: 'Cashfree did not return a UPI QR code. Check logs.' });
    }

    res.json({
      success: true,
      orderId: order.order_id,
      cfPaymentId: payResponse.cf_payment_id || '',
      qrData,
      environment: isProd ? 'production' : 'sandbox',
    });
  } catch (err) {
    console.error('[UPI QR] Failed:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to create Cashfree UPI QR.' });
  }
});

// Cashfree PG Webhook Endpoint
app.post('/payment/cashfree/webhook', async (req, res) => {
  const payload = req.body;

  console.log('Cashfree Webhook received event:', payload.type);

  if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const cfOrderId = payload.data.order.order_id;
    // Use order_tags.order_number (the POS sale number) if present; fallback to raw Cashfree order_id
    const orderNumber = payload.data.order.order_tags?.order_number || cfOrderId;
    console.log(`Cashfree Webhook: Payment success event for CF Order ${cfOrderId}, POS Order #${orderNumber}`);

    try {
      const orderDetails = await cashfreeRequest('GET', `/orders/${cfOrderId}`);
      console.log(`Cashfree Active Verification for Order #${orderNumber}: status = ${orderDetails.order_status}`);

      if (orderDetails.order_status === 'PAID') {
        if (firebaseInitialized) {
          const db = getFirestore();
          const ordersRef = db.collection('orders');
          const snapshot = await ordersRef
            .where('orderNumber', '==', orderNumber)
            .get();

          if (snapshot.empty) {
            console.warn(`No Firestore order found with orderNumber: ${orderNumber}`);
          } else {
            snapshot.forEach(async (doc) => {
              const orderData = doc.data();
              await doc.ref.update({
                paymentStatus: 'paid',
                orderStatus: 'pending_acceptance',
              });
              console.log(`Updated Firestore Order ID: ${doc.id} paymentStatus to "paid", orderStatus to "pending_acceptance"`);

              if (connectionStatus === 'CONNECTED' && sock) {
                const phone = orderData.customerPhone;
                if (phone) {
                  const cleanNumber = formatWhatsAppNumber(phone);
                  const settings = await getShopSettings();
                  const messageText = buildUnifiedReceiptMessage(settings.bar_name, settings, {
                    ...orderData,
                    orderNumber,
                    paymentStatus: 'paid'
                  });

                  try {
                    await sock.sendMessage(cleanNumber, { text: messageText });
                    console.log(`Sent Cashfree payment confirmation WhatsApp for Order #${orderNumber} to: ${cleanNumber}`);
                  } catch (waErr) {
                    console.error(`Failed to send WhatsApp confirmation:`, waErr);
                  }
                }
              } else {
                console.warn('WhatsApp Client is not connected. Cannot send payment confirmation.');
              }
            });
          }
        } else {
          console.warn('Firebase Admin SDK not initialized. Cannot update paymentStatus in Firestore.');
        }
      } else {
        console.warn(`Webhook said paid, but Cashfree API check returned: ${orderDetails.order_status}`);
      }
    } catch (err) {
      console.error(`Cashfree active verification failed for Order #${orderNumber}:`, err.message);
    }
  }

  res.json({ status: 'ok' });
});

// ─── Device License Verification ─────────────────────────────────────────────
// Set ALLOWED_DEVICES env var in Render as a comma-separated list of Device IDs
// e.g. ALLOWED_DEVICES=abc123,xyz789
app.post('/device/verify', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    return res
      .status(400)
      .json({ authorized: false, error: 'No device ID provided' });
  }
  const allowedDevices = (process.env.ALLOWED_DEVICES || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const authorized = allowedDevices.includes(deviceId);
  console.log(
    `Device verify: ${deviceId} → ${authorized ? 'AUTHORIZED' : 'DENIED'}`
  );
  res.json({ authorized });
});



// Send Order Confirmation message on WhatsApp
app.post('/payment/send-confirmation', async (req, res) => {
  const {
    phone,
    name,
    orderNumber,
    tableNumber,
    totalAmount,
    paymentMethod,
    paymentStatus,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    deliveryFee,
    orderType,
    deliveryAddress,
  } = req.body;

  if (!phone || !orderNumber) {
    return res
      .status(400)
      .json({
        success: false,
        error: 'Missing required fields: phone and orderNumber.',
      });
  }

  if (connectionStatus !== 'CONNECTED' || !sock) {
    // If WhatsApp is disconnected, return success: false but don't crash
    return res.json({
      success: false,
      error: 'WhatsApp client not connected.',
    });
  }

  const cleanNumber = formatWhatsAppNumber(phone);
  try {
    const settings = await getShopSettings();
    const messageText = buildUnifiedReceiptMessage(settings.bar_name, settings, {
      orderNumber,
      customerName: name,
      customerPhone: phone,
      tableNumber,
      totalAmount,
      paymentMethod,
      paymentStatus: paymentStatus || (paymentMethod === 'upi' ? 'paid' : 'pending'),
      items,
      subtotal,
      discountAmount,
      taxAmount,
      deliveryFee: deliveryFee || 0,
      orderType: orderType || 'dine_in',
      deliveryAddress: deliveryAddress || null,
    });

    console.log(`Sending order confirmation WhatsApp to: ${cleanNumber}`);
    await sock.sendMessage(cleanNumber, { text: messageText });
    res.json({ success: true });
  } catch (err) {
    console.error(`Failed to send order confirmation to ${cleanNumber}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});



// Start Server
app.listen(port, () => {
  console.log(`WhatsApp Cloud-Relay Server running on port ${port}`);
  console.log(`Relay version: ${relayVersion}`);
  initializeClient();

  // Self-ping every 8 minutes to prevent Render free-tier cold starts.
  // RENDER_EXTERNAL_URL is set automatically by Render; absent locally so this is a no-op there.
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl) {
    console.log(`Keep-alive self-ping enabled → ${selfUrl}/health every 8 min`);
    setInterval(() => {
      https.get(`${selfUrl}/health`, (res) => {
        res.resume(); // consume response to free socket
      }).on('error', (err) => {
        console.warn(`Keep-alive ping failed: ${err.message}`);
      });
    }, 8 * 60 * 1000);
  }
});
