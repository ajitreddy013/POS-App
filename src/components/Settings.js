import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Store, Save, Edit, Mail, Send, TestTube, RotateCcw, AlertTriangle, Info, HelpCircle, MessageCircle, Wifi, WifiOff, CreditCard, Lock, CloudLightning } from 'lucide-react';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';
import { getFirebaseDb } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';

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
    firebase_config: ''
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

  useEffect(() => {
    if (whatsappError) {
      const timer = setTimeout(() => {
        setWhatsappError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [whatsappError]);

  useEffect(() => {
    loadBarSettings();
    loadEmailSettings();
  }, []);

  const getActiveRelayUrl = () => {
    return barSettings.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
  };

  useEffect(() => {
    let intervalId = null;
    const activeUrl = getActiveRelayUrl();
    
    if (barSettings.whatsapp_enabled && activeUrl) {
      checkRelayStatus();
      intervalId = setInterval(checkRelayStatus, 5000); // Poll every 5 seconds
    } else {
      setWhatsappStatus('DISCONNECTED');
      setWhatsappQr(null);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [barSettings.whatsapp_enabled, barSettings.whatsapp_relay_url]);

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

  return (
    <div className="settings">
      <div className="page-header">
        <h1><SettingsIcon size={24} /> Settings</h1>
      </div>

      <div style={{ padding: '20px 30px' }}>
        {/* Shop Information Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <Store size={20} style={{ marginRight: '10px' }} />
              Shop Information
            </h2>
            <button 
              onClick={() => setIsEditingBarInfo(!isEditingBarInfo)}
              className="btn btn-secondary"
            >
              <Edit size={16} />
              {isEditingBarInfo ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          <div style={{ padding: '20px' }}>
            {isEditingBarInfo ? (
              <div className="bar-settings-form">
                <div className="form-row">
                  <label>
                    Shop Name:
                    <input
                      type="text"
                      value={barSettings.bar_name}
                      onChange={(e) => handleBarSettingsChange('bar_name', e.target.value)}
                      className="form-input"
                      placeholder="Enter shop name"
                    />
                  </label>
                  <label>
                    Contact Number:
                    <input
                      type="text"
                      value={barSettings.contact_number}
                      onChange={(e) => handleBarSettingsChange('contact_number', e.target.value)}
                      className="form-input"
                      placeholder="Enter contact number"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    GST Number:
                    <input
                      type="text"
                      value={barSettings.gst_number}
                      onChange={(e) => handleBarSettingsChange('gst_number', e.target.value)}
                      className="form-input"
                      placeholder="Enter GST number"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label style={{ gridColumn: '1 / -1' }}>
                    Address:
                    <textarea
                      value={barSettings.address}
                      onChange={(e) => handleBarSettingsChange('address', e.target.value)}
                      className="form-input"
                      placeholder="Enter complete address"
                      rows="3"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label style={{ gridColumn: '1 / -1' }}>
                    Thank You Message:
                    <input
                      type="text"
                      value={barSettings.thank_you_message}
                      onChange={(e) => handleBarSettingsChange('thank_you_message', e.target.value)}
                      className="form-input"
                      placeholder="Enter thank you message for bills"
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button 
                    onClick={saveBarSettings}
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    <Save size={16} />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bar-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4>Shop Name</h4>
                    <p>{barSettings.bar_name || 'Not set'}</p>
                    <h4>Contact Number</h4>
                    <p>{barSettings.contact_number || 'Not set'}</p>
                    <h4>GST Number</h4>
                    <p>{barSettings.gst_number || 'Not set'}</p>
                  </div>
                  <div>
                    <h4>Address</h4>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{barSettings.address || 'Not set'}</p>
                    <h4>Thank You Message</h4>
                    <p>{barSettings.thank_you_message || 'Thank you for visiting!'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security Settings Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <Lock size={20} style={{ marginRight: '10px' }} />
              Security Settings
            </h2>
            <button 
              onClick={() => {
                setIsEditingSecurity(!isEditingSecurity);
                setCurrentPasswordInput('');
                setNewPasswordInput('');
                setConfirmPasswordInput('');
              }}
              className="btn btn-secondary"
            >
              <Edit size={16} />
              {isEditingSecurity ? 'Cancel' : 'Change Password'}
            </button>
          </div>
          
          <div style={{ padding: '20px' }}>
            {isEditingSecurity ? (
              <div className="bar-settings-form">
                <div className="form-row">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    Current Password:
                    <input
                      type="password"
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      className="form-input"
                      placeholder="Enter current password"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    New Password (6-digit):
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value.substring(0, 10))}
                      className="form-input"
                      placeholder="Enter new password"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    Confirm New Password:
                    <input
                      type="password"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value.substring(0, 10))}
                      className="form-input"
                      placeholder="Confirm new password"
                    />
                  </label>
                </div>
                <div className="form-actions" style={{ marginTop: '20px' }}>
                  <button 
                    onClick={handlePasswordChange}
                    disabled={securityLoading}
                    className="btn btn-primary"
                  >
                    <Save size={16} style={{ marginRight: '8px' }} />
                    {securityLoading ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bar-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Admin Console Protection</h4>
                    <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px', lineHeight: '1.5' }}>
                      Kiosk Mode is active by default. Access to the admin dashboard, reports, products, and settings is protected by a 6-digit password. Click &quot;Change Password&quot; to update it.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Cloud-Relay Settings Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <MessageCircle size={20} style={{ marginRight: '10px' }} />
              WhatsApp Linked Devices
            </h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <div className="whatsapp-settings-display">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <h4>Relay Status</h4>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                    {whatsappStatus === 'CONNECTED' ? (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#2e7d32', fontWeight: 'bold' }}>
                        <Wifi size={18} style={{ marginRight: '5px' }} /> Linked / Active
                      </span>
                    ) : whatsappStatus === 'AUTHENTICATING' ? (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#0288d1', fontWeight: 'bold' }}>
                        <RotateCcw size={18} className="spin" style={{ marginRight: '5px' }} /> Authenticating / Syncing...
                      </span>
                    ) : whatsappStatus === 'QR_READY' ? (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#f57c00', fontWeight: 'bold' }}>
                        <MessageCircle size={18} style={{ marginRight: '5px' }} /> Scan QR Code to Link
                      </span>
                    ) : whatsappStatus === 'INITIALIZING' ? (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#0288d1', fontWeight: 'bold' }}>
                        <RotateCcw size={18} className="spin" style={{ marginRight: '5px' }} /> Connecting to Relay...
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', color: '#d32f2f', fontWeight: 'bold' }}>
                        <WifiOff size={18} style={{ marginRight: '5px' }} /> Offline / Not Linked
                      </span>
                    )}
                  </div>
                  
                  {whatsappStatus === 'CONNECTED' && (
                    <button
                      onClick={handleWhatsappLogout}
                      disabled={whatsappLoading}
                      className="btn btn-secondary"
                      style={{ marginTop: '20px', color: '#d32f2f', borderColor: '#d32f2f' }}
                    >
                      <WifiOff size={16} />
                      {whatsappLoading ? 'Unlinking...' : 'Unlink WhatsApp Device'}
                    </button>
                  )}
                </div>

                <div>
                  {getActiveRelayUrl() ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd', borderRadius: '8px', padding: '15px', background: '#fafafa', minHeight: '200px' }}>
                      {whatsappStatus === 'QR_READY' && whatsappQr ? (
                        <>
                          <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', textAlign: 'center', fontWeight: 'bold' }}>
                            Scan this QR code with WhatsApp Linked Devices:
                          </p>
                          <img src={whatsappQr} alt="WhatsApp QR Code" style={{ width: '180px', height: '180px' }} />
                        </>
                      ) : whatsappStatus === 'CONNECTED' ? (
                        <div style={{ textAlign: 'center', color: '#2e7d32' }}>
                          <MessageCircle size={48} style={{ margin: '0 auto 10px auto' }} />
                          <p style={{ margin: 0, fontWeight: 'bold' }}>Device Linked!</p>
                          <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                            POS receipts will be sent automatically from your scanned number.
                          </p>
                        </div>
                      ) : whatsappStatus === 'AUTHENTICATING' ? (
                        <div style={{ textAlign: 'center', color: '#0288d1' }}>
                          <RotateCcw size={48} className="spin" style={{ margin: '0 auto 10px auto' }} />
                          <p style={{ margin: 0, fontWeight: 'bold' }}>Authenticated!</p>
                          <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                            Syncing chats and data. Please wait...
                          </p>
                        </div>
                      ) : whatsappStatus === 'INITIALIZING' ? (
                        <div style={{ textAlign: 'center', color: '#0288d1' }}>
                          <RotateCcw size={48} className="spin" style={{ margin: '0 auto 10px auto' }} />
                          <p style={{ margin: 0 }}>Starting WhatsApp session...</p>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#666' }}>
                          <WifiOff size={48} style={{ margin: '0 auto 10px auto' }} />
                          <p style={{ margin: 0 }}>Relay is offline or not configured.</p>
                          {whatsappError && <p style={{ fontSize: '0.8rem', color: '#d32f2f', margin: '5px 0 0 0' }}>{whatsappError}</p>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '20px', color: '#d32f2f', textAlign: 'center', border: '1px solid #ffcdd2', borderRadius: '8px', background: '#ffebee' }}>
                      <p>WhatsApp Relay URL is not configured.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Razorpay Automatic UPI Settings Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <CreditCard size={20} style={{ marginRight: '10px' }} />
              Razorpay UPI Settings
            </h2>
            <button 
              onClick={() => setIsEditingRazorpayInfo(!isEditingRazorpayInfo)}
              className="btn btn-secondary"
            >
              <Edit size={16} />
              {isEditingRazorpayInfo ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          <div style={{ padding: '20px' }}>
            {isEditingRazorpayInfo ? (
              <div className="razorpay-settings-form">
                <div className="form-row" style={{ width: '100%', marginBottom: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!barSettings.razorpay_enabled}
                      onChange={(e) => handleBarSettingsChange('razorpay_enabled', e.target.checked ? 1 : 0)}
                      style={{ marginRight: '10px' }}
                    />
                    Enable Razorpay UPI QR (Uses Render environment variables)
                  </label>
                </div>
                
                <div className="form-actions">
                  <button 
                    onClick={saveBarSettings}
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    <Save size={16} />
                    {loading ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="razorpay-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                  <div>
                    <h4>Integration Status</h4>
                    <p style={{ margin: 0 }}>
                      {barSettings.razorpay_enabled === 1 ? (
                        <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✓ Enabled (Razorpay UPI QR active using Render credentials)</span>
                      ) : (
                        <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>✗ Disabled (UPI payments will be manual)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>



        {/* Cloud Sync & Firebase Configuration Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <CloudLightning size={20} style={{ marginRight: '10px' }} />
              Firebase Cloud Sync
            </h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <div className="cloud-settings-display">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <h4>Cloud Connection Status</h4>
                  <p style={{ margin: 0 }}>
                    {getFirebaseDb() ? (
                      <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✓ Configured & Connected (Firestore live sync is active)</span>
                    ) : (
                      <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>✗ Not Configured (Please add your Firebase web app credentials in src/firebase.js)</span>
                    )}
                  </p>
                </div>
              </div>

              {getFirebaseDb() && (
                <div style={{ borderTop: '1px solid #eaecf0', paddingTop: '20px' }}>
                  <h4>Manual Operations</h4>
                  <p style={{ color: '#667085', fontSize: '0.9rem', margin: '0 0 15px 0' }}>
                    Push your local product catalog and categories to the cloud Firestore database so customers can see them on the website.
                  </p>
                  <button 
                    onClick={syncMenuToCloud}
                    disabled={syncingMenu}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#1C5C3A' }}
                  >
                    <CloudLightning size={16} />
                    {syncingMenu ? 'Synchronizing...' : 'Sync Menu to Cloud'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reset Application Section */}
        <div className="table-container" style={{ marginBottom: '30px', border: '2px solid #e74c3c' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e74c3c',
            backgroundColor: '#fdf2f2'
          }}>
            <h2 style={{ margin: 0, color: '#e74c3c' }}>
              <AlertTriangle size={20} style={{ marginRight: '10px' }} />
              Reset Application
            </h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <div style={{ 
              background: '#fff3cd', 
              border: '1px solid #ffeaa7', 
              borderRadius: '6px', 
              padding: '15px', 
              marginBottom: '20px' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <AlertTriangle size={16} style={{ marginRight: '8px', color: '#856404' }} />
                <strong style={{ color: '#856404' }}>Warning: This action cannot be undone!</strong>
              </div>
              <p style={{ margin: '0', color: '#856404', fontSize: '0.9rem' }}>
                Resetting the application will permanently delete all data including:
              </p>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px', color: '#856404', fontSize: '0.9rem' }}>
                <li>All products</li>
                <li>All sales records and transactions</li>
                <li>All table orders</li>
                <li>All spendings records</li>
                <li>All settings and configurations</li>
              </ul>
              <p style={{ margin: '10px 0 0 0', color: '#856404', fontSize: '0.9rem' }}>
                Default tables and settings will be restored after reset.
              </p>
            </div>
            
            {!showResetConfirm ? (
              <button 
                onClick={handleResetApplication}
                disabled={resetLoading}
                className="btn"
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '6px',
                  cursor: resetLoading ? 'not-allowed' : 'pointer',
                  opacity: resetLoading ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <RotateCcw size={16} />
                {resetLoading ? 'Resetting...' : 'Reset Application'}
              </button>
            ) : (
              <div style={{ 
                background: '#f8d7da', 
                border: '1px solid #f5c6cb', 
                borderRadius: '6px', 
                padding: '15px'
              }}>
                <p style={{ margin: '0 0 15px 0', color: '#721c24', fontWeight: 'bold' }}>
                  Are you absolutely sure you want to reset the application?
                </p>
                <p style={{ margin: '0 0 15px 0', color: '#721c24', fontSize: '0.9rem' }}>
                  This will permanently delete all your data and cannot be undone.
                </p>
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ margin: '0 0 10px 0', color: '#721c24', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    To confirm, please type &quot;reset app&quot; below:
                  </p>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type 'reset app' to confirm"
                    disabled={resetLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #dc3545',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      backgroundColor: resetLoading ? '#f8f9fa' : 'white',
                      color: '#721c24'
                    }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={handleResetApplication}
                    disabled={resetLoading || resetConfirmText.trim().toLowerCase() !== 'reset app'}
                    className="btn"
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '4px',
                      cursor: (resetLoading || resetConfirmText.trim().toLowerCase() !== 'reset app') ? 'not-allowed' : 'pointer',
                      opacity: (resetLoading || resetConfirmText.trim().toLowerCase() !== 'reset app') ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RotateCcw size={14} />
                    {resetLoading ? 'Resetting...' : 'Yes, Reset Everything'}
                  </button>
                  <button 
                    onClick={cancelReset}
                    disabled={resetLoading}
                    className="btn"
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '4px',
                      cursor: resetLoading ? 'not-allowed' : 'pointer',
                      opacity: resetLoading ? 0.6 : 1
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="summary-cards">
          <div className="summary-card" style={{ overflow: 'visible', minHeight: 'unset' }}>
            <h3><Info size={20} style={{ marginRight: '10px' }} />Application Info</h3>
            <div style={{ textAlign: 'left', fontSize: '0.85rem', width: '100%', marginTop: '10px' }}>
              <p style={{ margin: '6px 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px' }}>
                <strong>Version:</strong>
                <span>2.0.0</span>
              </p>
              <p style={{ margin: '6px 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px' }}>
                <strong>Database:</strong>
                <span style={{ wordBreak: 'break-word', textAlign: 'right' }}>{typeof window !== "undefined" && !!window.electronAPI ? 'SQLite' : 'IndexedDB (Dexie)'}</span>
              </p>
              <p style={{ margin: '6px 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px' }}>
                <strong>Platform:</strong>
                <span style={{ wordBreak: 'break-word', textAlign: 'right' }}>{typeof window !== "undefined" && !!window.electronAPI ? 'Electron (Desktop)' : 'Android / Web'}</span>
              </p>
            </div>
          </div>

          <div className="summary-card" style={{ overflow: 'visible', minHeight: 'unset' }}>
            <h3><HelpCircle size={20} style={{ marginRight: '10px' }} />Support</h3>
            <div style={{ textAlign: 'left', fontSize: '0.85rem', width: '100%', marginTop: '10px' }}>
              <p style={{ margin: '6px 0', fontWeight: '600', color: '#2c3e50' }}>For technical support:</p>
              <p style={{ margin: '6px 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px' }}>
                <strong>Email:</strong>
                <span style={{ wordBreak: 'break-all', textAlign: 'right' }}>ajitreddy013@gmail.com</span>
              </p>
              <p style={{ margin: '6px 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '4px' }}>
                <strong>Phone:</strong>
                <span>+91 7517323121</span>
              </p>
            </div>
          </div>
        </div>




      </div>
    </div>
  );
};

export default Settings;
