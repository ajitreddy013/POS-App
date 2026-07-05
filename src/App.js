/**
 * MAIN APPLICATION COMPONENT - React Router Implementation
 * 
 * This is the root React component for the Inventory POS Application.
 * It implements a single-page application with:
 * - Hash-based routing for Electron compatibility
 * - Responsive sidebar navigation
 * - Dynamic component loading based on routes
 * - Table management with state persistence
 * - Clean UI with icon-based navigation
 * 
 * Architecture:
 * - Uses React Router for client-side routing
 * - Implements a collapsible sidebar for navigation
 * - Manages global application state (user, selected table)
 * - Provides consistent layout across all modules
 * 
 * Features:
 * - Dashboard: Business metrics and overview
 * - Tables: Restaurant/bar table management
 * - Products: Product catalog management
 * - Inventory: Stock level monitoring
 * - Daily Transfer: Stock movement between locations
 * - POS: Point of sale transactions
 * - Reports: Sales analysis and reporting
 * - Spendings: Business expense tracking
 * - Counter Balance: Daily cash management
 * - Pending Bills: Saved bills for later completion
 * - Settings: Application configuration
 * 
 * @author Ajit Reddy
 * @version 1.0.0
 * @since 2024
 */

// React core imports
import React, { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from "react-router-dom";
import { getFirebaseDb } from "./firebase";
import { collection, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { playIncomingOrderChime } from "./utils/feedbackUtils";
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { doc, setDoc } from 'firebase/firestore';

// Icon imports for navigation menu
import {
  Package,
  BarChart3,
  Settings as SettingsIcon, // Settings icon
  Menu,            // Menu open icon
  X,               // Menu close icon
  DollarSign,      // Spendings icon
  Lock,            // Lock/Admin icon
  Store,            // Store/admin console icon
  ClipboardList,   // Clipboard/list icon for live orders
} from "lucide-react";

// Application styles
import "./App.css";

// Malabar Waffle brand logo (real PNG)
import malabarLogo from "./assets/malabar-waffle-logo.png";


// Business component imports
import Dashboard from "./components/Dashboard";                   // Main dashboard
import ProductManagement from "./components/ProductManagement";   // Product catalog
import POSSystem from "./components/POSSystem";                   // Point of sale
import SalesReports from "./components/SalesReports";             // Sales reporting
import Settings from "./components/Settings";                     // App settings
import Spendings from "./components/Spendings";                   // Expense tracking
import CustomerMenu from "./components/CustomerMenu";             // Customer self-ordering menu
import LiveOrdersScreen from "./components/LiveOrdersScreen";       // Kitchen/Live orders

import { dbService } from "./services/dbService";
import { playErrorFeedback } from "./utils/feedbackUtils";
import { formatDateTimeToString } from "./utils/dateUtils";

/**
 * APP CONTENT COMPONENT
 * 
 * Main application content component that handles:
 * - Sidebar navigation state
 * - Route-based component rendering
 * - Table selection and management
 * - Global application state
 * - Admin Kiosk mode password protection
 */
function AppContent() {
  // Global App State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser] = useState("Admin");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);

  // Router state
  const location = useLocation();
  const navigate = useNavigate();

  const [globalNotice, setGlobalNotice] = useState(null);

  // Register service worker once on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    }
  }, []);

  // Register for FCM push notifications on app start — no admin-unlock gate so the
  // kiosk tablet also receives order notifications in the drawer even when closed.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      return;
    }
    // Create the channel before the first notification arrives so Android uses
    // the correct importance level (5 = IMPORTANCE_HIGH → heads-up banners).
    LocalNotifications.createChannel({
      id: 'order_alerts',
      name: 'Order Alerts',
      description: 'Incoming order notifications',
      importance: 5,
      sound: 'default',
      vibration: true,
      visibility: 1,
    }).catch(() => {});

    LocalNotifications.requestPermissions().catch(() => {});
    registerForPushNotifications();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const registerForPushNotifications = async () => {
    try {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') return;

      await PushNotifications.register();

      PushNotifications.addListener('registration', async (token) => {
        try {
          const db = getFirebaseDb();
          if (!db) return;
          const info = await Device.getId();
          const deviceId = info.identifier;
          await setDoc(doc(db, 'admin_devices', deviceId), {
            fcmToken: token.value,
            updatedAt: serverTimestamp(),
          });
          console.log('[FCM] Token registered for device:', deviceId);
        } catch (err) {
          console.error('[FCM] Failed to store token:', err);
        }
      });

      // Show in-app banner when push arrives while app is open
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        playIncomingOrderChime();
        const isDelivery = notification.data?.isDelivery === 'true' || notification.data?.isDelivery === true;
        setGlobalNotice({
          type: isDelivery ? 'warning' : 'info',
          message: notification.title || (isDelivery ? '🛵 New Delivery Order!' : '📦 New Order Received!'),
        });
        setTimeout(() => setGlobalNotice(null), 5000);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[FCM] Registration error:', err);
      });
    } catch (err) {
      console.error('[FCM] Push notification setup failed:', err);
    }
  };

  const showSystemNotification = async (orderData) => {
    const isDelivery = orderData.orderType === 'delivery';
    const isPaid = orderData.paymentStatus === 'paid';
    const title = isDelivery
      ? `🛵 Delivery Order #${orderData.orderNumber}`
      : `📦 New Order #${orderData.orderNumber}`;
    const body = isPaid
      ? 'Payment: Paid Online'
      : isDelivery
        ? 'Payment: Cash on Delivery'
        : 'Payment: Cash at Counter';

    if (Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Date.now() / 1000) % 2147483647,
            title,
            body,
            importance: 5,
            smallIcon: 'ic_stat_notification',
            autoCancel: true,
            extra: { orderNumber: orderData.orderNumber, isDelivery },
          }],
        });
      } catch (err) {
        console.error('Local notification failed:', err);
      }
    } else {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification(title, {
            body,
            tag: orderData.orderNumber,
            renotify: true,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
          });
        } else {
          new Notification(title, { body });
        }
      } catch (err) {
        try { new Notification(title, { body }); } catch (e) { /* best-effort */ }
      }
    }
  };

  useEffect(() => {
    if (!isAdminUnlocked) return;

    const db = getFirebaseDb();
    if (!db) return;

    const q = query(
      collection(db, 'orders'),
      where('orderStatus', '==', 'preparing')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewOrder = false;
      let newOrderNumber = '';
      let newOrderIsDelivery = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const orderData = change.doc.data();
          const createdAt = orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(orderData.createdAt);
          const diffMs = Date.now() - createdAt.getTime();

          // Only notify for orders placed in the last 2 minutes to prevent spamming on reload/reconnect
          if (diffMs < 120000) {
            hasNewOrder = true;
            newOrderNumber = orderData.orderNumber;
            newOrderIsDelivery = orderData.orderType === 'delivery';
            showSystemNotification(orderData);
          }
        }
      });

      if (hasNewOrder && newOrderNumber) {
        playIncomingOrderChime();
        setGlobalNotice({
          type: newOrderIsDelivery ? 'warning' : 'info',
          message: newOrderIsDelivery
            ? `🛵 Delivery Order! #${newOrderNumber}`
            : `📦 New Order Received! #${newOrderNumber}`,
        });

        // Trigger custom event to notify current screen of new order if needed
        window.dispatchEvent(new CustomEvent('newOrderReceived', { detail: { orderNumber: newOrderNumber } }));

        setTimeout(() => {
          setGlobalNotice(null);
        }, 6000);
      }
    }, (error) => {
      console.error('Global orders listener error:', error);
    });

    return () => unsubscribe();
  }, [isAdminUnlocked]);

  // Real-time listener for today's active (unticked) orders count
  useEffect(() => {
    if (!isAdminUnlocked) return;

    const db = getFirebaseDb();
    if (!db) return;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfToday)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.orderStatus === 'cancelled' || data.orderStatus === 'completed') return;
        
        // Filter: Only count Cash orders or PAID UPI orders (same as kitchen display filters)
        const isCash = data.paymentMethod === 'cash';
        const isPaidUPI = data.paymentMethod === 'upi' && data.paymentStatus === 'paid';
        if (isCash || isPaidUPI) {
          count++;
        }
      });
      setActiveOrdersCount(count);
    }, (error) => {
      console.error('Active orders count listener error:', error);
    });

    return () => unsubscribe();
  }, [isAdminUnlocked]);

  // Real-time Firestore sync of active/completed orders to local Dexie database for dashboard/reports
  useEffect(() => {
    if (!isAdminUnlocked) return;

    const db = getFirebaseDb();
    if (!db) return;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfToday)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let hasNewSale = false;

      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const order = { id: change.doc.id, ...change.doc.data() };
          
          if (order.orderStatus === 'cancelled') {
            try {
              const res = await dbService.deleteSaleByNumber(order.orderNumber);
              if (res && res.success) {
                hasNewSale = true;
                console.log(`Removed cancelled order #${order.orderNumber} from local sales database.`);
              }
            } catch (err) {
              console.error(`Failed to delete cancelled order #${order.orderNumber}:`, err);
            }
          } else if (order.orderStatus === 'completed') {
            // Completed orders: sequential order number was assigned and Dexie updated
            // by handleCompleteOnlineOrder. Skip here to avoid stock double-deduction.
          } else {
            const isCash = order.paymentMethod === 'cash';
            const isPaidUPI = order.paymentMethod === 'upi' && order.paymentStatus === 'paid';
            if (isCash || isPaidUPI) {
              let orderDateObj = new Date();
              if (order.createdAt) {
                const parsed = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                if (parsed && !isNaN(parsed.getTime())) {
                  orderDateObj = parsed;
                }
              }
              const saleDate = formatDateTimeToString(orderDateObj);

              const saleData = {
                saleNumber: order.orderNumber,
                saleType: 'parcel',
                tableNumber: order.tableNumber || null,
                customerName: order.customerName || 'Online Customer',
                customerPhone: order.customerPhone || '',
                items: order.items.map((item) => ({
                  productId: Number(item.productId),
                  name: item.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                })),
                subtotal: order.totalAmount,
                taxAmount: 0,
                discountAmount: 0,
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                saleDate: saleDate,
                barSettings: null, // Dexie mode fallback
              };

              try {
                const result = await dbService.createSale(saleData);
                if (result && !result.alreadyExisted) {
                  hasNewSale = true;
                  console.log(`Synced order #${order.orderNumber} to local sales database.`);
                }
              } catch (err) {
                console.error(`Failed to sync order #${order.orderNumber} to Dexie:`, err);
              }
            }
          }
        }
      }

      if (hasNewSale) {
        window.dispatchEvent(new CustomEvent('saleCompleted'));
      }
    }, (error) => {
      console.error('Firestore to Dexie sync listener error:', error);
    });

    return () => unsubscribe();
  }, [isAdminUnlocked]);

  // Fix any invalid UTC ISO dates in the local sales database on mount
  useEffect(() => {
    if (!isAdminUnlocked) return;
    
    const runCleanup = async () => {
      try {
        await dbService.fixSaleDateFormats();
        // Trigger event to refresh UI with fixed dates
        window.dispatchEvent(new CustomEvent('saleCompleted'));
      } catch (err) {
        console.error("Failed to run date formats fix:", err);
      }
    };
    runCleanup();
  }, [isAdminUnlocked]);

  /**
   * Toggle sidebar visibility
   * Allows users to collapse/expand the navigation sidebar
   */
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  /**
   * Handle navigation item clicks
   * Manages state transitions when navigating between different modules
   * @param {Event} event - Click event
   * @param {string} path - Navigation path
   * @param {string} name - Navigation item name
   */
  const handleNavItemClick = (event, path) => {
    // eslint-disable-next-line no-console
    console.log(`Navigation clicked: ${path}`);
    // eslint-disable-next-line no-console
    console.log(`Current location: ${location.pathname}`);
  };

  const verifyAndUnlock = async (passwordToVerify) => {
    try {
      const settings = await dbService.getBarSettings();
      const actualPassword = settings?.admin_password || "123456";
      
      // eslint-disable-next-line no-console
      console.log("Admin unlock verification:", {
        entered: passwordToVerify,
        expected: actualPassword
      });

      if (passwordToVerify.trim() === String(actualPassword).trim()) {
        setIsAdminUnlocked(true);
        setShowUnlockModal(false);
        setUnlockPassword("");
        setUnlockError("");
        navigate("/dashboard");
      } else {
        setUnlockError("Incorrect password");
        playErrorFeedback();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Unlock error details:", err);
      setUnlockError(`Failed to verify password: ${err.message || err}`);
    }
  };

  const handleUnlock = (e) => {
    if (e) e.preventDefault();
    verifyAndUnlock(unlockPassword);
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value.replace(/\D/g, "");
    setUnlockPassword(val);
    if (val.trim().length === 6) {
      verifyAndUnlock(val);
    }
  };

  /**
   * NAVIGATION MENU CONFIGURATION
   * 
   * Defines all navigation items with their routes, names, and icons.
   * Each item corresponds to a major business module.
   */
  const menuItems = [
    { path: "/dashboard", name: "Dashboard", icon: BarChart3 },
    { path: "/orders", name: "Live Orders", icon: ClipboardList },
    { path: "/products", name: "Products", icon: Package },
    { path: "/reports", name: "Reports", icon: BarChart3 },
    { path: "/spendings", name: "Spendings", icon: DollarSign },
    { path: "/settings", name: "Settings", icon: SettingsIcon },
  ];

  const activeMenuItem = menuItems.find((item) => item.path === location.pathname) || menuItems[0];
  const ActiveIcon = activeMenuItem.icon;

  return (
    <div className={`app ${isAdminUnlocked ? "admin-unlocked" : "kiosk-locked"}`}>
      {isAdminUnlocked && sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar - only visible if admin is unlocked */}
      {isAdminUnlocked && (
        <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
          <div className="sidebar-header">
            <div className="logo-container">
              <img
                src={malabarLogo}
                alt="Malabar Waffle"
                className="sidebar-logo-img"
              />
              <div className="sidebar-brand-copy">
                <strong>Admin Console</strong>
                <span>{currentUser}</span>
              </div>
            </div>
            <button onClick={toggleSidebar} className="toggle-btn" aria-label="Close navigation menu">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link 
                  key={item.path} 
                  to={item.path} 
                  className={`nav-item ${isActive ? "active" : ""}`}
                  onClick={(event) => {
                    handleNavItemClick(event, item.path);
                    closeSidebar();
                  }}
                >
                  <IconComponent size={20} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <button 
            className="nav-item lock-console-btn"
            onClick={() => {
              setIsAdminUnlocked(false);
              closeSidebar();
              navigate("/");
            }}
          >
            <Lock size={20} />
            <span>Lock Console</span>
          </button>

          <div className="sidebar-footer">
            <div className="user-info">
              <span className="user-label">Current Page</span>
              <span className="current-user">{activeMenuItem.name}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        className={`main-content ${
          isAdminUnlocked && sidebarOpen ? "with-sidebar" : "full-width"
        }`}
      >
        {isAdminUnlocked && (
          <header className="mobile-admin-topbar">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={toggleSidebar}
              aria-label="Open navigation menu"
            >
              <Menu size={21} />
            </button>
            <div className="mobile-admin-title">
              <span>Malabar Waffle</span>
              <strong>
                <ActiveIcon size={18} />
                {activeMenuItem.name}
              </strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isAdminUnlocked && location.pathname === '/orders' && activeOrdersCount > 0 && (
                <span style={{ 
                  color: 'white', 
                  fontWeight: '800', 
                  fontSize: '0.9rem',
                  fontFamily: 'Outfit, sans-serif',
                  background: '#b6412c',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  boxShadow: '0 2px 8px rgba(182, 65, 44, 0.2)'
                }}>
                  {activeOrdersCount}
                </span>
              )}
            </div>
          </header>
        )}
        <Routes>
          <Route path="/menu" element={<CustomerMenu />} />
          <Route path="/" element={
            isAdminUnlocked
              ? <Navigate to="/dashboard" replace />
              : <POSSystem isKiosk={true} onOpenUnlockModal={() => setShowUnlockModal(true)} />
          } />
          {isAdminUnlocked ? (
            <>
              <Route path="/products" element={<ProductManagement />} />
              <Route path="/orders" element={<LiveOrdersScreen />} />
              <Route path="/reports" element={<SalesReports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/spendings" element={<Spendings />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/" replace />} />
          )}
        </Routes>
      </div>

      {/* Mobile Bottom Navigation Bar removed to only show options in hamburger menu */}

      {/* Unlock Modal */}
      {showUnlockModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '16px',
            width: '400px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', color: '#1A4050', fontFamily: 'Inter, sans-serif' }}>Admin Authentication</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#7f8c8d' }}>Please enter the 6-digit admin password to unlock the admin console.</p>
            <form onSubmit={handleUnlock}>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter password"
                value={unlockPassword}
                onChange={handlePasswordChange}
                maxLength={6}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '18px',
                  letterSpacing: '4px',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '2px solid #e2e8f0',
                  outline: 'none',
                  marginBottom: '10px'
                }}
              />
              {unlockError && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '15px' }}>{unlockError}</div>}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowUnlockModal(false); setUnlockPassword(""); setUnlockError(""); }} style={{ padding: '8px 20px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 24px', background: '#1C5C3A' }}>
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Global Notice Toast */}
      {globalNotice && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          right: '24px',
          background: '#1C5C3A',
          color: '#ffffff',
          padding: '16px 20px',
          borderRadius: '16px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: 'Outfit, sans-serif',
          animation: 'posNoticeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          maxWidth: '350px',
        }}>
          <span style={{ fontSize: '20px' }}>🔔</span>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem', margin: 0 }}>New Order Alert</strong>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>{globalNotice.message}</span>
          </div>
          <button 
            onClick={() => setGlobalNotice(null)} 
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              marginLeft: '12px',
              padding: '4px',
              opacity: 0.8,
              display: 'flex',
              alignItems: 'center',
              outline: 'none',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
