import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { APP_CONFIG } from "./config";

// Load configuration from secure environment variables (not stored in git)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

let app = null;
let db = null;

/**
 * Get or initialize Firestore database client.
 * Uses the hardcoded firebaseConfig credentials.
 */
export const getFirebaseDb = () => {
  if (db) return db;

  // Check if we have a valid configuration to initialize
  if (!firebaseConfig || !firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_PROJECT_ID") {
    // Return null silently: Firebase features will be disabled until configured in this file
    return null;
  }

  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    return db;
  } catch (err) {
    console.error("Firebase initialization failed:", err);
    return null;
  }
};

let staffAuthPromise = null;

/**
 * Signs the POS app in anonymously and has whatsapp-relay grant it a "staff"
 * custom claim (gated by REACT_APP_POS_DEVICE_KEY, baked into this build).
 * firestore.rules requires that claim for writes to products/settings/
 * sales/spendings and for order updates — this is what satisfies it.
 * Safe to call from multiple places; the flow only ever runs once.
 */
export const ensureStaffAuth = () => {
  if (staffAuthPromise) return staffAuthPromise;

  staffAuthPromise = (async () => {
    if (getFirebaseDb() === null) return false;

    const auth = getAuth(app);
    const deviceKey = process.env.REACT_APP_POS_DEVICE_KEY;
    if (!deviceKey) {
      console.warn("[staff-auth] REACT_APP_POS_DEVICE_KEY not set — staff-gated writes will fail.");
      return false;
    }

    const userCredential = auth.currentUser || (await signInAnonymously(auth)).user;

    const res = await fetch(`${APP_CONFIG.relayUrl}/auth/grant-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: userCredential.uid, deviceKey }),
    });
    const data = await res.json();
    if (!data.success) {
      console.warn("[staff-auth] grant-staff failed:", data.error);
      return false;
    }

    // Custom claims only take effect after a forced token refresh
    await userCredential.getIdTokenResult(true);
    return true;
  })().catch((err) => {
    console.warn("[staff-auth] failed, will retry next call:", err.message);
    staffAuthPromise = null; // allow a retry (e.g. relay was briefly unreachable)
    return false;
  });

  return staffAuthPromise;
};

/**
 * Returns a fresh Firebase ID token proving this is the staff-authenticated
 * POS app, for endpoints (e.g. relay's kiosk payment routes) that check it
 * via Authorization: Bearer <token>. Waits for ensureStaffAuth() first.
 */
export const getStaffIdToken = async () => {
  await ensureStaffAuth();
  const auth = getAuth(app);
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
};
