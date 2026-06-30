/**
 * useBarSettings.js
 * Returns barSettings from local DB, merged with Firestore via real-time onSnapshot.
 * Local DB is loaded once; Firestore updates are streamed so offer/delivery changes
 * appear in the kiosk immediately without a page refresh.
 */
import { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getFirebaseDb } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const useBarSettings = () => {
  const [barSettings, setBarSettings] = useState(null);

  useEffect(() => {
    let unsubscribe = null;
    let localSettings = null;

    const init = async () => {
      // 1. Load local DB once (works for POS / Electron)
      try {
        localSettings = await dbService.getBarSettings();
      } catch {
        localSettings = null;
      }

      // 2. Stream Firestore — cloud always overrides local
      const db = getFirebaseDb();
      if (db) {
        unsubscribe = onSnapshot(
          doc(db, 'settings', 'bar_settings'),
          (snap) => {
            const cloud = snap.exists() ? snap.data() : null;
            setBarSettings(cloud ? { ...localSettings, ...cloud } : localSettings);
          },
          () => {
            // Firestore unavailable — fall back to local only
            setBarSettings(localSettings);
          }
        );
      } else {
        setBarSettings(localSettings);
      }
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  return { barSettings };
};

export default useBarSettings;
