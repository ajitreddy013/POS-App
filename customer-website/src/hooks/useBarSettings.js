/**
 * useBarSettings.js
 * Fetches bar settings from Firestore with real-time updates via onSnapshot.
 */
import { useState, useEffect } from 'react';
import { getFirebaseDb } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const DEFAULT_SETTINGS = {
  bar_name: "Malabar Waffle",
  contact_number: "",
  gst_number: "",
  address: "",
  thank_you_message: "Thank you for visiting!",
  upi_provider: "cashfree",
  hosted_app_url: "",
  delivery_enabled: false,
  delivery_fee: 30,
  delivery_free_above: 300,
  parcel_charge: 10,
  offer_enabled: false,
  offer_dates: [],
};

const useBarSettings = () => {
  const [barSettings, setBarSettings] = useState(null);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db) {
      setBarSettings(DEFAULT_SETTINGS);
      return;
    }

    const settingsRef = doc(db, 'settings', 'bar_settings');

    // Real-time listener — picks up any settings change without a page refresh
    const unsubscribe = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          setBarSettings({ ...DEFAULT_SETTINGS, ...snap.data() });
        } else {
          setBarSettings(DEFAULT_SETTINGS);
        }
      },
      (err) => {
        console.error('Failed to load bar settings:', err);
        setBarSettings(DEFAULT_SETTINGS);
      }
    );

    return () => unsubscribe();
  }, []);

  return { barSettings };
};

export default useBarSettings;
