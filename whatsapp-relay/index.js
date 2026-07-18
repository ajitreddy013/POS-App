require('dotenv').config();
const path = require('path');

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
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const https = require('https');

// Initialize Firebase Admin SDK (v14+ modular API)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const serviceAccountPath = path.join(__dirname, 'service-account.json');

// Use a flag instead of admin.apps.length which is unreliable in firebase-admin v14+
let firebaseInitialized = false;
let firestoreIntegrationEnabled = false;
let firestoreWatcherUnsubscribe = null;
let firestoreAuthDisabledNotified = false;

if (fs.existsSync(serviceAccountPath)) {
  console.log(
    'Initializing Firebase Admin SDK using local service-account.json...'
  );
  try {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({ credential: cert(serviceAccount) });
    firebaseInitialized = true;
    firestoreIntegrationEnabled = true;
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
    firestoreIntegrationEnabled = true;
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
const relayVersion = '2026-07-06-unified-counter-v3';

const ALLOWED_ORIGINS = [
  'https://malabar-waffle.web.app',
  'https://malabar-waffle.firebaseapp.com',
  'https://counterflow-kiosk.web.app',
  'https://counterflow-kiosk.firebaseapp.com',
  'capacitor://localhost',  // Android APK (Capacitor)
  'https://localhost',      // Android APK (Capacitor HTTPS mode)
  'http://localhost',       // Android APK fallback
  'http://localhost:3000',  // Local dev
  'http://localhost:8080',  // Local dev alt
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile APK, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json());

// Global State
const processedWebhookOrders = new Set();

function isFirestoreUnauthenticatedError(err) {
  return (
    err?.code === 16 ||
    /UNAUTHENTICATED/i.test(err?.message || '') ||
    /invalid authentication credentials/i.test(err?.message || '')
  );
}

function disableFirestoreIntegration(reason) {
  if (!firestoreIntegrationEnabled) return;
  firestoreIntegrationEnabled = false;
  firebaseInitialized = false;
  if (firestoreWatcherUnsubscribe) {
    firestoreWatcherUnsubscribe();
    firestoreWatcherUnsubscribe = null;
  }
  if (!firestoreAuthDisabledNotified) {
    firestoreAuthDisabledNotified = true;
    console.warn(`[Firestore] Integration disabled: ${reason}`);
  }
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

// Reserve the next sequential order number — called by the website COD flow
// so that ALL counter increments happen server-side (Admin SDK) and never race
// with the webhook transaction that also increments the same counter.
const reserveNumberRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/order/reserve-number', reserveNumberRateLimit, async (req, res) => {
  const { prefix = 'W' } = req.body;
  if (!['W', 'A'].includes(prefix)) {
    return res.status(400).json({ success: false, error: 'Invalid prefix' });
  }
  try {
    const db = getFirestore();
    const counterRef = db.collection('settings').doc('order_counters');
    let orderNumber = null;
    await db.runTransaction(async (t) => {
      const snap = await t.get(counterRef);
      const current = snap.exists ? snap.data().totalOrders || 0 : 0;
      const next = current + 1;
      t.set(counterRef, { totalOrders: next }, { merge: true });
      orderNumber = `${prefix}-${next}`;
    });
    res.json({ success: true, orderNumber });
  } catch (err) {
    logEntry(`[reserve-number] Error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to reserve order number' });
  }
});

// Lets the customer website poll whether a UPI order's temporary "T-..."
// ticket has been flipped to its real W-N/A-N number yet (assigned by the
// Cashfree webhook below once payment confirms). Uses the Admin SDK so
// firestore.rules can keep the `orders` collection staff-only — this
// endpoint deliberately returns only the order number, never the full order
// document (customer PII, items, cost/profit).
const ticketStatusRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // polled every ~3s for up to 2 min per order = ~40 requests max
  message: { success: false, error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/order/ticket-status', ticketStatusRateLimit, async (req, res) => {
  const { ticketId } = req.query;
  if (typeof ticketId !== 'string' || !ticketId.startsWith('T-')) {
    return res.status(400).json({ success: false, error: 'Invalid ticketId' });
  }
  if (!firebaseInitialized || !firestoreIntegrationEnabled) {
    return res.status(503).json({ success: false, error: 'Firestore not available' });
  }
  try {
    const db = getFirestore();
    const snap = await db
      .collection('orders')
      .where('ticketId', '==', ticketId)
      .limit(1)
      .get();
    if (snap.empty) {
      return res.json({ success: true, orderNumber: null });
    }
    res.json({ success: true, orderNumber: snap.docs[0].data().orderNumber || null });
  } catch (err) {
    console.error('[ticket-status] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch order status' });
  }
});

// View Deployed Logs — protected by ADMIN_TOKEN env var
app.get('/logs', (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && req.query.token !== adminToken) {
    return res.status(401).send('Unauthorized');
  }
  res.setHeader('Content-Type', 'text/plain');
  res.send(logEntries.join('\n'));
});

const grantStaffRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // the POS app only needs this once per app launch
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // generous — Cashfree may retry, but caps spam from a forged orderId flood
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Grants the "staff" custom claim to an anonymous Firebase Auth user, so
// firestore.rules allows product/settings/sales/spendings writes and order
// updates. Gated by POS_DEVICE_KEY, a secret baked only into the POS app
// build (never the public customer website) — proves the caller is the
// trusted POS app, not an arbitrary internet client.
app.post('/auth/grant-staff', grantStaffRateLimit, async (req, res) => {
  const { uid, deviceKey } = req.body;
  const expectedKey = process.env.POS_DEVICE_KEY;

  if (!uid || !deviceKey) {
    return res.status(400).json({ success: false, error: 'Missing uid or deviceKey.' });
  }
  if (!expectedKey || deviceKey !== expectedKey) {
    return res.status(401).json({ success: false, error: 'Invalid device key.' });
  }
  if (!firebaseInitialized) {
    return res.status(503).json({ success: false, error: 'Firebase Admin not initialized.' });
  }

  try {
    await getAuth().setCustomUserClaims(uid, { staff: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to grant staff claim:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to grant staff claim.' });
  }
});

const deleteOrderRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,             // an admin-only, deliberately infrequent action
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Deletes the Firestore order doc matching an orderNumber. firestore.rules
// hard-blocks client-side order deletes ("allow delete: if false") to protect
// order history — this uses the Admin SDK, which bypasses rules entirely, so
// it's gated by the same POS_DEVICE_KEY as /auth/grant-staff instead. The POS
// app only calls this after its own admin-password confirmation modal.
app.post('/order/delete', deleteOrderRateLimit, async (req, res) => {
  const { orderNumber, deviceKey } = req.body;
  const expectedKey = process.env.POS_DEVICE_KEY;

  if (!orderNumber || !deviceKey) {
    return res.status(400).json({ success: false, error: 'Missing orderNumber or deviceKey.' });
  }
  if (!expectedKey || deviceKey !== expectedKey) {
    return res.status(401).json({ success: false, error: 'Invalid device key.' });
  }
  if (!firebaseInitialized) {
    return res.status(503).json({ success: false, error: 'Firebase Admin not initialized.' });
  }

  try {
    const db = getFirestore();
    const snap = await db.collection('orders').where('orderNumber', '==', orderNumber).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    res.json({ success: true, deletedCount: snap.size });
  } catch (err) {
    console.error('Failed to delete order:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete order.' });
  }
});

// --- PAYMENT INTEGRATION ---

// Helper to make authenticated requests to Cashfree
function cashfreeRequest(method, path, body, clientHeaders = {}) {
  return new Promise((resolve, reject) => {
    const clientId = process.env.CASHFREE_CLIENT_ID;
    const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    const isProd =
      (process.env.CASHFREE_ENV || '').toUpperCase() === 'PRODUCTION' ||
      (process.env.CASHFREE_ENV || '').toUpperCase() === 'PROD';

    if (!clientId || !clientSecret) {
      return reject(
        new Error(
          'Cashfree credentials (CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET) are missing.'
        )
      );
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
        'x-client-rendering-type':
          clientHeaders['x-client-rendering-type'] || 'mweb',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const errorMessage =
              parsed.message || `HTTP Error ${res.statusCode}: ${responseBody}`;
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

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Finds an order doc by ticketId (web orders use this before their real
// orderNumber is assigned) falling back to orderNumber directly — same
// matching logic the webhook handler uses below, kept in one place.
async function findOrderByTicketOrNumber(db, orderNumber) {
  const ordersRef = db.collection('orders');
  let snapshot = await ordersRef.where('ticketId', '==', orderNumber).get();
  if (snapshot.empty) {
    snapshot = await ordersRef.where('orderNumber', '==', orderNumber).get();
  }
  return snapshot.empty ? null : snapshot.docs[0];
}

// Recomputes what an order should actually cost from its stored line items
// and the *current* authoritative product prices — never trusts a client-
// supplied amount or a possibly-tampered totalAmount on the order doc itself.
async function computeAuthoritativeOrderAmount(db, orderData) {
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const productsRef = db.collection('products');
  const prices = await Promise.all(
    items.map(async (item) => {
      const snap = await productsRef.doc(String(item.productId)).get();
      const price = snap.exists ? Number(snap.data().price) : 0;
      return price * Number(item.quantity || 0);
    })
  );
  const subtotal = prices.reduce((sum, lineTotal) => sum + lineTotal, 0);
  const total =
    subtotal +
    Number(orderData.deliveryFee || 0) +
    Number(orderData.parcelCharge || 0) -
    Number(orderData.discountAmount || 0);
  return Math.max(Number(total.toFixed(2)), 0);
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
      error:
        'Missing required fields: amount and orderId must be provided, and Cashfree credentials must be configured on the server.',
    });
  }

  // Never trust the client-sent amount directly:
  //  - Kiosk requests come from the POS app's own till — require proof it's
  //    the trusted staff device (its Firebase ID token, minted via
  //    /auth/grant-staff) rather than trusting any caller who sets isKiosk.
  //  - Public/customer-website requests instead get their amount recomputed
  //    from the order's own line items against live product prices, so a
  //    tampered `amount` (or even a directly-forged cheap order doc) can't
  //    result in an underpriced Cashfree order.
  let verifiedAmount;
  if (isKiosk) {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Missing staff authorization.' });
    }
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      if (!decoded.staff) {
        return res.status(403).json({ success: false, error: 'Not authorized as staff.' });
      }
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid staff authorization.' });
    }
    verifiedAmount = Number(amount);
  } else {
    if (!firebaseInitialized || !firestoreIntegrationEnabled) {
      return res.status(503).json({ success: false, error: 'Order verification unavailable.' });
    }
    const db = getFirestore();
    const orderDoc = await findOrderByTicketOrNumber(db, String(orderId));
    if (!orderDoc) {
      return res.status(400).json({
        success: false,
        error: 'Order not found. Please create the order before requesting payment.',
      });
    }
    verifiedAmount = await computeAuthoritativeOrderAmount(db, orderDoc.data());
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
    const cfOrderId = isKiosk
      ? `${String(orderId)}_${Date.now()}`
      : String(orderId);

    const payload = {
      order_id: cfOrderId,
      order_amount: Number(verifiedAmount.toFixed(2)),
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
          : req.body.returnUrl ||
            `${req.headers.origin || 'https://malabar-waffle.web.app'}/?payment=success&orderId=${orderId}`,
        notify_url:
          'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
      },
      order_note: `Order ${orderId}`,
      order_tags: {
        order_number: String(orderId),
      },
    };

    // If Kiosk/Counter Mode, restrict to UPI (using correct order_meta nested structure)
    if (isKiosk || !req.body.returnUrl) {
      payload.order_meta.payment_methods_filters = {
        methods: {
          action: 'ALLOW',
          values: ['upi'],
        },
      };
    }

    // Set desktop device headers for Kiosk Mode checkouts to force QR code view by default on Cashfree
    let clientHeaders = {};
    if (isKiosk) {
      clientHeaders = {
        'x-client-device': 'desktop',
        'x-client-os': 'windows',
        'x-client-rendering-type': 'web',
      };
    }

    console.log(
      `Creating Cashfree Order for ${orderId} (CF id: ${cfOrderId}), isKiosk: ${isKiosk}, Amount: ${payload.order_amount}`
    );
    const response = await cashfreeRequest(
      'POST',
      '/orders',
      payload,
      clientHeaders
    );

    const isProd =
      cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';

    // Construct the checkout redirect link pointing to our customer website's SDK checkout page
    // For kiosk, always use the customer website base so the CF SDK checkout page loads correctly
    const webBase = isKiosk
      ? 'https://malabar-waffle.web.app'
      : req.body.returnUrl
        ? new URL(req.body.returnUrl).origin
        : req.headers.origin || 'https://malabar-waffle.web.app';
    const paymentLink = `${webBase}/#/checkout?sessionId=${response.payment_session_id}&env=${isProd ? 'production' : 'sandbox'}`;

    console.log(
      `Cashfree Order ${response.order_id} created. Payment link: ${paymentLink}`
    );

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
  <title>Returning to app…</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #374151;
           padding: 24px; text-align: center; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    p { font-size: 1.1rem; color: #6b7280; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="icon">✅</div>
  <p>Payment successful!</p>
  <p style="font-size:0.9rem;margin-top:8px;">Returning to register…</p>
  <!-- counterflow:// deep link brings the Android app to the foreground from CCT.
       The app's WebView resumes, JS restarts, and polling detects the completed payment. -->
  <a id="returnLink" href="counterflow://payment-done" style="display:none">back</a>
  <script>
    if (navigator.vibrate) { try { navigator.vibrate([100]); } catch(e) {} }
    // Primary: navigate to deep link — Chrome CCT passes it to the Android app
    window.location.href = 'counterflow://payment-done';
    setTimeout(function() {
      // Fallback click in case location.href was blocked
      try { document.getElementById('returnLink').click(); } catch(e) {}
      // Last resort: try window.close (works in regular browser tabs)
      setTimeout(function() { try { window.close(); } catch(e) {} }, 800);
    }, 400);
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
    return res.status(400).json({
      success: false,
      error: 'Missing required fields or Cashfree credentials.',
    });
  }

  try {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
    if (formattedPhone.length < 10) formattedPhone = '919999999999';

    const isProd =
      cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';
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
        notify_url:
          'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
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

    console.log(
      `[Kiosk Order] Creating Cashfree order for POS #${orderId}, CF ID: ${cfOrderId}`
    );
    const order = await cashfreeRequest(
      'POST',
      '/orders',
      payload,
      clientHeaders
    );
    console.log(
      `[Kiosk Order] CF order response keys: ${Object.keys(order).join(', ')}`
    );
    console.log(
      `[Kiosk Order] payment_link: ${order.payment_link}, session: ${order.payment_session_id}`
    );

    // Use Cashfree's own payment_link if present, otherwise construct from session ID
    const hostedUrl =
      order.payment_link ||
      (isProd
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
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create kiosk order.',
    });
  }
});

// Check Cashfree order payment status by CF order ID
app.post('/payment/cashfree/order-status', async (req, res) => {
  const { cfOrderId } = req.body;
  if (!cfOrderId)
    return res
      .status(400)
      .json({ success: false, error: 'Missing cfOrderId.' });
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
    return res.status(400).json({
      success: false,
      error: 'Missing required fields or Cashfree credentials.',
    });
  }

  try {
    let formattedPhone = (phone || '').replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = `91${formattedPhone}`;
    if (formattedPhone.length < 10) formattedPhone = '919999999999';

    const isProd =
      cfEnv.toUpperCase() === 'PRODUCTION' || cfEnv.toUpperCase() === 'PROD';

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
        notify_url:
          'https://pos-app-nqsm.onrender.com/payment/cashfree/webhook',
      },
      order_note: `Order ${orderId}`,
      order_tags: { order_number: String(orderId) },
    };

    console.log(
      `[UPI QR] Creating Cashfree order for ${orderId}, amount: ${orderPayload.order_amount}`
    );
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
    const payResponse = await cashfreeRequest(
      'POST',
      '/orders/pay',
      payPayload
    );
    console.log(
      `[UPI QR] Pay response for ${order.order_id}:`,
      JSON.stringify(payResponse)
    );

    const qrData = payResponse?.data?.payload?.qrcode || '';

    if (!qrData) {
      console.error(
        '[UPI QR] No QR data returned. Full response:',
        JSON.stringify(payResponse)
      );
      return res.status(502).json({
        success: false,
        error: 'Cashfree did not return a UPI QR code. Check logs.',
      });
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
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Cashfree UPI QR.',
    });
  }
});

// Cashfree PG Webhook Endpoint
app.post('/payment/cashfree/webhook', webhookRateLimit, async (req, res) => {
  // Verify Cashfree webhook signature (uses CASHFREE_WEBHOOK_SECRET, separate from API secret).
  // Only rejects on a confirmed mismatch (clear forgery); if the secret isn't
  // configured or Cashfree didn't send the headers, behavior is unchanged —
  // the handler still re-verifies payment status via the Cashfree API before acting.
  const webhookSignature = req.headers['x-webhook-signature'];
  const webhookTimestamp = req.headers['x-webhook-timestamp'];
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
  if (webhookSecret && webhookSignature && webhookTimestamp) {
    const crypto = require('crypto');
    const rawBody = JSON.stringify(req.body);
    const signedPayload = `${webhookTimestamp}${rawBody}`;
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('base64');
    if (expectedSig !== webhookSignature) {
      console.warn('Cashfree webhook signature mismatch — rejecting.');
      return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
    }
  }

  const payload = req.body;
  console.log('Cashfree Webhook received event:', payload.type);

  if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const cfOrderId = payload.data.order.order_id;
    // Use order_tags.order_number (the POS sale number) if present; fallback to raw Cashfree order_id
    const orderNumber =
      payload.data.order.order_tags?.order_number || cfOrderId;
    console.log(
      `Cashfree Webhook: Payment success event for CF Order ${cfOrderId}, POS Order #${orderNumber}`
    );

    if (processedWebhookOrders.has(orderNumber)) {
      console.log(`[Webhook] Already processed webhook for order #${orderNumber} in-memory. Skipping.`);
      return res.json({ status: 'ok' });
    }
    processedWebhookOrders.add(orderNumber);
    // Auto-expire after 10 minutes to prevent memory leak
    setTimeout(() => processedWebhookOrders.delete(orderNumber), 10 * 60 * 1000);

    try {
      const orderDetails = await cashfreeRequest('GET', `/orders/${cfOrderId}`);
      console.log(
        `Cashfree Active Verification for Order #${orderNumber}: status = ${orderDetails.order_status}`
      );

      if (orderDetails.order_status === 'PAID') {
        if (firebaseInitialized && firestoreIntegrationEnabled) {
          const db = getFirestore();
          const ordersRef = db.collection('orders');
          // Web orders are matched via the stable ticketId field (their
          // orderNumber may still be a temp "T-..." placeholder at this
          // point). Other order sources (e.g. kiosk hosted payment) never
          // set ticketId, so fall back to matching orderNumber directly —
          // keeps this handler backward-compatible with those flows.
          let snapshot = await ordersRef
            .where('ticketId', '==', orderNumber)
            .get();
          if (snapshot.empty) {
            snapshot = await ordersRef
              .where('orderNumber', '==', orderNumber)
              .get();
          }

          if (snapshot.empty) {
            console.warn(
              `No Firestore order found with orderNumber: ${orderNumber}`
            );
          } else {
            // Use for...of so every await inside is properly waited before
            // the next iteration — forEach does not await async callbacks.
            for (const doc of snapshot.docs) {
              const orderData = doc.data();
              if (orderData.paymentStatus === 'paid') {
                console.log(`[Webhook] Order #${orderNumber} already marked paid in database. Skipping.`);
                continue;
              }

              let realOrderNumber = orderData.orderNumber;
              const needsNumber =
                /^(T-|W-temp-|W-\d{5,})/.test(realOrderNumber) ||
                /^KSK/.test(realOrderNumber);

              if (needsNumber) {
                // Combine counter increment + order status update in ONE
                // transaction so two concurrent webhooks can never claim the
                // same number — one will conflict and retry with the next value.
                const isKiosk = /^KSK/.test(realOrderNumber);
                const prefix = isKiosk ? 'A' : 'W';
                const counterRef = db.collection('settings').doc('order_counters');
                const orderRef = doc.ref;

                await db.runTransaction(async (transaction) => {
                  const [counterSnap, orderSnap] = await Promise.all([
                    transaction.get(counterRef),
                    transaction.get(orderRef),
                  ]);

                  // Inner idempotency guard — handles concurrent webhook retries
                  if (orderSnap.data()?.paymentStatus === 'paid') return;

                  const currentCount = counterSnap.exists
                    ? counterSnap.data().totalOrders || 0
                    : 0;
                  const nextCount = currentCount + 1;

                  transaction.set(counterRef, { totalOrders: nextCount }, { merge: true });
                  transaction.update(orderRef, {
                    paymentStatus: 'paid',
                    orderStatus: 'completed',
                    orderNumber: `${prefix}-${nextCount}`,
                  });

                  realOrderNumber = `${prefix}-${nextCount}`;
                });

                // If the transaction aborted early (order already paid by a
                // concurrent call), realOrderNumber still has the temp value —
                // skip further processing for this doc.
                if (realOrderNumber === orderData.orderNumber) continue;

              } else {
                // Already has a sequential number — just mark it paid.
                await doc.ref.update({
                  paymentStatus: 'paid',
                  orderStatus: 'completed',
                  orderNumber: realOrderNumber,
                });
              }

              console.log(
                `Updated Firestore Order ID: ${doc.id} paymentStatus to "paid", orderStatus to "completed", orderNumber to "${realOrderNumber}"`
              );
            }
          }
        } else {
          console.warn(
            'Firebase Admin SDK not initialized. Cannot update paymentStatus in Firestore.'
          );
        }
      } else {
        console.warn(
          `Webhook said paid, but Cashfree API check returned: ${orderDetails.order_status}`
        );
      }
    } catch (err) {
      processedWebhookOrders.delete(orderNumber);
      if (isFirestoreUnauthenticatedError(err)) {
        disableFirestoreIntegration(err.message);
        res.json({ status: 'ok' });
        return;
      }
      console.error(
        `Cashfree active verification failed for Order #${orderNumber}:`,
        err.message
      );
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

// ─── Admin Push Notifier ─────────────────────────────────────────────────────
// Send FCM push notification to all registered admin devices
async function sendFCMToAdmins(orderData) {
  if (!firebaseInitialized || !firestoreIntegrationEnabled) return;
  try {
    const db = getFirestore();
    const tokensSnap = await db.collection('admin_devices').get();
    const tokens = [];
    tokensSnap.forEach((d) => {
      const t = d.data().fcmToken;
      if (t) tokens.push(t);
    });
    if (tokens.length === 0) {
      console.log('[FCM] No admin device tokens — skipping FCM.');
      return;
    }

    const isDelivery = orderData.orderType === 'delivery';
    const isPaidOnline = orderData.paymentMethod === 'upi' && orderData.paymentStatus === 'paid';

    let icon = '📦'; // Default Parcel
    if (isDelivery) icon = '🛵';
    else if (orderData.orderType === 'dine_in' || orderData.orderType === 'table') icon = '🍽️';

    const title = `${icon} New Order #${orderData.orderNumber}`;
    const body = isPaidOnline
      ? 'Payment: Paid Online'
      : isDelivery
        ? 'Payment: Cash on Delivery'
        : 'Payment: Cash at Counter';

    const response = await getMessaging().sendEachForMulticast({
      // Data-only (no 'notification' section): FCM always calls onMessageReceived
      // regardless of app state. MyFirebaseMessagingService builds the notification
      // with the colored launcher icon as large icon.
      data: {
        title,
        body,
        orderNumber: String(orderData.orderNumber || ''),
        isDelivery: String(isDelivery),
      },
      android: {
        priority: 'high',
      },
      tokens,
    });

    // Remove stale tokens from Firestore
    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(tokens[idx]);
        }
      }
    });
    if (staleTokens.length > 0) {
      const allDocs = await db.collection('admin_devices').get();
      allDocs.forEach((d) => {
        if (staleTokens.includes(d.data().fcmToken)) {
          d.ref.delete().catch(() => {});
        }
      });
    }

    console.log(
      `[FCM] Order notification sent: ${response.successCount}/${tokens.length} devices`
    );
  } catch (err) {
    console.error('[FCM] Failed to send notification:', err.message);
  }
}

// Watches Firestore for newly-completed orders (UPI paid via the Cashfree
// webhook, or COD placed via the customer site) and pushes an FCM
// notification to registered admin devices for each one. Uses a persistent
// onSnapshot listener rather than polling with .get() on a timer — Firestore
// only bills for the initial matching set once, then only for documents
// that actually change afterward, instead of re-reading the whole rolling
// 24h order window over and over regardless of whether anything changed.
function startAdminNotificationWatcher() {
  if (!firebaseInitialized || !firestoreIntegrationEnabled) {
    console.warn(
      '[Admin Watcher] Firebase not initialized — skipping order watcher.'
    );
    return;
  }
  const db = getFirestore();
  const fcmProcessedIds = new Set(); // in-memory guard against double-sends

  const since = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  firestoreWatcherUnsubscribe = db.collection('orders')
    .where('createdAt', '>=', since)
    .onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added' && change.type !== 'modified') return;

          const doc = change.doc;
          const data = doc.data();
          const docId = doc.id;

          // Notify admin for any new order (cash or paid UPI)
          const needsFCM =
            !data.fcmSent &&
            !fcmProcessedIds.has(docId) &&
            data.orderStatus === 'completed';

          if (needsFCM) {
            fcmProcessedIds.add(docId);
            (async () => {
              try {
                await doc.ref.update({ fcmSent: true });
              } catch (_) { /* non-fatal */ }
              await sendFCMToAdmins(data);
            })();
          }
        });
      },
      (err) => {
        if (isFirestoreUnauthenticatedError(err)) {
          disableFirestoreIntegration(err.message);
          return;
        }
        console.error('[Admin Watcher] Listener error:', err.message);
      }
    );

  console.log(
    '[Admin Watcher] Watching Firestore in real time for orders that need admin notifications...'
  );
}

// Start Server
app.listen(port, () => {
  console.log(`Relay Server running on port ${port}`);
  console.log(`Relay version: ${relayVersion}`);
  startAdminNotificationWatcher();

  // Self-ping every 8 minutes to prevent Render free-tier cold starts.
  // RENDER_EXTERNAL_URL is set automatically by Render; absent locally so this is a no-op there.
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl) {
    console.log(`Keep-alive self-ping enabled → ${selfUrl}/health every 8 min`);
    setInterval(
      () => {
        https
          .get(`${selfUrl}/health`, (res) => {
            res.resume(); // consume response to free socket
          })
          .on('error', (err) => {
            console.warn(`Keep-alive ping failed: ${err.message}`);
          });
      },
      8 * 60 * 1000
    );
  }
});
