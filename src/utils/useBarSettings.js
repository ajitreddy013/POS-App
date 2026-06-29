/**
 * useBarSettings.js
 * Returns barSettings from local DB, merged with Firestore cloud settings.
 * The Firestore read is essential for the customer website where the local
 * DB is empty — offer toggle, dates, delivery settings all live in Firestore.
 */
import { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getFirebaseDb } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const useBarSettings = () => {
  const [barSettings, setBarSettings] = useState(null);

  useEffect(() => {
    const load = async () => {
      // 1. Try local DB (works for POS / Electron)
      let local = null;
      try {
        local = await dbService.getBarSettings();
      } catch {
        local = null;
      }

      // 2. Try Firestore (required for customer website where local DB is empty)
      let cloud = null;
      try {
        const db = getFirebaseDb();
        if (db) {
          const snap = await getDoc(doc(db, 'settings', 'bar_settings'));
          if (snap.exists()) cloud = snap.data();
        }
      } catch {
        cloud = null;
      }

      // Merge: cloud fields override local so the customer website always
      // gets the owner's latest saved settings (offer toggle, dates, etc.)
      setBarSettings(cloud ? { ...local, ...cloud } : local);
    };

    load();
  }, []);

  return { barSettings };
};

export default useBarSettings;
