/**
 * useBarSettings.js
 * Standalone hook that fetches bar settings directly from Firestore.
 * No dependency on the POS app's dbService.
 */
import { useState, useEffect } from 'react';
import { getFirebaseDb } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const DEFAULT_SETTINGS = {
  bar_name: "Malabar Waffle",
  contact_number: "",
  gst_number: "",
  address: "",
  thank_you_message: "Thank you for visiting!",
  whatsapp_enabled: 0,
  whatsapp_relay_url: "",
  whatsapp_template_name: "counterflow_pos_receipt",
  whatsapp_language_code: "en",
  whatsapp_default_country_code: "91",
  razorpay_enabled: 1,
  upi_provider: "cashfree",
  upi_vpa: "",
  hosted_app_url: "",
};

const useBarSettings = () => {
  const [barSettings, setBarSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const db = getFirebaseDb();
        if (!db) {
          setBarSettings(DEFAULT_SETTINGS);
          return;
        }

        // Try reading bar_settings document from Firestore
        const settingsRef = doc(db, 'settings', 'bar_settings');
        const snap = await getDoc(settingsRef);

        if (snap.exists()) {
          setBarSettings({ ...DEFAULT_SETTINGS, ...snap.data() });
        } else {
          setBarSettings(DEFAULT_SETTINGS);
        }
      } catch (err) {
        console.error('Failed to load bar settings:', err);
        setBarSettings(DEFAULT_SETTINGS);
      }
    };

    fetchSettings();
  }, []);

  return { barSettings };
};

export default useBarSettings;
