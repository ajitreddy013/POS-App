import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Store, Save, Edit, Mail, Send, TestTube, RotateCcw, AlertTriangle, Info, HelpCircle, MessageCircle, Wifi, WifiOff, CreditCard, Lock, CloudLightning, QrCode } from 'lucide-react';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';
import { getFirebaseDb } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';
import QRCode from 'qrcode';

const Settings = () => {
  const [barSettings, setBarSettings] = useState({
    bar_name: '',
    contact_number: '',
    gst_number: '',
    address: '',
    thank_you_message: '',
    printing_enabled: 1,
    whatsapp_enabled: 0,
    whatsapp_relay_url: '',
    whatsapp_template_name: 'counterflow_pos_receipt',
    whatsapp_language_code: 'en',
    whatsapp_default_country_code: '91',
    admin_password: '123456',
    firebase_config: '',
    hosted_app_url: ''
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
  const [activeTab, setActiveTab] = useState('integrations');
  const [isEditingBarInfo, setIsEditingBarInfo] = useState(false);
  const [isEditingEmailInfo, setIsEditingEmailInfo] = useState(false);
  const [isEditingWhatsappInfo, setIsEditingWhatsappInfo] = useState(false);
  const [isEditingRazorpayInfo, setIsEditingRazorpayInfo] = useState(false);
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

  const [whatsappStatus, setWhatsappStatus] = useState('DISCONNECTED');
  const [whatsappQr, setWhatsappQr] = useState(null);
  const [whatsappError, setWhatsappError] = useState(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  // Self-Ordering Table QR States
  const [tablesList, setTablesList] = useState([]);
  const [selectedTable, setSelectedTable] = useState('Parcel');
  const [tableQrCodeUrl, setTableQrCodeUrl] = useState('');

  useEffect(() => {
    if (whatsappError) {
      const timer = setTimeout(() => {
        setWhatsappError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [whatsappError]);

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

  const handlePrintQr = () => {
    const hostedUrl = barSettings.hosted_app_url || window.location.origin;
    const targetUrl = `${hostedUrl}/#/menu`;
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
                <div class="logo">${barSettings.bar_name || 'MALABAR WAFFLE'}</div>
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
    const hostedUrl = barSettings.hosted_app_url || window.location.origin;
    const targetUrl = `${hostedUrl}/#/menu`;
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

  const getActiveRelayUrl = () => {
    return barSettings.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
  };

  useEffect(() => {
    let intervalId = null;
    const activeUrl = getActiveRelayUrl();
    
    if (activeUrl) {
      checkRelayStatus();
      intervalId = setInterval(checkRelayStatus, 5000); // Poll every 5 seconds
    } else {
      setWhatsappStatus('DISCONNECTED');
      setWhatsappQr(null);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [barSettings.whatsapp_relay_url]);

  useEffect(() => {
    const hostedUrl = barSettings.hosted_app_url || window.location.origin;
    const targetUrl = `${hostedUrl}/#/menu`;
    
    QRCode.toDataURL(targetUrl, { width: 350, margin: 2 })
      .then(url => {
        setTableQrCodeUrl(url);
      })
      .catch(err => {
        console.error('Error generating table QR:', err);
      });
  }, [selectedTable, barSettings.hosted_app_url]);

  const checkRelayStatus = async () => {
    const activeUrl = getActiveRelayUrl();
    if (!activeUrl) return;
    try {
      const data = await whatsappService.getStatus(activeUrl);
      setWhatsappStatus(data.status);
      setWhatsappQr(data.qrCode);
      setWhatsappError(data.error || null);
    } catch (err) {
      setWhatsappStatus('DISCONNECTED');
      setWhatsappQr(null);
      setWhatsappError(err.message);
    }
  };

  const handleWhatsappLogout = async () => {
    const activeUrl = getActiveRelayUrl();
    if (!activeUrl) return;
    try {
      setWhatsappLoading(true);
      const res = await whatsappService.logout(activeUrl);
      if (res.success) {
        alert('WhatsApp unlinked successfully!');
        setWhatsappStatus('DISCONNECTED');
        setWhatsappQr(null);
      } else {
        alert(`Failed to unlink: ${res.error}`);
      }
    } catch (err) {
      alert(`Error unlinking WhatsApp: ${err.message}`);
    } finally {
      setWhatsappLoading(false);
    }
  };



  const loadBarSettings = async () => {
    try {
      const settings = await dbService.getBarSettings();
      setBarSettings(settings);
    } catch (error) {
      // Failed to load bar settings
    }
  };

  const [syncingMenu, setSyncingMenu] = useState(false);

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

      const batch = writeBatch(db);
      products.forEach((p) => {
        const docRef = doc(db, "products", String(p.id));
        batch.set(docRef, {
          id: String(p.id),
          name: p.name,
          price: Number(p.price) || 0,
          category: p.category || "General",
          image: p.image || "",
          available: true
        });
      });

      await batch.commit();
      alert(`Menu synchronized successfully! ${products.length} products uploaded to the cloud.`);
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
      setIsEditingBarInfo(false);
      setIsEditingWhatsappInfo(false);
      setIsEditingRazorpayInfo(false);
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
          whatsapp_enabled: 0,
          whatsapp_relay_url: '',
          whatsapp_template_name: 'counterflow_pos_receipt',
          whatsapp_language_code: 'en',
          whatsapp_default_country_code: '91',
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
    { id: 'integrations', label: 'Integrations', icon: MessageCircle },
    { id: 'general', label: 'General', icon: Store },
    { id: 'menu-qr', label: 'Menu QR Code', icon: QrCode },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'sync', label: 'Cloud Sync', icon: CloudLightning },
    { id: 'system', label: 'System & Danger Zone', icon: AlertTriangle }
  ];

  const renderGeneralTab = () => (
    <div className="settings-card-modern">
      <div className="settings-card-hdr">
        <h2><Store size={20} style={{ color: '#b6412c' }} /> Shop Information</h2>
        <button 
          onClick={() => setIsEditingBarInfo(!isEditingBarInfo)}
          className="btn-modern btn-modern-secondary"
        >
          <Edit size={16} />
          {isEditingBarInfo ? 'Cancel' : 'Edit Info'}
        </button>
      </div>
      <div className="settings-card-body-modern">
        {isEditingBarInfo ? (
          <div className="form-grid-modern">
            <div className="form-group-modern">
              <label>Shop Name</label>
              <input
                type="text"
                value={barSettings.bar_name}
                onChange={(e) => handleBarSettingsChange('bar_name', e.target.value)}
                className="input-modern"
                placeholder="Enter shop name"
              />
            </div>
            <div className="form-group-modern">
              <label>Contact Number</label>
              <input
                type="text"
                value={barSettings.contact_number}
                onChange={(e) => handleBarSettingsChange('contact_number', e.target.value)}
                className="input-modern"
                placeholder="Enter contact number"
              />
            </div>
            <div className="form-group-modern">
              <label>GST Number</label>
              <input
                type="text"
                value={barSettings.gst_number}
                onChange={(e) => handleBarSettingsChange('gst_number', e.target.value)}
                className="input-modern"
                placeholder="Enter GST number"
              />
            </div>
            <div className="form-group-modern full-width">
              <label>Address</label>
              <textarea
                value={barSettings.address}
                onChange={(e) => handleBarSettingsChange('address', e.target.value)}
                className="input-modern textarea-modern"
                placeholder="Enter complete address"
                rows="3"
              />
            </div>
            <div className="form-group-modern full-width">
              <label>Thank You Message</label>
              <input
                type="text"
                value={barSettings.thank_you_message}
                onChange={(e) => handleBarSettingsChange('thank_you_message', e.target.value)}
                className="input-modern"
                placeholder="Enter thank you message for bills"
              />
            </div>
            <div className="form-group-modern full-width" style={{ marginTop: '10px' }}>
              <button 
                onClick={saveBarSettings}
                disabled={loading}
                className="btn-modern btn-modern-primary"
                style={{ width: 'fit-content' }}
              >
                <Save size={16} />
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="display-grid">
            <div className="display-item">
              <h4>Shop Name</h4>
              <p>{barSettings.bar_name || 'Not set'}</p>
            </div>
            <div className="display-item">
              <h4>Contact Number</h4>
              <p>{barSettings.contact_number || 'Not set'}</p>
            </div>
            <div className="display-item">
              <h4>GST Number</h4>
              <p>{barSettings.gst_number || 'Not set'}</p>
            </div>
            <div className="display-item" style={{ gridColumn: '1 / -1' }}>
              <h4>Address</h4>
              <p style={{ whiteSpace: 'pre-wrap' }}>{barSettings.address || 'Not set'}</p>
            </div>
            <div className="display-item" style={{ gridColumn: '1 / -1' }}>
              <h4>Thank You Message</h4>
              <p>{barSettings.thank_you_message || 'Thank you for visiting!'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderIntegrationsTab = () => (
    <>
      {/* WhatsApp Linked Devices Section */}
      <div className="settings-card-modern" style={{ marginBottom: '30px' }}>
        <div className="settings-card-hdr">
          <h2><MessageCircle size={20} style={{ color: '#25D366' }} /> WhatsApp Linked Devices</h2>
        </div>
        <div className="settings-card-body-modern">
          <div className="display-grid">
            <div>
              <h4>Relay Status</h4>
              <div style={{ marginTop: '10px' }}>
                {whatsappStatus === 'CONNECTED' ? (
                  <span className="status-badge connected">
                    <Wifi size={16} /> Linked / Active
                  </span>
                ) : whatsappStatus === 'AUTHENTICATING' ? (
                  <span className="status-badge authenticating">
                    <RotateCcw size={16} className="spin" /> Syncing...
                  </span>
                ) : whatsappStatus === 'QR_READY' ? (
                  <span className="status-badge qr-ready">
                    <MessageCircle size={16} /> Scan QR Code
                  </span>
                ) : whatsappStatus === 'INITIALIZING' ? (
                  <span className="status-badge initializing">
                    <RotateCcw size={16} className="spin" /> Connecting...
                  </span>
                ) : (
                  <span className="status-badge disconnected">
                    <WifiOff size={16} /> Offline / Disabled
                  </span>
                )}
              </div>

              {whatsappStatus === 'CONNECTED' && (
                <button
                  onClick={handleWhatsappLogout}
                  disabled={whatsappLoading}
                  className="btn-modern btn-modern-secondary"
                  style={{ marginTop: '24px', color: '#ef4444', borderColor: '#fca5a5' }}
                >
                  <WifiOff size={16} />
                  {whatsappLoading ? 'Unlinking...' : 'Unlink Device'}
                </button>
              )}
            </div>

            <div>
              <div className="qr-card-container">
                {whatsappStatus === 'QR_READY' && whatsappQr ? (
                  <>
                    <p style={{ margin: '0 0 14px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#1e293b' }}>
                      Scan this QR code with WhatsApp Linked Devices:
                    </p>
                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                      <img src={whatsappQr} alt="WhatsApp QR Code" style={{ width: '180px', height: '180px', display: 'block' }} />
                    </div>
                  </>
                ) : whatsappStatus === 'CONNECTED' ? (
                  <div style={{ color: '#16a34a' }}>
                    <MessageCircle size={48} style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ margin: 0, fontWeight: '700', fontSize: '1.1rem' }}>WhatsApp Linked!</p>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748b', lineHeight: '1.4' }}>
                      POS receipts will be sent automatically from your connected phone.
                    </p>
                  </div>
                ) : whatsappStatus === 'AUTHENTICATING' ? (
                  <div style={{ color: '#0288d1' }}>
                    <RotateCcw size={48} className="spin" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ margin: 0, fontWeight: '700' }}>Authenticated!</p>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                      Syncing data. Please wait...
                    </p>
                  </div>
                ) : whatsappStatus === 'INITIALIZING' ? (
                  <div style={{ color: '#475569' }}>
                    <RotateCcw size={48} className="spin" style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ margin: 0, fontWeight: '600' }}>Connecting to WhatsApp Session...</p>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                      Preparing WhatsApp driver.
                    </p>
                  </div>
                ) : (
                  <div style={{ color: '#64748b' }}>
                    <WifiOff size={48} style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ margin: 0, fontWeight: '600' }}>Relay is offline or linking is waiting.</p>
                    {whatsappError && <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: '8px 0 0 0' }}>{whatsappError}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Razorpay UPI Card */}
      <div className="settings-card-modern" style={{ marginTop: '24px' }}>
        <div className="settings-card-hdr">
          <h2><CreditCard size={20} style={{ color: '#3399FF' }} /> Razorpay UPI Settings</h2>
          <button 
            onClick={() => setIsEditingRazorpayInfo(!isEditingRazorpayInfo)}
            className="btn-modern btn-modern-secondary"
          >
            <Edit size={16} />
            {isEditingRazorpayInfo ? 'Cancel' : 'Edit'}
          </button>
        </div>
        <div className="settings-card-body-modern">
          {isEditingRazorpayInfo ? (
            <div className="form-grid-modern single-column">
              <div className="form-group-modern">
                <div 
                  className="switch-wrapper" 
                  onClick={() => handleBarSettingsChange('razorpay_enabled', barSettings.razorpay_enabled ? 0 : 1)}
                >
                  <div className={`switch-track ${barSettings.razorpay_enabled ? 'active' : ''}`}>
                    <div className="switch-thumb"></div>
                  </div>
                  <span className="switch-label">Enable Razorpay UPI QR Codes</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0', paddingLeft: '62px' }}>
                  Generates dynamic payment QR codes using Render environment credentials.
                </p>
              </div>
              <div className="form-group-modern" style={{ marginTop: '10px' }}>
                <button 
                  onClick={saveBarSettings}
                  disabled={loading}
                  className="btn-modern btn-modern-primary"
                  style={{ width: 'fit-content' }}
                >
                  <Save size={16} />
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          ) : (
            <div className="display-grid">
              <div className="display-item">
                <h4>Integration Status</h4>
                <p style={{ marginTop: '6px' }}>
                  {barSettings.razorpay_enabled === 1 ? (
                    <span style={{ color: '#16a34a', fontWeight: '700' }}>✓ Enabled (Razorpay UPI active using Render credentials)</span>
                  ) : (
                    <span style={{ color: '#ef4444', fontWeight: '700' }}>✗ Disabled (UPI QR generation is manual)</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderMenuQrTab = () => (
    <div className="settings-card-modern">
      <div className="settings-card-hdr">
        <h2><QrCode size={20} style={{ color: '#EAB308' }} /> Self-Ordering Menu QR Code</h2>
      </div>
      <div className="settings-card-body-modern">
        <p style={{ margin: '0 0 20px 0', fontSize: '0.95rem', color: '#64748b', lineHeight: '1.6' }}>
          Scan this single QR code to view our menu and place orders from your mobile. You can print this QR code or download it to place on dining tables or at the takeaway counter.
        </p>
        
        <div className="form-grid-modern single-column">
          <div className="form-group-modern">
            <label>Hosted Customer App URL</label>
            <input
              type="url"
              className="input-modern"
              value={barSettings.hosted_app_url || ''}
              onChange={(e) => handleBarSettingsChange('hosted_app_url', e.target.value)}
              placeholder={`e.g., https://malabar-waffle.web.app (fallback: ${window.location.origin})`}
            />
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
              If hosted on Firebase or a custom domain, enter it here. Otherwise, it defaults to the current network URL.
            </p>
          </div>
          <div className="form-group-modern" style={{ marginTop: '10px' }}>
            <button
              onClick={saveBarSettings}
              disabled={loading}
              className="btn-modern btn-modern-primary"
              style={{ width: 'fit-content' }}
            >
              <Save size={16} />
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
        
        <div 
          style={{ 
            marginTop: '30px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            padding: '30px', 
            background: '#f8fafc', 
            borderRadius: '20px', 
            border: '1.5px dashed #cbd5e1',
            textAlign: 'center',
            maxWidth: '500px',
            margin: '30px auto 0 auto'
          }}
        >
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
            {tableQrCodeUrl ? (
              <img 
                src={tableQrCodeUrl} 
                alt="Ordering QR Code" 
                style={{ width: '200px', height: '200px', display: 'block' }} 
              />
            ) : (
              <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Generating QR Code...
              </div>
            )}
          </div>
          
          <strong style={{ fontSize: '1.25rem', color: '#1e293b', display: 'block', marginBottom: '8px' }}>
            Customer Menu Link
          </strong>
          <code style={{ fontSize: '0.85rem', color: '#b6412c', wordBreak: 'break-all', display: 'block', marginBottom: '24px', background: '#fff3f0', padding: '6px 12px', borderRadius: '8px', border: '1px solid #ffe3dd' }}>
            {`${barSettings.hosted_app_url || window.location.origin}/#/menu`}
          </code>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <a 
              href={`${barSettings.hosted_app_url || window.location.origin}/#/menu`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-modern btn-modern-secondary"
              style={{ textDecoration: 'none', fontSize: '0.9rem', padding: '10px 18px' }}
            >
              Open Link
            </a>
            <button 
              onClick={handleDownloadQr}
              className="btn-modern btn-modern-secondary"
              style={{ fontSize: '0.9rem', padding: '10px 18px' }}
            >
              Download PNG
            </button>
            <button 
              onClick={handlePrintQr}
              className="btn-modern btn-modern-primary"
              style={{ fontSize: '0.9rem', padding: '10px 18px', background: '#1C5C3A' }}
            >
              Print Poster / Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="settings-card-modern">
      <div className="settings-card-hdr">
        <h2><Lock size={20} style={{ color: '#ef4444' }} /> Security Settings</h2>
        <button 
          onClick={() => {
            setIsEditingSecurity(!isEditingSecurity);
            setCurrentPasswordInput('');
            setNewPasswordInput('');
            setConfirmPasswordInput('');
          }}
          className="btn-modern btn-modern-secondary"
        >
          <Edit size={16} />
          {isEditingSecurity ? 'Cancel' : 'Change Password'}
        </button>
      </div>
      <div className="settings-card-body-modern">
        {isEditingSecurity ? (
          <div className="form-grid-modern single-column">
            <div className="form-group-modern">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPasswordInput}
                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                className="input-modern"
                placeholder="Enter current password"
              />
            </div>
            <div className="form-group-modern">
              <label>New Password (6 digits/chars)</label>
              <input
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value.substring(0, 10))}
                className="input-modern"
                placeholder="Enter new password"
              />
            </div>
            <div className="form-group-modern">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value.substring(0, 10))}
                className="input-modern"
                placeholder="Confirm new password"
              />
            </div>
            <div className="form-group-modern" style={{ marginTop: '10px' }}>
              <button 
                onClick={handlePasswordChange}
                disabled={securityLoading}
                className="btn-modern btn-modern-primary"
                style={{ width: 'fit-content' }}
              >
                <Save size={16} />
                {securityLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#1e293b', fontWeight: '700' }}>
              Admin Console Protection
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: '1.6', margin: 0 }}>
              Access to protected screens like Products, Sales, Settings, and Spendings requires the admin authorization password. The default password is <code>123456</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSyncTab = () => (
    <div className="settings-card-modern">
      <div className="settings-card-hdr">
        <h2><CloudLightning size={20} style={{ color: '#f59e0b' }} /> Firebase Cloud Sync</h2>
      </div>
      <div className="settings-card-body-modern">
        <div className="display-grid" style={{ marginBottom: '24px' }}>
          <div className="display-item" style={{ gridColumn: '1 / -1' }}>
            <h4>Cloud Connection Status</h4>
            <p style={{ marginTop: '6px' }}>
              {getFirebaseDb() ? (
                <span style={{ color: '#16a34a', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  ✓ Configured & Connected (Firestore live sync is active)
                </span>
              ) : (
                <span style={{ color: '#ef4444', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  ✗ Not Configured (Configure credentials inside src/firebase.js first)
                </span>
              )}
            </p>
          </div>
        </div>

        {getFirebaseDb() && (
          <div style={{ borderTop: '1px solid #eef2f6', paddingTop: '24px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e293b', fontWeight: '700' }}>
              Manual Menu Sync
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 16px 0', lineHeight: '1.5' }}>
              Push your local products, prices, and categories to the cloud Firestore database so customers can access the live catalog online.
            </p>
            <button 
              onClick={syncMenuToCloud}
              disabled={syncingMenu}
              className="btn-modern btn-modern-primary"
              style={{ background: '#1C5C3A' }}
            >
              <CloudLightning size={16} />
              {syncingMenu ? 'Syncing...' : 'Sync Menu to Cloud'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderSystemTab = () => (
    <>
      {/* End of Day Operations */}
      <div className="settings-card-modern">
        <div className="settings-card-hdr">
          <h2><RotateCcw size={20} style={{ color: '#1e293b' }} /> Daily Operations</h2>
        </div>
        <div className="settings-card-body-modern">
          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#1e293b', fontWeight: '700' }}>
            Close Sell & Generate Reports
          </h4>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 16px 0', lineHeight: '1.5' }}>
            {"Closes the current day's business shift, creates a compressed ZIP file of all reports, backs up the database, and emails the package to the owner."}
          </p>
          <button 
            onClick={handleCloseSell}
            disabled={closeSellLoading}
            className="btn-modern btn-modern-primary"
            style={{ background: '#1e293b' }}
          >
            <RotateCcw size={16} />
            {closeSellLoading ? 'Processing Close Sell...' : 'Run Close Sell Now'}
          </button>
        </div>
      </div>

      {/* Danger Zone: Reset Application */}
      <div className="settings-card-modern" style={{ marginTop: '24px', border: '1.5px solid #fca5a5' }}>
        <div className="settings-card-hdr" style={{ background: '#fef2f2' }}>
          <h2 style={{ color: '#ef4444' }}><AlertTriangle size={20} /> Danger Zone: Reset App</h2>
        </div>
        <div className="settings-card-body-modern">
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '16px', marginBottom: '20px', color: '#b45309', fontSize: '0.9rem' }}>
            <strong style={{ display: 'block', marginBottom: '6px' }}>Warning: This action is permanent!</strong>
            Resetting the application will completely wipe all local products, tables, configurations, spendings, and sales records. Defaults will be restored.
          </div>

          {!showResetConfirm ? (
            <button 
              onClick={handleResetApplication}
              disabled={resetLoading}
              className="btn-modern btn-modern-danger"
            >
              <RotateCcw size={16} />
              {resetLoading ? 'Resetting...' : 'Reset Entire Application'}
            </button>
          ) : (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '20px' }}>
              <p style={{ margin: '0 0 12px 0', color: '#991b1b', fontWeight: '700' }}>
                Are you absolutely sure? This cannot be undone.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#991b1b', marginBottom: '6px' }}>
                  Please type &quot;reset app&quot; below to confirm:
                </label>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Type 'reset app'"
                  className="input-modern"
                  style={{ width: '100%', borderColor: '#fca5a5', background: '#ffffff', color: '#991b1b' }}
                  disabled={resetLoading}
                  autoComplete="off"
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={handleResetApplication}
                  disabled={resetLoading || resetConfirmText.trim().toLowerCase() !== 'reset app'}
                  className="btn-modern btn-modern-danger"
                >
                  {resetLoading ? 'Resetting...' : 'Yes, Delete All Data'}
                </button>
                <button 
                  onClick={cancelReset}
                  disabled={resetLoading}
                  className="btn-modern btn-modern-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info & Support */}
      <div className="info-cards-grid" style={{ marginTop: '24px' }}>
        <div className="info-card">
          <h3><Info size={18} style={{ color: '#3b82f6' }} /> Application Info</h3>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '600' }}>Version:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600' }}>2.0.0</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '600' }}>Database:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600' }}>
                  {typeof window !== "undefined" && !!window.electronAPI ? 'SQLite' : 'IndexedDB (Dexie)'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '600' }}>Platform:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600' }}>
                  {typeof window !== "undefined" && !!window.electronAPI ? 'Electron (Desktop)' : 'Android / Web'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="info-card">
          <h3><HelpCircle size={18} style={{ color: '#10b981' }} /> Support</h3>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#475569', fontWeight: '600' }}>
            For technical support:
          </p>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '600' }}>Email:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600', color: '#b6412c' }}>
                  ajitreddy013@gmail.com
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 0', color: '#64748b', fontWeight: '600' }}>Phone:</td>
                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '600', color: '#b6412c' }}>
                  +91 7517323121
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  return (
    <div className="settings-page-wrapper">
      {/* Scope-isolated modern styles to avoid conflicts with global App.css */}
      <style>{`
        .settings-page-wrapper {
          padding: 24px 12px;
          max-width: 1250px;
          margin: 0 auto;
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          color: #2c3e50;
        }
        
        .settings-header-modern {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 30px;
          border-bottom: 2px solid #eef2f6;
          padding-bottom: 16px;
        }
        
        .settings-header-modern h1 {
          margin: 0;
          font-size: 1.85rem;
          font-weight: 800;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .settings-layout-modern {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 30px;
          align-items: start;
        }

        .settings-nav-sidebar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(8px);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .settings-nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #64748b;
          font-size: 0.95rem;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          width: 100%;
        }

        .settings-nav-btn:hover {
          background: rgba(182, 65, 44, 0.06);
          color: #b6412c;
          transform: translateX(4px);
        }

        .settings-nav-btn.active {
          background: linear-gradient(135deg, #b6412c 0%, #e05e46 100%);
          color: #ffffff;
          box-shadow: 0 6px 16px rgba(182, 65, 44, 0.2);
        }

        .settings-panel-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
          animation: settingsFadeIn 0.3s ease-out;
        }

        @keyframes settingsFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Glassmorphic Cards */
        .settings-card-modern {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(226, 232, 240, 0.8);
          border-radius: 20px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.02);
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .settings-card-modern:hover {
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.04);
        }

        .settings-card-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 28px;
          border-bottom: 1px solid #eef2f6;
          background: rgba(248, 250, 252, 0.5);
        }

        .settings-card-hdr h2 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 1.15rem;
          font-weight: 700;
          color: #1e293b;
        }

        .settings-card-body-modern {
          padding: 28px;
        }

        /* Form Layouts */
        .form-grid-modern {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        .form-grid-modern.single-column {
          grid-template-columns: 1fr;
          max-width: 600px;
        }

        .form-group-modern {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group-modern.full-width {
          grid-column: 1 / -1;
        }

        .form-group-modern label {
          font-size: 0.82rem;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-modern {
          padding: 12px 16px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          color: #1e293b;
          font-size: 0.95rem;
          transition: all 0.2s ease;
        }

        .input-modern:focus {
          border-color: #b6412c;
          background: #ffffff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(182, 65, 44, 0.1);
        }

        .textarea-modern {
          min-height: 90px;
          resize: vertical;
        }

        /* Toggle Custom Switch */
        .switch-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          user-select: none;
          padding: 6px 0;
        }

        .switch-track {
          position: relative;
          width: 50px;
          height: 26px;
          background: #cbd5e1;
          border-radius: 13px;
          transition: all 0.25s ease;
        }

        .switch-track.active {
          background: #1C5C3A;
        }

        .switch-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: #ffffff;
          border-radius: 50%;
          transition: all 0.25s cubic-bezier(0.3, 1.5, 0.7, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .switch-track.active .switch-thumb {
          left: 27px;
        }

        .switch-label {
          font-size: 0.95rem;
          font-weight: 600;
          color: #334155;
        }

        /* Buttons styling */
        .btn-modern {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }

        .btn-modern-primary {
          background: #b6412c;
          color: #ffffff;
        }

        .btn-modern-primary:hover {
          background: #d85a42;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(182, 65, 44, 0.2);
        }

        .btn-modern-secondary {
          background: #ffffff;
          border-color: #cbd5e1;
          color: #475569;
        }

        .btn-modern-secondary:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .btn-modern-danger {
          background: #ef4444;
          color: #ffffff;
        }

        .btn-modern-danger:hover {
          background: #f87171;
          transform: translateY(-1px);
        }

        .btn-modern:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        /* Displays */
        .display-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        .display-item h4 {
          margin: 0 0 6px 0;
          font-size: 0.8rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .display-item p {
          margin: 0;
          font-size: 1rem;
          color: #1e293b;
          font-weight: 500;
          line-height: 1.5;
        }

        /* QR Section */
        .qr-card-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1.5px dashed #cbd5e1;
          border-radius: 16px;
          padding: 24px;
          background: #f8fafc;
          min-height: 250px;
          text-align: center;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .status-badge.connected {
          background: #dcfce7;
          color: #15803d;
        }

        .status-badge.authenticating {
          background: #e0f2fe;
          color: #0369a1;
        }

        .status-badge.qr-ready {
          background: #fef3c7;
          color: #b45309;
        }

        .status-badge.initializing {
          background: #f1f5f9;
          color: #475569;
        }

        .status-badge.disconnected {
          background: #fee2e2;
          color: #b91c1c;
        }

        /* Info Card support */
        .info-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
        }

        .info-card h3 {
          margin: 0 0 12px 0;
          font-size: 1rem;
          color: #1e293b;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .settings-layout-modern {
          display: grid;
          grid-template-columns: 1fr;
          gap: 30px;
          align-items: start;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .settings-layout-modern {
            grid-template-columns: 1fr;
          }
          
          .form-grid-modern, .display-grid, .info-cards-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="settings-layout-modern">
        {/* Sidebar Navigation */}
        <div className="settings-nav-sidebar">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                className={`settings-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComponent size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panel Container (Active Tab) */}
        <div className="settings-panel-container">
          {activeTab === 'general' && renderGeneralTab()}
          {activeTab === 'integrations' && renderIntegrationsTab()}
          {activeTab === 'menu-qr' && renderMenuQrTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'sync' && renderSyncTab()}
          {activeTab === 'system' && renderSystemTab()}
        </div>
      </div>
    </div>
  );
};

export default Settings;
