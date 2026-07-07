import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Store, Save, Edit, Mail, Send, TestTube, RotateCcw, AlertTriangle, Info, HelpCircle, MessageCircle, Lock, CloudLightning, QrCode, Truck, Tag, ChevronLeft, ChevronRight, Bell, Package } from 'lucide-react';
import { dbService } from '../services/dbService';
import { getFirebaseDb } from '../firebase';
import { doc, writeBatch, setDoc, getDocs, getDoc, collection } from 'firebase/firestore';
import QRCode from 'qrcode';

const Settings = () => {
  const [barSettings, setBarSettings] = useState({
    bar_name: '',
    contact_number: '',
    gst_number: '',
    address: '',
    thank_you_message: '',
    printing_enabled: 1,
    admin_password: '123456',
    firebase_config: '',
    hosted_app_url: '',
    delivery_enabled: false,
    delivery_fee: 30,
    delivery_free_above: 300,
    delivery_min_order: 300,
    delivery_start_time: '16:00',
    delivery_end_time: '22:00',
    parcel_charge: 10,
    offer_enabled: false,
    offer_dates: [],
  });
  const [emailSettings, setEmailSettings] = useState({
    host: '',
    port: 587,
    secure: false,
    auth: { user: '', pass: '' },
    from: '',
    to: '',
    enabled: false
  });
  const [activeTab, setActiveTab] = useState('general');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isEditingBarInfo, setIsEditingBarInfo] = useState(false);
  const [isEditingEmailInfo, setIsEditingEmailInfo] = useState(false);
  const [isEditingSecurity, setIsEditingSecurity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [closeSellLoading, setCloseSellLoading] = useState(false);
  
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  // Self-Ordering Table QR States
  const [tablesList, setTablesList] = useState([]);
  const [selectedTable, setSelectedTable] = useState('Parcel');
  const [tableQrCodeUrl, setTableQrCodeUrl] = useState('');

  const loadTables = async () => {
    try {
      const list = await dbService.getTables();
      const sorted = [...list].sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setTablesList(sorted);
      if (sorted.length > 0) {
        setSelectedTable(sorted[0].name);
      }
    } catch (err) {
      console.error('Failed to load tables:', err);
    }
  };

  const escapeHtml = (str) =>
    String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const handlePrintQr = () => {
    const hostedUrl = barSettings.hosted_app_url || 'https://counterflow-kiosk.web.app/';
    const targetUrl = hostedUrl;
    QRCode.toDataURL(targetUrl, { width: 512, margin: 1 })
      .then(qrDataUrl => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html>
            <head>
              <title>Print Menu QR Code</title>
              <style>
                body {
                  font-family: 'Outfit', 'Inter', sans-serif;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  background-color: #ffffff;
                }
                .card {
                  border: 4px solid #1C5C3A;
                  border-radius: 32px;
                  padding: 50px 40px;
                  text-align: center;
                  max-width: 450px;
                  box-shadow: 0 15px 35px rgba(0,0,0,0.06);
                }
                .logo {
                  font-size: 1.8rem;
                  font-weight: 800;
                  color: #1C5C3A;
                  text-transform: uppercase;
                  letter-spacing: 2px;
                  margin-bottom: 5px;
                }
                .tagline {
                  font-size: 1.1rem;
                  color: #EAB308;
                  font-weight: 700;
                  margin-bottom: 30px;
                  text-transform: uppercase;
                  letter-spacing: 1px;
                }
                .qr-img {
                  width: 280px;
                  height: 280px;
                  margin-bottom: 30px;
                }
                .tag-main {
                  font-size: 1.6rem;
                  font-weight: 800;
                  color: #1C5C3A;
                  margin-bottom: 10px;
                }
                .instructions {
                  font-size: 0.95rem;
                  color: #64748B;
                  line-height: 1.6;
                  font-weight: 600;
                }
                @media print {
                  body {
                    background: none;
                  }
                  .card {
                    box-shadow: none;
                    border: 4px solid #1C5C3A;
                  }
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="logo">${escapeHtml(barSettings.bar_name || 'MALABAR WAFFLE')}</div>
                <div class="tagline">Self-Ordering QR Menu</div>
                <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
                <div class="tag-main">SCAN & ORDER</div>
                <div class="instructions">Scan this QR code with your mobile camera to browse our delicious menu and place your order directly!</div>
              </div>
              <script>
                window.onload = function() {
                  window.print();
                  setTimeout(function() { window.close(); }, 500);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      })
      .catch(err => {
        console.error('Failed to print QR code:', err);
        alert('Failed to generate print view. Please try again.');
      });
  };

  const handleDownloadQr = () => {
    const hostedUrl = barSettings.hosted_app_url || 'https://counterflow-kiosk.web.app/';
    const targetUrl = hostedUrl;
    QRCode.toDataURL(targetUrl, { width: 512, margin: 1 })
      .then(qrDataUrl => {
        const link = document.createElement('a');
        link.href = qrDataUrl;
        link.download = `menu_ordering_qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch(err => {
        console.error('Failed to download QR code:', err);
      });
  };

  useEffect(() => {
    loadBarSettings();
    loadEmailSettings();
    loadTables();
  }, []);

  useEffect(() => {
    const targetUrl = barSettings.hosted_app_url || 'https://counterflow-kiosk.web.app/';
    QRCode.toDataURL(targetUrl, { width: 350, margin: 2 })
      .then(url => setTableQrCodeUrl(url))
      .catch(err => console.error('Error generating customer website QR:', err));
  }, [barSettings.hosted_app_url]);

  const loadBarSettings = async () => {
    try {
      let settings = await dbService.getBarSettings();

      // Merge Firestore settings so the app reflects whatever is live in the cloud
      try {
        const db = getFirebaseDb();
        if (db) {
          const snap = await getDoc(doc(db, 'settings', 'bar_settings'));
          if (snap.exists()) {
            settings = { ...settings, ...snap.data() };
          }
        }
      } catch (_) {
        // Firestore unavailable — use local settings only
      }

      // delivery_free_above is the Firestore key; delivery_min_order is the UI state key
      if (settings.delivery_free_above !== undefined && settings.delivery_min_order === undefined) {
        settings.delivery_min_order = settings.delivery_free_above;
      }
      setBarSettings(settings);
    } catch (error) {
      // Failed to load bar settings
    } finally {
      setSettingsLoaded(true);
    }
  };

  const [syncingMenu, setSyncingMenu] = useState(false);

  // Offer calendar state
  const now = new Date();
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth());

  const syncMenuToCloud = async () => {
    try {
      setSyncingMenu(true);
      const db = getFirebaseDb();
      if (!db) {
        alert("Firebase is not configured! Please configure your credentials inside src/firebase.js first.");
        return;
      }

      const products = await dbService.getProducts();
      if (!products || products.length === 0) {
        alert("No products found in local database to sync.");
        return;
      }

      // 1. Fetch all existing products from Firestore to handle clean up
      const existingDocIds = [];
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        querySnapshot.forEach((doc) => {
          existingDocIds.push(doc.id);
        });
      } catch (err) {
        console.warn("Failed to fetch existing Firestore products for cleanup:", err);
      }

      // 2. Identify products in Firestore that do not exist locally
      const localIds = products.map((p) => String(p.id));
      const idsToDelete = existingDocIds.filter((id) => !localIds.includes(id));

      const batch = writeBatch(db);

      // 3. Upload/Update current local products
      products.forEach((p) => {
        const docRef = doc(db, "products", String(p.id));
        batch.set(docRef, {
          id: String(p.id),
          name: p.name,
          price: Number(p.price) || 0,
          category: p.category || "General",
          image: p.image || "",
          description: p.description || "",
          dietary_type: p.dietary_type || "veg",
          available: true
        });
      });

      // 4. Delete old products no longer present in local database
      idsToDelete.forEach((id) => {
        const docRef = doc(db, "products", id);
        batch.delete(docRef);
      });

      await batch.commit();
      alert(`Menu synchronized successfully! ${products.length} products updated, and ${idsToDelete.length} obsolete products deleted from the cloud.`);
    } catch (err) {
      console.error("Failed to sync menu:", err);
      alert(`Sync failed: ${err.message || err}`);
    } finally {
      setSyncingMenu(false);
    }
  };

  const loadEmailSettings = async () => {
    try {
      const settings = await dbService.getEmailSettings();
      setEmailSettings(settings);
    } catch (error) {
      // Failed to load email settings
    }
  };

  const saveBarSettings = async () => {
    try {
      setLoading(true);
      await dbService.saveBarSettings(barSettings);

      // Sync settings to Firestore in real-time if configured
      try {
        const db = getFirebaseDb();
        if (db) {
          const settingsRef = doc(db, 'settings', 'bar_settings');
          await setDoc(settingsRef, {
            bar_name: barSettings.bar_name || '',
            contact_number: barSettings.contact_number || '',
            gst_number: barSettings.gst_number || '',
            address: barSettings.address || '',
            thank_you_message: barSettings.thank_you_message || '',
            printing_enabled: barSettings.printing_enabled !== undefined ? Number(barSettings.printing_enabled) : 0,
            upi_provider: barSettings.upi_provider || 'cashfree',
            hosted_app_url: barSettings.hosted_app_url || '',
            delivery_enabled: barSettings.delivery_enabled === true,
            delivery_fee: barSettings.delivery_fee ?? 30,
            delivery_free_above: barSettings.delivery_min_order ?? 300,
            delivery_start_time: barSettings.delivery_start_time || '16:00',
            delivery_end_time: barSettings.delivery_end_time || '22:00',
            parcel_charge: barSettings.parcel_charge ?? 10,
            offer_enabled: barSettings.offer_enabled || false,
            offer_dates: barSettings.offer_dates || [],
          }, { merge: true });
          console.log('Bar settings successfully synced to Firestore.');
        }
      } catch (cloudErr) {
        console.error('Failed to sync settings to Firestore:', cloudErr);
      }

      setIsEditingBarInfo(false);
      alert('Shop information saved successfully!');
    } catch (error) {
      // Failed to save bar settings
      alert('Failed to save shop information');
    } finally {
      setLoading(false);
    }
  };
  const handlePasswordChange = async () => {
    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      alert('All fields are required.');
      return;
    }

    if (newPasswordInput.length < 6) {
      alert('New password must be at least 6 characters/digits.');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      alert('New passwords do not match.');
      return;
    }

    setSecurityLoading(true);
    try {
      const currentPassword = barSettings.admin_password || "123456";
      if (currentPasswordInput !== currentPassword) {
        alert('Incorrect current password.');
        setSecurityLoading(false);
        return;
      }

      const updatedSettings = {
        ...barSettings,
        admin_password: newPasswordInput
      };
      
      const res = await dbService.saveBarSettings(updatedSettings);
      if (res.success) {
        setBarSettings(updatedSettings);
        alert('Admin password updated successfully!');
        setIsEditingSecurity(false);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
      } else {
        alert('Failed to save updated password.');
      }
    } catch (err) {
      alert(`Error updating password: ${err.message}`);
    } finally {
      setSecurityLoading(false);
    }
  };
  const saveEmailSettings = async () => {
    try {
      setEmailLoading(true);
      const success = await dbService.saveEmailSettings(emailSettings);
      if (success) {
        setIsEditingEmailInfo(false);
        alert('Email settings saved successfully!');
      } else {
        alert('Failed to save email settings');
      }
    } catch (error) {
      // Failed to save email settings
      alert('Failed to save email settings');
    } finally {
      setEmailLoading(false);
    }
  };

  const testEmailConnection = async () => {
    try {
      setEmailLoading(true);
      const result = await dbService.testEmailConnection();
      if (result.success) {
        alert('Email connection test successful!');
      } else {
        alert(`Email connection test failed: ${result.error}`);
      }
    } catch (error) {
      alert('Email connection test failed');
    } finally {
      setEmailLoading(false);
    }
  };

  const sendTestEmail = async () => {
    try {
      setEmailLoading(true);
      const result = await dbService.sendTestEmail();
      if (result.success) {
        alert('Test email sent successfully!');
      } else {
        alert(`Failed to send test email: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to send test email');
    } finally {
      setEmailLoading(false);
    }
  };

  const sendDailyEmailNow = async () => {
    try {
      setEmailLoading(true);
      const result = await dbService.sendDailyEmailNow();
      if (result.success) {
        alert('Daily report email sent successfully!');
      } else {
        alert(`Failed to send daily report: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to send daily report');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleBarSettingsChange = (field, value) => {
    setBarSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEmailSettingsChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setEmailSettings(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setEmailSettings(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };



  const handleResetApplication = async () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    // Check if user typed "reset app" correctly
    if (resetConfirmText.trim().toLowerCase() !== 'reset app') {
      alert('Please type "reset app" exactly to confirm the reset.');
      return;
    }

    try {
      setResetLoading(true);
      const result = await dbService.resetApplication();
      
      if (result.success) {
        // Reset email settings in UI to default values
        setEmailSettings({
          host: '',
          port: 587,
          secure: false,
          auth: { user: '', pass: '' },
          from: '',
          to: '',
          enabled: false
        });
        
        // Force reload email settings from file (which should now be deleted)
        try {
          const freshEmailSettings = await dbService.getEmailSettings();
          setEmailSettings(freshEmailSettings);
        } catch (error) {
          console.log('Email settings file successfully deleted - using defaults');
        }
        
        // Reset bar settings to default values
        setBarSettings({
          bar_name: '',
          contact_number: '',
          gst_number: '',
          address: '',
          thank_you_message: '',
          printing_enabled: 1,
          admin_password: '123456'
        });
        
        alert('Application reset completed successfully!\n\nAll data has been cleared and default settings have been initialized.\n\nPlease restart the application for best results.');
        setShowResetConfirm(false);
        setResetConfirmText('');
        
        // Reload the page to reflect changes
        window.location.reload();
      } else {
        alert(`Failed to reset application: ${result.error}`);
      }
    } catch (error) {
      // Failed to reset application
      alert('Failed to reset application. Please try again.');
    } finally {
      setResetLoading(false);
      setShowResetConfirm(false);
      setResetConfirmText('');
    }
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
    setResetConfirmText('');
  };

  const handleCloseSell = async () => {
    try {
      setCloseSellLoading(true);
      const result = await dbService.closeSellAndGenerateReports();
      
      if (result.success) {
        const message = `Close Sell completed successfully!\n\n📁 Reports ZIP: ${result.zipPath}\n\n💾 Database Backup: ${result.databaseBackupPath || 'Failed to create'}\n\n📊 Reports Backup: ${result.reportsBackupPath || 'Failed to create'}\n\n📧 Email sent to owner: ${result.emailSent ? 'Yes' : 'No'}\n\n✅ All data has been safely backed up to your local machine!`;
        alert(message);
      } else {
        alert(`Failed to complete Close Sell: ${result.error}`);
      }
    } catch (error) {
      // Error in Close Sell
      alert('Failed to complete Close Sell. Please try again.');
    } finally {
      setCloseSellLoading(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Store },
    { id: 'offers', label: 'Offers', icon: Tag },
    { id: 'delivery', label: 'Delivery', icon: Truck },
    { id: 'menu-qr', label: 'Menu QR Code', icon: QrCode },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'sync', label: 'Cloud Sync', icon: CloudLightning },
    { id: 'system', label: 'System & Danger Zone', icon: AlertTriangle }
  ];

  const renderGeneralTab = () => (
    <>
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fdf1ef' }}>
            <Store size={16} color="#b6412c" />
          </div>
          <div>
            <h2>Shop Information</h2>
            <p>Name, contact, address and receipt message</p>
          </div>
        </div>
        <button onClick={() => setIsEditingBarInfo(!isEditingBarInfo)} className="cfg-btn cfg-btn-ghost">
          <Edit size={14} />
          {isEditingBarInfo ? 'Cancel' : 'Edit'}
        </button>
      </div>
      <div className="cfg-card-body">
        {isEditingBarInfo ? (
          <div className="cfg-form-grid">
            <div className="cfg-field">
              <label>Shop Name</label>
              <input type="text" value={barSettings.bar_name} onChange={(e) => handleBarSettingsChange('bar_name', e.target.value)} className="cfg-input" placeholder="e.g. Malabar Waffle" />
            </div>
            <div className="cfg-field">
              <label>Contact Number</label>
              <input type="text" value={barSettings.contact_number} onChange={(e) => handleBarSettingsChange('contact_number', e.target.value)} className="cfg-input" placeholder="+91 98765 43210" />
            </div>
            <div className="cfg-field">
              <label>GST Number</label>
              <input type="text" value={barSettings.gst_number} onChange={(e) => handleBarSettingsChange('gst_number', e.target.value)} className="cfg-input" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div className="cfg-field span-2">
              <label>Address</label>
              <textarea value={barSettings.address} onChange={(e) => handleBarSettingsChange('address', e.target.value)} className="cfg-input cfg-textarea" placeholder="Full address printed on receipts" rows="3" />
            </div>
            <div className="cfg-field span-2">
              <label>Thank You Message</label>
              <input type="text" value={barSettings.thank_you_message} onChange={(e) => handleBarSettingsChange('thank_you_message', e.target.value)} className="cfg-input" placeholder="Thank you for visiting!" />
            </div>
            <div className="cfg-field span-2">
              <button onClick={saveBarSettings} disabled={loading} className="cfg-btn cfg-btn-primary" style={{ width: 'fit-content' }}>
                <Save size={15} />
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <dl className="cfg-display-grid">
            <div className="cfg-display-item"><dt>Shop Name</dt><dd>{barSettings.bar_name || '—'}</dd></div>
            <div className="cfg-display-item"><dt>Contact Number</dt><dd>{barSettings.contact_number || '—'}</dd></div>
            <div className="cfg-display-item"><dt>GST Number</dt><dd>{barSettings.gst_number || '—'}</dd></div>
            <div className="cfg-display-item span-2"><dt>Address</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{barSettings.address || '—'}</dd></div>
            <div className="cfg-display-item span-2"><dt>Thank You Message</dt><dd>{barSettings.thank_you_message || 'Thank you for visiting!'}</dd></div>
          </dl>
        )}
      </div>
    </div>

    <div className="cfg-card" style={{ marginTop: '20px' }}>
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fdf1ef' }}>
            <Package size={16} color="#b6412c" />
          </div>
          <div>
            <h2>Parcel</h2>
            <p>Takeaway charge for dine-in orders ticked as Parcel (website &amp; kiosk)</p>
          </div>
        </div>
      </div>
      <div className="cfg-card-body">
        <div style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="cfg-field-group">
            <label className="cfg-label">Parcel Charge (₹)</label>
            <input
              type="number"
              className="cfg-input"
              style={{ maxWidth: '140px' }}
              value={barSettings.parcel_charge ?? ''}
              min={0}
              onFocus={e => e.target.select()}
              onChange={e => handleBarSettingsChange('parcel_charge', e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={e => { if (e.target.value === '') handleBarSettingsChange('parcel_charge', 0); }}
            />
            <p className="cfg-hint">Added to the bill when a dine-in order is ticked as Parcel.</p>
          </div>
          <div>
            <button onClick={saveBarSettings} disabled={loading} className="cfg-btn cfg-btn-primary">
              <Save size={14} />
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );


  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const toggleOfferDate = (dateStr) => {
    const current = barSettings.offer_dates || [];
    const updated = current.includes(dateStr)
      ? current.filter((d) => d !== dateStr)
      : [...current, dateStr].sort();
    handleBarSettingsChange('offer_dates', updated);
  };

  const prevMonth = () => {
    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1); }
    else setCalendarMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1); }
    else setCalendarMonth((m) => m + 1);
  };

  const renderOfferCalendar = () => {
    const year = calendarYear;
    const month = calendarMonth;
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedDates = barSettings.offer_dates || [];

    // Today in IST
    const istNow = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
    const todayStr = istNow.toISOString().slice(0, 10);

    const cells = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr });
    }

    return (
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', maxWidth: '340px' }}>
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={18} style={{ color: '#475569' }} />
          </button>
          <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{MONTH_NAMES[month]} {year}</strong>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={18} style={{ color: '#475569' }} />
          </button>
        </div>
        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
          {DAY_LABELS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: '700', color: '#94a3b8', padding: '4px 0' }}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {cells.map((cell, i) =>
            cell === null ? (
              <div key={`e-${i}`} />
            ) : (
              <button
                key={cell.dateStr}
                onClick={() => toggleOfferDate(cell.dateStr)}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  border: cell.dateStr === todayStr ? '2px solid #1C5C3A' : 'none',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: selectedDates.includes(cell.dateStr) ? '700' : '500',
                  background: selectedDates.includes(cell.dateStr) ? '#EAB308' : 'transparent',
                  color: selectedDates.includes(cell.dateStr) ? '#1e293b' : cell.dateStr === todayStr ? '#1C5C3A' : '#334155',
                  transition: 'all 0.15s',
                }}
              >
                {cell.day}
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  const renderOffersTab = () => (
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fefce8' }}>
            <Tag size={16} color="#ca8a04" />
          </div>
          <div>
            <h2>1+1 Offer</h2>
            <p>Buy-one-get-one on selected dates</p>
          </div>
        </div>
        {barSettings.offer_enabled
          ? <span className="cfg-badge cfg-badge-yellow">Active</span>
          : <span className="cfg-badge cfg-badge-slate">Off</span>}
      </div>
      <div className="cfg-card-body">
        <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: '#64748b', lineHeight: '1.6' }}>
          When active, every 2 waffles follow the <strong>1+1 rule</strong> — the cheaper one in each pair is free. Quantities lock to even numbers. Applies only on selected dates (IST).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '520px' }}>
          <label className="cfg-switch-row" onClick={() => handleBarSettingsChange('offer_enabled', !barSettings.offer_enabled)}>
            <div className={`cfg-switch-track ${barSettings.offer_enabled ? 'on' : ''}`} style={barSettings.offer_enabled ? { background: '#EAB308' } : {}}>
              <div className="cfg-switch-thumb" />
            </div>
            <span className="cfg-switch-label" style={barSettings.offer_enabled ? { color: '#92400e' } : {}}>
              {barSettings.offer_enabled ? 'Offer ON — select dates below to activate' : 'Offer OFF'}
            </span>
          </label>

          {barSettings.offer_enabled && (
            <>
              <div className="cfg-field">
                <label>Offer Dates</label>
                <p className="cfg-hint" style={{ margin: '0 0 10px' }}>Tap a date to toggle it on/off. Yellow = active.</p>
                {renderOfferCalendar()}
              </div>

              {(barSettings.offer_dates || []).length > 0 && (
                <div className="cfg-field">
                  <label>Selected ({(barSettings.offer_dates || []).length})</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {(barSettings.offer_dates || []).map((d) => (
                      <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '999px', padding: '3px 10px', fontSize: '0.78rem', fontWeight: '600', color: '#92400e' }}>
                        {d}
                        <button onClick={() => toggleOfferDate(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#b45309', display: 'flex', lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="cfg-alert-box cfg-alert-info">
                <strong>How it works:</strong> Sort all waffles by price (high → low). The cheapest half are free.
                E.g. 4 items ₹149 + ₹130 + ₹120 + ₹99 → you pay ₹149 + ₹130, free: ₹120 + ₹99.
              </div>
            </>
          )}

          <div>
            <button onClick={saveBarSettings} disabled={loading} className="cfg-btn cfg-btn-primary" style={{ background: '#ca8a04', borderColor: '#ca8a04' }}>
              <Save size={14} />
              {loading ? 'Saving…' : 'Save Offer Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDeliveryTab = () => (
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fdf1ef' }}>
            <Truck size={16} color="#b6412c" />
          </div>
          <div>
            <h2>Delivery</h2>
            <p>Home delivery on the customer website</p>
          </div>
        </div>
        {barSettings.delivery_enabled
          ? <span className="cfg-badge cfg-badge-green">Enabled</span>
          : <span className="cfg-badge cfg-badge-slate">Disabled</span>}
      </div>
      <div className="cfg-card-body">
        <div style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label className="cfg-switch-row" onClick={() => handleBarSettingsChange('delivery_enabled', !barSettings.delivery_enabled)}>
            <div className={`cfg-switch-track ${barSettings.delivery_enabled ? 'on' : ''}`}>
              <div className="cfg-switch-thumb" />
            </div>
            <span className="cfg-switch-label">
              {barSettings.delivery_enabled ? 'Delivery is ON — customers can order to home' : 'Delivery is OFF — dine-in / pickup only'}
            </span>
          </label>
          {barSettings.delivery_enabled && (
            <>
              {(() => {
                const fmt12h = (t) => {
                  if (!t) return '—';
                  const [hh, mm] = t.split(':').map(Number);
                  const ampm = hh >= 12 ? 'PM' : 'AM';
                  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`;
                };
                const btnStyle = {
                  padding: '10px 18px', borderRadius: '10px',
                  border: '1.5px solid #d1d5db', background: '#fff',
                  fontSize: '16px', fontWeight: '700', color: '#1c5c3a',
                  minWidth: '120px', textAlign: 'center', userSelect: 'none',
                };
                return (
                  <div className="cfg-field-group">
                    <label className="cfg-label">Delivery Hours</label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <div style={btnStyle}>{fmt12h(barSettings.delivery_start_time || '16:00')}</div>
                        <input type="time"
                          value={barSettings.delivery_start_time || '16:00'}
                          onChange={e => handleBarSettingsChange('delivery_start_time', e.target.value)}
                          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                        />
                      </div>
                      <span style={{ color: '#888', fontWeight: '600' }}>to</span>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <div style={btnStyle}>{fmt12h(barSettings.delivery_end_time || '22:00')}</div>
                        <input type="time"
                          value={barSettings.delivery_end_time || '22:00'}
                          onChange={e => handleBarSettingsChange('delivery_end_time', e.target.value)}
                          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                    <p className="cfg-hint">Tap to set time. Customers will see this window on the ordering page.</p>
                  </div>
                );
              })()}
              <div className="cfg-field-group">
                <label className="cfg-label">Minimum Order for Free Delivery (₹)</label>
                <input
                  type="number"
                  className="cfg-input"
                  style={{ maxWidth: '140px' }}
                  value={barSettings.delivery_min_order ?? ''}
                  min={0}
                  onFocus={e => e.target.select()}
                  onChange={e => handleBarSettingsChange('delivery_min_order', e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={e => { if (e.target.value === '') handleBarSettingsChange('delivery_min_order', 0); }}
                />
                <p className="cfg-hint">Orders below this amount will be charged a delivery fee.</p>
              </div>
              <div className="cfg-field-group">
                <label className="cfg-label">Delivery Fee for Orders Below Minimum (₹)</label>
                <input
                  type="number"
                  className="cfg-input"
                  style={{ maxWidth: '140px' }}
                  value={barSettings.delivery_fee ?? ''}
                  min={0}
                  onFocus={e => e.target.select()}
                  onChange={e => handleBarSettingsChange('delivery_fee', e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={e => { if (e.target.value === '') handleBarSettingsChange('delivery_fee', 0); }}
                />
                <p className="cfg-hint">Charged when order total is below the minimum above.</p>
              </div>
            </>
          )}
          <div>
            <button onClick={saveBarSettings} disabled={loading} className="cfg-btn cfg-btn-primary">
              <Save size={14} />
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMenuQrTab = () => {
    const customerUrl = barSettings.hosted_app_url || 'https://counterflow-kiosk.web.app/';
    return (
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fefce8' }}>
            <QrCode size={16} color="#ca8a04" />
          </div>
          <div>
            <h2>Customer Website QR</h2>
            <p>QR code for your deployed customer ordering website</p>
          </div>
        </div>
      </div>
      <div className="cfg-card-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
            {tableQrCodeUrl
              ? <img src={tableQrCodeUrl} alt="Customer Website QR" style={{ width: '200px', height: '200px', display: 'block' }} />
              : <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Generating…</div>}
          </div>

          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontWeight: '700', fontSize: '0.9rem', color: '#1e293b' }}>Customer Website Link</p>
            <code style={{ fontSize: '0.78rem', color: '#b6412c', wordBreak: 'break-all', display: 'block', background: '#fff3f0', padding: '5px 10px', borderRadius: '7px', border: '1px solid #ffe3dd' }}>
              {customerUrl}
            </code>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href={customerUrl} target="_blank" rel="noopener noreferrer" className="cfg-btn cfg-btn-ghost" style={{ textDecoration: 'none' }}>
              Open Website
            </a>
            <button onClick={handleDownloadQr} className="cfg-btn cfg-btn-ghost">Download PNG</button>
            <button onClick={handlePrintQr} className="cfg-btn cfg-btn-primary" style={{ background: '#1C5C3A', borderColor: '#1C5C3A' }}>Print Poster</button>
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderSecurityTab = () => (
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fef2f2' }}>
            <Lock size={16} color="#ef4444" />
          </div>
          <div>
            <h2>Admin Password</h2>
            <p>Protects Products, Sales, Settings and Spendings</p>
          </div>
        </div>
        <button onClick={() => { setIsEditingSecurity(!isEditingSecurity); setCurrentPasswordInput(''); setNewPasswordInput(''); setConfirmPasswordInput(''); }} className="cfg-btn cfg-btn-ghost">
          <Edit size={14} />
          {isEditingSecurity ? 'Cancel' : 'Change Password'}
        </button>
      </div>
      <div className="cfg-card-body">
        {isEditingSecurity ? (
          <div className="cfg-form-grid cols-1">
            <div className="cfg-field">
              <label>Current Password</label>
              <input type="password" value={currentPasswordInput} onChange={(e) => setCurrentPasswordInput(e.target.value)} className="cfg-input" placeholder="Enter current password" />
            </div>
            <div className="cfg-field">
              <label>New Password (min 6 chars)</label>
              <input type="password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value.substring(0, 10))} className="cfg-input" placeholder="Enter new password" />
            </div>
            <div className="cfg-field">
              <label>Confirm New Password</label>
              <input type="password" value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value.substring(0, 10))} className="cfg-input" placeholder="Confirm new password" />
            </div>
            <div>
              <button onClick={handlePasswordChange} disabled={securityLoading} className="cfg-btn cfg-btn-primary">
                <Save size={14} />
                {securityLoading ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', lineHeight: '1.7', maxWidth: '480px' }}>
            Access to protected screens requires the admin password. Default is <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '5px', fontSize: '0.85em' }}>123456</code>. Change it above to secure your POS.
          </p>
        )}
      </div>
    </div>
  );

  const renderSyncTab = () => (
    <div className="cfg-card">
      <div className="cfg-card-hdr">
        <div className="cfg-card-hdr-left">
          <div className="cfg-card-icon" style={{ background: '#fffbeb' }}>
            <CloudLightning size={16} color="#d97706" />
          </div>
          <div>
            <h2>Cloud Sync</h2>
            <p>Firebase Firestore connection and menu upload</p>
          </div>
        </div>
        {getFirebaseDb()
          ? <span className="cfg-badge cfg-badge-green">Connected</span>
          : <span className="cfg-badge cfg-badge-red">Not configured</span>}
      </div>
      <div className="cfg-card-body">
        <dl className="cfg-display-grid" style={{ marginBottom: '20px' }}>
          <div className="cfg-display-item span-2">
            <dt>Firestore Status</dt>
            <dd style={{ color: getFirebaseDb() ? '#16a34a' : '#ef4444' }}>
              {getFirebaseDb() ? '✓ Configured — live sync active' : '✗ Not configured — edit src/firebase.js first'}
            </dd>
          </div>
        </dl>

        {getFirebaseDb() && (
          <>
            <hr className="cfg-divider" />
            <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: '#64748b', lineHeight: '1.6', maxWidth: '480px' }}>
              Push local products, prices, and categories to Firestore so customers see the live catalog on the website.
            </p>
            <button onClick={syncMenuToCloud} disabled={syncingMenu} className="cfg-btn cfg-btn-primary" style={{ background: '#1C5C3A', borderColor: '#1C5C3A' }}>
              <CloudLightning size={14} />
              {syncingMenu ? 'Syncing…' : 'Sync Menu to Cloud'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const renderSystemTab = () => (
    <>
      {/* Close Sell */}
      <div className="cfg-card">
        <div className="cfg-card-hdr">
          <div className="cfg-card-hdr-left">
            <div className="cfg-card-icon" style={{ background: '#f1f5f9' }}>
              <RotateCcw size={16} color="#475569" />
            </div>
            <div>
              <h2>End of Day</h2>
              <p>Close sell, generate reports and email backup</p>
            </div>
          </div>
        </div>
        <div className="cfg-card-body">
          <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#64748b', lineHeight: '1.6', maxWidth: '480px' }}>
            Closes the current shift, creates a ZIP of all reports, backs up the database, and emails everything to the owner.
          </p>
          <button onClick={handleCloseSell} disabled={closeSellLoading} className="cfg-btn cfg-btn-ghost">
            <RotateCcw size={14} />
            {closeSellLoading ? 'Processing…' : 'Run Close Sell Now'}
          </button>
        </div>
      </div>

      {/* Info tiles */}
      <div className="cfg-info-grid">
        <div className="cfg-info-tile">
          <h3><Info size={15} color="#3b82f6" /> App Info</h3>
          <table>
            <tbody>
              <tr><td>Version</td><td>2.0.0</td></tr>
              <tr><td>Database</td><td>{typeof window !== 'undefined' && !!window.electronAPI ? 'SQLite' : 'IndexedDB'}</td></tr>
              <tr><td>Platform</td><td>{typeof window !== 'undefined' && !!window.electronAPI ? 'Electron' : 'Android / Web'}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="cfg-info-tile">
          <h3><HelpCircle size={15} color="#10b981" /> Support</h3>
          <table>
            <tbody>
              <tr><td>Email</td><td style={{ color: '#b6412c' }}>ajitreddy013@gmail.com</td></tr>
              <tr><td>Phone</td><td style={{ color: '#b6412c' }}>+91 7517323121</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone */}


      <div className="cfg-card cfg-danger-card">
        <div className="cfg-card-hdr">
          <div className="cfg-card-hdr-left">
            <div className="cfg-card-icon" style={{ background: '#fef2f2' }}>
              <AlertTriangle size={16} color="#ef4444" />
            </div>
            <div>
              <h2 style={{ color: '#ef4444' }}>Danger Zone</h2>
              <p>Irreversible actions — proceed with caution</p>
            </div>
          </div>
        </div>
        <div className="cfg-card-body">
          <div className="cfg-alert-box cfg-alert-warn" style={{ marginBottom: '18px' }}>
            <strong>Warning — this is permanent.</strong> Resetting wipes all local products, tables, configurations, spendings, and sales. Defaults are restored.
          </div>

          {!showResetConfirm ? (
            <button onClick={handleResetApplication} disabled={resetLoading} className="cfg-btn cfg-btn-danger">
              <RotateCcw size={14} />
              {resetLoading ? 'Resetting…' : 'Reset Entire Application'}
            </button>
          ) : (
            <div className="cfg-alert-box cfg-alert-danger" style={{ marginBottom: 0 }}>
              <p style={{ margin: '0 0 10px', fontWeight: '700', fontSize: '0.9rem' }}>Are you absolutely sure? This cannot be undone.</p>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', marginBottom: '6px' }}>Type &quot;reset app&quot; to confirm:</label>
              <input type="text" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="reset app" className="cfg-input" style={{ marginBottom: '12px', borderColor: '#fca5a5', background: '#fff' }} disabled={resetLoading} autoComplete="off" />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleResetApplication} disabled={resetLoading || resetConfirmText.trim().toLowerCase() !== 'reset app'} className="cfg-btn cfg-btn-danger">
                  {resetLoading ? 'Resetting…' : 'Yes, Delete All Data'}
                </button>
                <button onClick={cancelReset} disabled={resetLoading} className="cfg-btn cfg-btn-ghost">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="cfg-root">
      <style>{`
        /* ── Root ─────────────────────────────────────────────────────── */
        .cfg-root {
          min-height: 100vh;
          background: #f1f5f9;
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          color: #1e293b;
        }

        /* ── Page header ──────────────────────────────────────────────── */
        .cfg-page-header {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 0 32px;
          display: flex;
          align-items: center;
          height: 64px;
          gap: 14px;
        }
        .cfg-page-header-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, #b6412c 0%, #d85a42 100%);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cfg-page-header h1 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: -0.01em;
        }
        .cfg-page-header p {
          margin: 0;
          font-size: 0.82rem;
          color: #94a3b8;
          font-weight: 500;
        }

        /* ── Body layout ──────────────────────────────────────────────── */
        .cfg-body {
          display: grid;
          grid-template-columns: 224px 1fr;
          gap: 0;
          max-width: 1280px;
          margin: 0 auto;
          padding: 28px 24px;
          align-items: start;
          gap: 24px;
        }

        /* ── Sidebar ──────────────────────────────────────────────────── */
        .cfg-sidebar {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          position: sticky;
          top: 24px;
        }
        .cfg-sidebar-brand {
          padding: 18px 16px 14px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cfg-sidebar-brand-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
        }
        .cfg-sidebar-brand span {
          font-size: 0.78rem;
          font-weight: 600;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cfg-nav-section {
          padding: 10px 8px;
        }
        .cfg-nav-section + .cfg-nav-section {
          border-top: 1px solid #f1f5f9;
          padding-top: 10px;
        }
        .cfg-nav-label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
          padding: 4px 10px 6px;
        }
        .cfg-nav-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: #475569;
          font-size: 0.88rem;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          width: 100%;
          line-height: 1;
        }
        .cfg-nav-btn:hover {
          background: #f8fafc;
          color: #1e293b;
        }
        .cfg-nav-btn.active {
          background: #fdf1ef;
          color: #b6412c;
          font-weight: 700;
        }
        .cfg-nav-btn.active svg {
          color: #b6412c;
        }
        .cfg-nav-btn svg {
          flex-shrink: 0;
          color: #94a3b8;
        }
        .cfg-nav-btn.active .cfg-nav-pip {
          background: #b6412c;
        }
        .cfg-nav-pip {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: transparent;
          margin-left: auto;
          flex-shrink: 0;
        }

        /* ── Panel area ───────────────────────────────────────────────── */
        .cfg-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: cfgFadeIn 0.2s ease-out;
        }
        @keyframes cfgFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Cards ────────────────────────────────────────────────────── */
        .cfg-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
        }
        .cfg-card-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 24px;
          border-bottom: 1px solid #f1f5f9;
        }
        .cfg-card-hdr-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cfg-card-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cfg-card-hdr h2 {
          margin: 0;
          font-size: 0.98rem;
          font-weight: 700;
          color: #0f172a;
        }
        .cfg-card-hdr p {
          margin: 2px 0 0;
          font-size: 0.78rem;
          color: #94a3b8;
          font-weight: 500;
        }
        .cfg-card-body {
          padding: 24px;
        }

        /* ── Form elements ────────────────────────────────────────────── */
        .cfg-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        .cfg-form-grid.cols-1 {
          grid-template-columns: 1fr;
          max-width: 520px;
        }
        .cfg-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cfg-field.span-2 {
          grid-column: 1 / -1;
        }
        .cfg-field label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .cfg-input {
          padding: 10px 14px;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          color: #1e293b;
          font-size: 0.92rem;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          width: 100%;
          box-sizing: border-box;
        }
        .cfg-input:focus {
          border-color: #b6412c;
          background: #ffffff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(182, 65, 44, 0.08);
        }
        .cfg-textarea {
          min-height: 84px;
          resize: vertical;
        }
        .cfg-hint {
          font-size: 0.76rem;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
        }

        /* ── Toggle switch ────────────────────────────────────────────── */
        .cfg-switch-row {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          user-select: none;
          padding: 10px 0;
        }
        .cfg-switch-track {
          position: relative;
          width: 44px; height: 24px;
          background: #cbd5e1;
          border-radius: 12px;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .cfg-switch-track.on { background: #1C5C3A; }
        .cfg-switch-thumb {
          position: absolute;
          top: 2px; left: 2px;
          width: 20px; height: 20px;
          background: #fff;
          border-radius: 50%;
          transition: left 0.2s cubic-bezier(0.3, 1.5, 0.7, 1);
          box-shadow: 0 1px 4px rgba(0,0,0,0.18);
        }
        .cfg-switch-track.on .cfg-switch-thumb { left: 22px; }
        .cfg-switch-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: #334155;
        }

        /* ── Buttons ──────────────────────────────────────────────────── */
        .cfg-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 18px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1.5px solid transparent;
          font-family: inherit;
          white-space: nowrap;
        }
        .cfg-btn-primary {
          background: #b6412c;
          color: #ffffff;
          border-color: #b6412c;
        }
        .cfg-btn-primary:hover:not(:disabled) {
          background: #c94e38;
          box-shadow: 0 4px 12px rgba(182,65,44,0.25);
          transform: translateY(-1px);
        }
        .cfg-btn-ghost {
          background: transparent;
          border-color: #e2e8f0;
          color: #475569;
        }
        .cfg-btn-ghost:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #1e293b;
        }
        .cfg-btn-danger {
          background: #ef4444;
          color: #ffffff;
          border-color: #ef4444;
        }
        .cfg-btn-danger:hover:not(:disabled) {
          background: #f87171;
          transform: translateY(-1px);
        }
        .cfg-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        /* ── Display rows ─────────────────────────────────────────────── */
        .cfg-display-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0;
        }
        .cfg-display-item {
          padding: 14px 16px;
          border-bottom: 1px solid #f1f5f9;
          border-right: 1px solid #f1f5f9;
        }
        .cfg-display-item:nth-child(2n) { border-right: none; }
        .cfg-display-item.span-2 { grid-column: 1 / -1; border-right: none; }
        .cfg-display-item:last-child, .cfg-display-item:nth-last-child(2):not(.span-2) { border-bottom: none; }
        .cfg-display-item dt {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #94a3b8;
          margin: 0 0 4px;
        }
        .cfg-display-item dd {
          margin: 0;
          font-size: 0.92rem;
          color: #1e293b;
          font-weight: 500;
        }

        /* ── Status badges ────────────────────────────────────────────── */
        .cfg-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 700;
        }
        .cfg-badge-green  { background: #dcfce7; color: #15803d; }
        .cfg-badge-blue   { background: #e0f2fe; color: #0369a1; }
        .cfg-badge-yellow { background: #fef3c7; color: #b45309; }
        .cfg-badge-slate  { background: #f1f5f9; color: #475569; }
        .cfg-badge-red    { background: #fee2e2; color: #b91c1c; }

        /* ── QR container ─────────────────────────────────────────────── */
        .cfg-qr-shell {
          display: flex;
          flex-direction: column;
          align-items: center;
          border: 1.5px dashed #e2e8f0;
          border-radius: 14px;
          padding: 28px 24px;
          background: #f8fafc;
          text-align: center;
          min-height: 220px;
          justify-content: center;
        }

        /* ── Info tiles ───────────────────────────────────────────────── */
        .cfg-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .cfg-info-tile {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px 20px;
        }
        .cfg-info-tile h3 {
          margin: 0 0 10px;
          font-size: 0.88rem;
          font-weight: 700;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .cfg-info-tile table { width: 100%; border-collapse: collapse; font-size: 0.83rem; }
        .cfg-info-tile td { padding: 7px 0; border-bottom: 1px solid #f1f5f9; }
        .cfg-info-tile tr:last-child td { border-bottom: none; }
        .cfg-info-tile td:first-child { color: #64748b; font-weight: 600; }
        .cfg-info-tile td:last-child { text-align: right; font-weight: 600; color: #1e293b; }

        /* ── Danger zone ──────────────────────────────────────────────── */
        .cfg-danger-card {
          border-color: #fca5a5 !important;
        }
        .cfg-danger-card .cfg-card-hdr {
          background: #fef2f2;
          border-bottom-color: #fca5a5;
        }
        .cfg-alert-box {
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 0.85rem;
          line-height: 1.6;
          margin-bottom: 18px;
        }
        .cfg-alert-warn {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }
        .cfg-alert-danger {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }
        .cfg-alert-success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #15803d;
        }
        .cfg-alert-info {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        /* ── Divider ──────────────────────────────────────────────────── */
        .cfg-divider {
          border: none;
          border-top: 1px solid #f1f5f9;
          margin: 20px 0;
        }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 860px) {
          .cfg-body { grid-template-columns: 1fr; padding: 16px; }
          .cfg-sidebar { position: static; }
          .cfg-form-grid { grid-template-columns: 1fr; }
          .cfg-display-grid { grid-template-columns: 1fr; }
          .cfg-info-grid { grid-template-columns: 1fr; }
          .cfg-display-item { border-right: none; }
        }
      `}</style>

      <div className="cfg-body">
        {/* ── Sidebar ── */}
        <nav className="cfg-sidebar">
          <div className="cfg-nav-section">
            <div className="cfg-nav-label">Store</div>
            {[
              { id: 'general',      label: 'General',        icon: Store },
              { id: 'delivery',     label: 'Delivery',       icon: Truck },
              { id: 'offers',       label: 'Offers',         icon: Tag },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} className={`cfg-nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                <Icon size={16} /><span>{label}</span><span className="cfg-nav-pip" />
              </button>
            ))}
          </div>

          <div className="cfg-nav-section">
            <div className="cfg-nav-label">Online</div>
            {[
              { id: 'menu-qr', label: 'Menu QR Code',   icon: QrCode },
              { id: 'sync',    label: 'Cloud Sync',     icon: CloudLightning },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} className={`cfg-nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                <Icon size={16} /><span>{label}</span><span className="cfg-nav-pip" />
              </button>
            ))}
          </div>

          <div className="cfg-nav-section">
            <div className="cfg-nav-label">System</div>
            {[
              { id: 'security', label: 'Security',          icon: Lock },
              { id: 'system',   label: 'System & Reset',    icon: AlertTriangle },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} className={`cfg-nav-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
                <Icon size={16} /><span>{label}</span><span className="cfg-nav-pip" />
              </button>
            ))}
          </div>
        </nav>

        {/* ── Panel ── */}
        <div className="cfg-panel">
          {!settingsLoaded ? (
            <div className="cfg-card">
              <div className="cfg-card-body" style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                Loading settings…
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'general'      && renderGeneralTab()}
              {activeTab === 'offers'       && renderOffersTab()}
              {activeTab === 'delivery'     && renderDeliveryTab()}
              {activeTab === 'menu-qr'      && renderMenuQrTab()}
              {activeTab === 'security'     && renderSecurityTab()}
              {activeTab === 'sync'         && renderSyncTab()}
              {activeTab === 'system'       && renderSystemTab()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
