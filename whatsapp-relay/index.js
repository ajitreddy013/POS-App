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

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  console.log(
    'Initializing Firebase Admin SDK using local service-account.json...'
  );
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.cert(serviceAccount),
    });
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
    admin.initializeApp({
      credential: admin.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
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
const relayVersion = '2026-06-23-cashfree-direct-kiosk-desktop-v4';

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
  if (admin && admin.apps && admin.apps.length > 0) {
    try {
      const db = admin.firestore();
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
    taxAmount = 0
  } = orderData;

  const name = customerName || 'Customer';
  
  // Status Header
  const isPaid = paymentStatus === 'paid' || paymentMethod === 'upi';
  const statusHeader = isPaid 
    ? `*🟢 PAID VIA UPI (ONLINE) 🟢*`
    : `*🔴 CASH PAYMENT - PAY AT COUNTER 🔴*`;

  // Personalized greeting
  const hasTable = tableNumber && tableNumber !== 'Parcel' && tableNumber !== 'Takeaway' && tableNumber !== 'Kiosk' && tableNumber !== 'Website' && tableNumber !== 'Online';
  const tableSuffix = hasTable ? ` for *Table ${tableNumber}*` : '';
  const greeting = `Hi *${name}*,\nWe have received your ${isPaid ? 'payment & ' : ''}order *#${orderNumber}*${tableSuffix}.`;

  // Store info header
  let storeHeader = `*${shopName}*`;
  if (settings.address) {
    storeHeader += `\n📍 ${settings.address}`;
  }
  if (settings.contact_number) {
    storeHeader += `\n📞 ${settings.contact_number}`;
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
    
    let summaryList = `------------------------\n`;
    summaryList += "Subtotal:".padStart(15) + " " + calcSubtotal.toFixed(2).padStart(8);
    
    if (discountAmount > 0) {
      summaryList += "\n" + "Discount:".padStart(15) + " " + ("-" + Number(discountAmount).toFixed(2)).padStart(8);
    }
    if (taxAmount > 0) {
      summaryList += "\n" + "Tax:".padStart(15) + " " + Number(taxAmount).toFixed(2).padStart(8);
    }
    summaryList += "\n" + "Total:".padStart(15) + " " + ("₹" + Number(totalAmount).toFixed(2)).padStart(8);

    receiptTable = "\n```\n" + itemsHeader + "\n" + itemsList + "\n" + summaryList + "\n```\n";
  } else {
    receiptTable = `\nTotal Amount: *₹${Number(totalAmount).toFixed(2)}*\n`;
  }

  // Footer instruction
  const footerInstruction = isPaid 
    ? `Please wait while the kitchen prepares your delicious order! 😋`
    : `*Please pay Cash at the counter* while the kitchen prepares your delicious order! 😋`;

  const footerText = settings.thank_you_message || "Thank you for visiting! Please visit again.";

  // Assemble the message
  return `${statusHeader}

${greeting}

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

    const payload = {
      order_id: String(orderId),
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${String(orderId)}`,
        customer_phone: formattedPhone.slice(-10),
        customer_name: name || 'Customer',
        customer_email: 'customer@malabarwaffle.com',
      },
      order_meta: {
        return_url: req.body.returnUrl || `${req.headers.origin || 'https://counterflow-kiosk.web.app'}/?payment=success&orderId=${orderId}`,
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
    if (isKiosk === true) {
      clientHeaders = {
        'x-client-device': 'desktop',
        'x-client-os': 'windows',
        'x-client-rendering-type': 'web'
      };
    }

    console.log(`Creating Cashfree Order for ${orderId}, Amount: ${payload.order_amount}`);
    const response = await cashfreeRequest('POST', '/orders', payload, clientHeaders);

    const isProd = cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';

    // Determine the payment redirect link
    let paymentLink;
    if (isKiosk !== undefined) {
      // Direct Cashfree hosted payment page for POS app (Kiosk or Counter) to bypass customer website flow
      // Use correct Sapper hash-based session URL format to prevent server-side 500 router errors
      paymentLink = isProd
        ? `https://payments.cashfree.com/order/#/session/${response.payment_session_id}`
        : `https://payments-test.cashfree.com/order/#/session/${response.payment_session_id}`;
    } else {
      // Customer Website SDK checkout page fallback
      const webBase = req.body.returnUrl 
        ? new URL(req.body.returnUrl).origin 
        : (req.headers.origin || 'https://counterflow-kiosk.web.app');
      paymentLink = `${webBase}/#/checkout?sessionId=${response.payment_session_id}&env=${isProd ? 'production' : 'sandbox'}`;
    }

    console.log(`Cashfree Order ${response.order_id} created. Payment link: ${paymentLink}`);

    res.json({
      success: true,
      paymentSessionId: response.payment_session_id,
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

// Cashfree PG Webhook Endpoint
app.post('/payment/cashfree/webhook', async (req, res) => {
  const payload = req.body;

  console.log('Cashfree Webhook received event:', payload.type);

  if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const orderNumber = payload.data.order.order_id;
    console.log(`Cashfree Webhook: Payment success event for Order #${orderNumber}`);

    try {
      const orderDetails = await cashfreeRequest('GET', `/orders/${orderNumber}`);
      console.log(`Cashfree Active Verification for Order #${orderNumber}: status = ${orderDetails.order_status}`);

      if (orderDetails.order_status === 'PAID') {
        if (admin && admin.apps && admin.apps.length > 0) {
          const db = admin.firestore();
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
              });
              console.log(`Updated Firestore Order ID: ${doc.id} paymentStatus to "paid"`);

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
    taxAmount
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
      taxAmount
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
});
