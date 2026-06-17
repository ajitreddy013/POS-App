import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Store, Save, Edit, Mail, Send, TestTube, RotateCcw, AlertTriangle, Archive, Info, HelpCircle, MessageCircle, Wifi, WifiOff, CreditCard } from 'lucide-react';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';

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
    whatsapp_default_country_code: '91'
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
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [closeSellLoading, setCloseSellLoading] = useState(false);

  const [whatsappStatus, setWhatsappStatus] = useState('DISCONNECTED');
  const [whatsappQr, setWhatsappQr] = useState(null);
  const [whatsappError, setWhatsappError] = useState(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  useEffect(() => {
    loadBarSettings();
    loadEmailSettings();
  }, []);

  useEffect(() => {
    let intervalId = null;
    
    if (barSettings.whatsapp_enabled && APP_CONFIG.whatsappRelayUrl) {
      checkRelayStatus();
      intervalId = setInterval(checkRelayStatus, 5000); // Poll every 5 seconds
    } else {
      setWhatsappStatus('DISCONNECTED');
      setWhatsappQr(null);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [barSettings.whatsapp_enabled]);

  const checkRelayStatus = async () => {
    if (!APP_CONFIG.whatsappRelayUrl) return;
    try {
      const data = await whatsappService.getStatus(APP_CONFIG.whatsappRelayUrl);
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
    if (!APP_CONFIG.whatsappRelayUrl) return;
    try {
      setWhatsappLoading(true);
      const res = await whatsappService.logout(APP_CONFIG.whatsappRelayUrl);
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
          razorpay_key_id: '',
          razorpay_key_secret: ''
        });
        
        alert('Application reset completed successfully!\n\nAll data has been cleared and sample data has been restored.\n\nPlease restart the application for best results.');
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

        {/* Email Settings Section */}
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #e9ecef'
          }}>
            <h2 style={{ margin: 0 }}>
              <Mail size={20} style={{ marginRight: '10px' }} />
              Email Settings
            </h2>
            <button 
              onClick={() => setIsEditingEmailInfo(!isEditingEmailInfo)}
              className="btn btn-secondary"
            >
              <Edit size={16} />
              {isEditingEmailInfo ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          <div style={{ padding: '20px' }}>
            {isEditingEmailInfo ? (
              <div className="email-settings-form">
                <div className="form-row">
                  <label>
                    Enable Daily Email Reports:
                    <input
                      type="checkbox"
                      checked={emailSettings.enabled}
                      onChange={(e) => handleEmailSettingsChange('enabled', e.target.checked)}
                      style={{ marginLeft: '10px' }}
                    />
                  </label>
                </div>
                
                {emailSettings.enabled && (
                  <>
                    <div className="form-row">
                      <label>
                        SMTP Host:
                        <input
                          type="text"
                          value={emailSettings.host}
                          onChange={(e) => handleEmailSettingsChange('host', e.target.value)}
                          className="form-input"
                          placeholder="smtp.gmail.com"
                        />
                      </label>
                      <label>
                        Port:
                        <input
                          type="number"
                          value={emailSettings.port}
                          onChange={(e) => handleEmailSettingsChange('port', parseInt(e.target.value))}
                          className="form-input"
                          placeholder="587"
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Email Address:
                        <input
                          type="email"
                          value={emailSettings.auth.user}
                          onChange={(e) => handleEmailSettingsChange('auth.user', e.target.value)}
                          className="form-input"
                          placeholder="your.email@gmail.com"
                        />
                      </label>
                      <label>
                        App Password:
                        <input
                          type="password"
                          value={emailSettings.auth.pass}
                          onChange={(e) => handleEmailSettingsChange('auth.pass', e.target.value)}
                          className="form-input"
                          placeholder="App-specific password"
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        From Address:
                        <input
                          type="email"
                          value={emailSettings.from}
                          onChange={(e) => handleEmailSettingsChange('from', e.target.value)}
                          className="form-input"
                          placeholder="sender@example.com"
                        />
                      </label>
                      <label>
                        To Address (Owner):
                        <input
                          type="email"
                          value={emailSettings.to}
                          onChange={(e) => handleEmailSettingsChange('to', e.target.value)}
                          className="form-input"
                          placeholder="owner@example.com"
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Use SSL/TLS:
                        <input
                          type="checkbox"
                          checked={emailSettings.secure}
                          onChange={(e) => handleEmailSettingsChange('secure', e.target.checked)}
                          style={{ marginLeft: '10px' }}
                        />
                      </label>
                    </div>
                  </>
                )}
                
                <div className="form-actions">
                  <button 
                    onClick={saveEmailSettings}
                    disabled={emailLoading}
                    className="btn btn-primary"
                  >
                    <Save size={16} />
                    {emailLoading ? 'Saving...' : 'Save Settings'}
                  </button>
                  
                  {emailSettings.enabled && (
                    <>
                      <button 
                        onClick={testEmailConnection}
                        disabled={emailLoading}
                        className="btn btn-secondary"
                        style={{ marginLeft: '10px' }}
                      >
                        <TestTube size={16} />
                        Test Connection
                      </button>
                      
                      <button 
                        onClick={sendTestEmail}
                        disabled={emailLoading}
                        className="btn btn-secondary"
                        style={{ marginLeft: '10px' }}
                      >
                        <Send size={16} />
                        Send Test Email
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="email-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4>Email Reports</h4>
                    <p>{emailSettings.enabled ? '✓ Enabled' : '✗ Disabled'}</p>
                    {emailSettings.enabled && (
                      <>
                        <h4>SMTP Host</h4>
                        <p>{emailSettings.host || 'Not set'}</p>
                        <h4>From Address</h4>
                        <p>{emailSettings.from || 'Not set'}</p>
                      </>
                    )}
                  </div>
                  <div>
                    {emailSettings.enabled && (
                      <>
                        <h4>To Address (Owner)</h4>
                        <p>{emailSettings.to || 'Not set'}</p>
                        <h4>Port</h4>
                        <p>{emailSettings.port || 587}</p>
                        <h4>Security</h4>
                        <p>{emailSettings.secure ? 'SSL/TLS' : 'STARTTLS'}</p>
                        
                        <div style={{ marginTop: '20px' }}>
                          <button 
                            onClick={sendDailyEmailNow}
                            disabled={emailLoading}
                            className="btn btn-primary"
                          >
                            <Send size={16} />
                            Send Daily Report Now
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {emailSettings.enabled && (
                  <div style={{ 
                    background: '#e8f5e8', 
                    border: '1px solid #4caf50', 
                    borderRadius: '6px', 
                    padding: '15px', 
                    marginTop: '20px' 
                  }}>
                    <strong>Daily Reports Schedule:</strong> Reports are automatically sent every day at 11:59 PM.
                  </div>
                )}
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
              WhatsApp Cloud-Relay Settings
            </h2>
            <button 
              onClick={() => setIsEditingWhatsappInfo(!isEditingWhatsappInfo)}
              className="btn btn-secondary"
            >
              <Edit size={16} />
              {isEditingWhatsappInfo ? 'Cancel' : 'Edit'}
            </button>
          </div>
          
          <div style={{ padding: '20px' }}>
            {isEditingWhatsappInfo ? (
              <div className="whatsapp-settings-form">
                <div className="form-row">
                  <label>
                    Enable WhatsApp Bills:
                    <input
                      type="checkbox"
                      checked={!!barSettings.whatsapp_enabled}
                      onChange={(e) => handleBarSettingsChange('whatsapp_enabled', e.target.checked ? 1 : 0)}
                      style={{ marginLeft: '10px' }}
                    />
                  </label>
                  
                </div>

                <div className="form-row">
                  <label>
                    Template Language Code:
                    <input
                      type="text"
                      value={barSettings.whatsapp_language_code || 'en'}
                      onChange={(e) => handleBarSettingsChange('whatsapp_language_code', e.target.value)}
                      className="form-input"
                      placeholder="en"
                    />
                  </label>
                  <label>
                    Default Country Code:
                    <input
                      type="text"
                      value={barSettings.whatsapp_default_country_code || '91'}
                      onChange={(e) => handleBarSettingsChange('whatsapp_default_country_code', e.target.value)}
                      className="form-input"
                      placeholder="91"
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
                    {loading ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="whatsapp-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4>WhatsApp Automation</h4>
                    <p>{barSettings.whatsapp_enabled ? '✓ Enabled' : '✗ Disabled'}</p>
                    
                    <h4>Relay Status</h4>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                      {whatsappStatus === 'CONNECTED' ? (
                        <span style={{ display: 'flex', alignItems: 'center', color: '#2e7d32', fontWeight: 'bold' }}>
                          <Wifi size={18} style={{ marginRight: '5px' }} /> Linked / Active
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
                    {barSettings.whatsapp_enabled && APP_CONFIG.whatsappRelayUrl && (
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
                    )}
                  </div>
                </div>
              </div>
            )}
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
                <div className="form-row">
                  <label>
                    Razorpay Key ID:
                    <input
                      type="text"
                      value={barSettings.razorpay_key_id || ''}
                      onChange={(e) => handleBarSettingsChange('razorpay_key_id', e.target.value)}
                      className="form-input"
                      placeholder="rzp_test_xxxxxx or rzp_live_xxxxxx"
                    />
                  </label>
                  <label>
                    Razorpay Key Secret:
                    <input
                      type="password"
                      value={barSettings.razorpay_key_secret || ''}
                      onChange={(e) => handleBarSettingsChange('razorpay_key_secret', e.target.value)}
                      className="form-input"
                      placeholder="Enter Key Secret"
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
                    {loading ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="razorpay-settings-display">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4>Integration Status</h4>
                    <p style={{ margin: 0 }}>
                      {barSettings.razorpay_key_id && barSettings.razorpay_key_secret ? (
                        <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✓ Configured</span>
                      ) : (
                        <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>✗ Not Configured (UPI Payments will be manual)</span>
                      )}
                    </p>
                    
                    <h4 style={{ marginTop: '15px' }}>Razorpay Key ID</h4>
                    <p style={{ margin: 0 }}>{barSettings.razorpay_key_id || 'Not configured'}</p>
                  </div>
                  <div>
                    <h4>Razorpay Key Secret</h4>
                    <p style={{ margin: 0 }}>{barSettings.razorpay_key_secret ? '••••••••••••••••' : 'Not configured'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Close Sell Section */}
        <div className="table-container" style={{ marginBottom: '30px', border: '2px solid #27ae60' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '20px',
            borderBottom: '1px solid #27ae60',
            backgroundColor: '#f0f8f0'
          }}>
            <h2 style={{ margin: 0, color: '#27ae60' }}>
              <Archive size={20} style={{ marginRight: '10px' }} />
              Close Sell
            </h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <div style={{ 
              background: '#e8f5e8', 
              border: '1px solid #27ae60', 
              borderRadius: '6px', 
              padding: '15px', 
              marginBottom: '20px' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <Archive size={16} style={{ marginRight: '8px', color: '#27ae60' }} />
                <strong style={{ color: '#27ae60' }}>Close Sell Operation</strong>
              </div>
              <p style={{ margin: '0', color: '#27ae60', fontSize: '0.9rem' }}>
                This operation will generate all PDF reports, create database backups, and compress them into a ZIP file for easy access.
              </p>
              <ul style={{ margin: '10px 0 0 0', paddingLeft: '20px', color: '#27ae60', fontSize: '0.9rem' }}>
                <li>🗄️ Create complete database backup</li>
                <li>📊 Generate daily comprehensive report</li>
                <li>💰 Generate sales report</li>
                <li>📈 Generate financial report</li>
                <li>📦 Generate inventory report</li>
                <li>📋 Generate pending bills report</li>
                <li>🗜️ Compress all PDFs into a ZIP file</li>
                <li>💾 Save backups to local backup directories</li>
                <li>📧 Automatically send ZIP file to owner via email</li>
                <li>🗃️ Preserve all historical data permanently</li>
              </ul>
            </div>
            
            <button 
              onClick={handleCloseSell}
              disabled={closeSellLoading}
              className="btn"
              style={{
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                padding: '12px 20px',
                borderRadius: '6px',
                cursor: closeSellLoading ? 'not-allowed' : 'pointer',
                opacity: closeSellLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              <Archive size={16} />
              {closeSellLoading ? 'Processing Close Sell...' : 'Close Sell'}
            </button>
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
                <li>All products and inventory</li>
                <li>All sales records and transactions</li>
                <li>All pending bills and table orders</li>
                <li>All spendings and counter balance records</li>
                <li>All settings and configurations</li>
              </ul>
              <p style={{ margin: '10px 0 0 0', color: '#856404', fontSize: '0.9rem' }}>
                Sample data will be restored after reset.
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
          <div className="summary-card">
            <h3><Info size={20} style={{ marginRight: '10px' }} />Application Info</h3>
            <div style={{ textAlign: 'left', fontSize: '0.9rem', width: '100%' }}>
              <p style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Version:</strong> 
                <span>1.0.0</span>
              </p>
              <p style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Database:</strong> 
                <span>SQLite</span>
              </p>
              <p style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Platform:</strong> 
                <span>Electron</span>
              </p>
            </div>
          </div>

          <div className="summary-card">
            <h3><HelpCircle size={20} style={{ marginRight: '10px' }} />Support</h3>
            <div style={{ textAlign: 'left', fontSize: '0.9rem', width: '100%' }}>
              <p style={{ margin: '8px 0', fontWeight: '600', color: '#2c3e50' }}>For technical support:</p>
              <p style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Email:</strong> 
                <span>ajitreddy013@gmail.com</span>
              </p>
              <p style={{ margin: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                <strong>Phone:</strong> 
                <span>+91 7517323121</span>
              </p>
            </div>
          </div>
        </div>

        <div className="table-container" style={{ marginTop: '30px' }}>
          <h2 style={{ padding: '20px', margin: 0, borderBottom: '1px solid #e9ecef' }}>
            System Requirements
          </h2>
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Requirement</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Operating System</td>
                <td>Windows 10 or later</td>
                <td><span style={{ color: '#27ae60' }}>✓ Compatible</span></td>
              </tr>
              <tr>
                <td>Database</td>
                <td>SQLite (included)</td>
                <td><span style={{ color: '#27ae60' }}>✓ Active</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="table-container" style={{ marginTop: '30px' }}>
          <h2 style={{ padding: '20px', margin: 0, borderBottom: '1px solid #e9ecef' }}>
            Printer Setup Guide
          </h2>
          <div style={{ padding: '20px' }}>
            <h3>For USB Connection:</h3>
            <ol style={{ marginLeft: '20px', lineHeight: '1.6' }}>
              <li>Connect the Epson TM-T82II printer to your computer via USB cable</li>
              <li>Install the printer drivers from Epson&apos;s official website</li>
              <li>Set the printer to ESC/POS mode</li>
              <li>Restart the application to detect the printer</li>
            </ol>
            
            <h3 style={{ marginTop: '20px' }}>For Network Connection:</h3>
            <ol style={{ marginLeft: '20px', lineHeight: '1.6' }}>
              <li>Connect the printer to your network</li>
              <li>Note down the printer&apos;s IP address</li>
              <li>Configure the network settings in the printer service</li>
              <li>Test the connection using the &quot;Check Status&quot; button above</li>
            </ol>

            <div style={{ 
              background: '#fff3cd', 
              border: '1px solid #ffeaa7', 
              borderRadius: '6px', 
              padding: '15px', 
              marginTop: '20px' 
            }}>
              <strong>Note:</strong> The application will automatically search for compatible printers on common ports. 
              If your printer is not detected, ensure it&apos;s properly connected and powered on.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
