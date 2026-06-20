import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
