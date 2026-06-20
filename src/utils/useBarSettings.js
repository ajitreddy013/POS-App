/**
 * useBarSettings.js
 * Reusable hook — returns barSettings fetched from DB.
 * Usage: const { barSettings } = useBarSettings();
 */
import { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';

const useBarSettings = () => {
  const [barSettings, setBarSettings] = useState(null);

  useEffect(() => {
    dbService.getBarSettings()
      .then(setBarSettings)
      .catch(() => setBarSettings(null));
  }, []);

  return { barSettings };
};

export default useBarSettings;
