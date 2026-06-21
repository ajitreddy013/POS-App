import React, { useState, useEffect, useMemo } from 'react';
import { getFirebaseDb } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';
import { Bell, Check, X, Clock, Smartphone, Monitor, AlertCircle } from 'lucide-react';

const formatCurrency = (amount) => `₹${Number(amount).toFixed(2)}`;

// Helper to format minutes elapsed
const getElapsedString = (createdAt) => {
  if (!createdAt) return 'Just now';
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  return `${diffMins} mins ago`;
};

const LiveOrdersScreen = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [barSettings, setBarSettings] = useState(null);
  const [timeCounter, setTimeCounter] = useState(0); // Trigger re-render for timers

  // Real-time ticking for "elapsed time" badge
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeCounter(prev => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch shop settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await dbService.getBarSettings();
        setBarSettings(settings);
      } catch (err) {
        console.error('Failed to load settings in Orders screen:', err);
      }
    };
    loadSettings();
  }, []);

  // Real-time Firestore orders listener (active orders only)
  useEffect(() => {
    const db = getFirebaseDb();
    if (!db) return;

    const q = query(
      collection(db, 'orders'),
      where('orderStatus', 'in', ['pending_acceptance', 'preparing']),
      orderBy('createdAt', 'asc') // Oldest first in kitchen
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const list = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Filter: Only display Cash orders or PAID UPI orders in kitchen
          const isCash = data.paymentMethod === 'cash';
          const isPaidUPI = data.paymentMethod === 'upi' && data.paymentStatus === 'paid';
          if (isCash || isPaidUPI) {
            list.push({ id: doc.id, ...data });
          }
        });
        setOrders(list);

        // Keep selection in sync or select the first order if none selected
        setSelectedOrder((prev) => {
          if (!prev && list.length > 0) return list[0];
          if (prev) {
            const found = list.find((o) => o.id === prev.id);
            return found || (list.length > 0 ? list[0] : null);
          }
          return null;
        });
      },
      (err) => {
        console.error('Error listening to active orders:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // Accept Order: Write to Dexie sale, update Firestore status to preparing, reload stock
  const handleAcceptOrder = async (order) => {
    try {
      const db = getFirebaseDb();
      if (!db) return;

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
        saleDate: new Date().toISOString(),
        barSettings,
      };

      // 1. Record sale locally in Dexie (deducts stock, updates dashboard/reports)
      await dbService.createSale(saleData);

      // 2. Update status to 'preparing' in Firestore
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, { orderStatus: 'preparing' });

      // Trigger local dashboard refresh custom event
      window.dispatchEvent(new CustomEvent('saleCompleted'));
      console.log(`Accepted Order #${order.orderNumber} successfully.`);
    } catch (err) {
      console.error('Failed to accept order:', err);
      alert(`Error accepting order: ${err.message || err}`);
    }
  };

  // Complete Order: Update Firestore status, send WhatsApp bill receipt
  const handleCompleteOrder = async (order) => {
    try {
      const db = getFirebaseDb();
      if (!db) return;

      // 1. Update status in Firestore to completed
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, { orderStatus: 'completed' });

      // 2. Trigger WhatsApp receipt
      if (order.customerPhone) {
        try {
          const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
          const saleDataForReceipt = {
            saleNumber: order.orderNumber,
            saleType: 'parcel',
            tableNumber: order.tableNumber || null,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            items: order.items,
            subtotal: order.totalAmount,
            taxAmount: 0,
            discountAmount: 0,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
            saleDate: new Date().toISOString(),
          };
          await whatsappService.sendBill(relayUrl, barSettings || {}, saleDataForReceipt);
        } catch (waErr) {
          console.error('WhatsApp final receipt failed:', waErr);
        }
      }
    } catch (err) {
      console.error('Failed to complete order:', err);
      alert(`Error completing order: ${err.message || err}`);
    }
  };

  // Quick Complete: Accept first if pending_acceptance, then complete
  const handleQuickComplete = async (order) => {
    try {
      const db = getFirebaseDb();
      if (!db) return;

      if (!window.confirm(`Are you sure you want to mark Order #${order.orderNumber} as Completed?`)) {
        return;
      }

      // If pending acceptance, we must first run the accept order logic to record the sale locally
      if (order.orderStatus === 'pending_acceptance') {
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
          saleDate: new Date().toISOString(),
          barSettings,
        };

        // Record sale locally in Dexie (deducts stock, updates dashboard/reports)
        await dbService.createSale(saleData);
        // Trigger local dashboard refresh custom event
        window.dispatchEvent(new CustomEvent('saleCompleted'));
      }

      // Update status in Firestore to completed
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, { orderStatus: 'completed' });

      // Trigger WhatsApp receipt
      if (order.customerPhone) {
        try {
          const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
          const saleDataForReceipt = {
            saleNumber: order.orderNumber,
            saleType: 'parcel',
            tableNumber: order.tableNumber || null,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            items: order.items,
            subtotal: order.totalAmount,
            taxAmount: 0,
            discountAmount: 0,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
            saleDate: new Date().toISOString(),
          };
          await whatsappService.sendBill(relayUrl, barSettings || {}, saleDataForReceipt);
        } catch (waErr) {
          console.error('WhatsApp final receipt failed:', waErr);
        }
      }
      
      console.log(`Quick completed Order #${order.orderNumber} successfully.`);
    } catch (err) {
      console.error('Failed to quick complete order:', err);
      alert(`Error completing order: ${err.message || err}`);
    }
  };

  // Reject Order: Update Firestore status to cancelled
  const handleCancelOrder = async (order) => {
    if (!window.confirm(`Are you sure you want to reject and cancel Order #${order.orderNumber}?`)) {
      return;
    }
    try {
      const db = getFirebaseDb();
      if (!db) return;

      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, { orderStatus: 'cancelled' });
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert(`Error cancelling order: ${err.message || err}`);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f6f3ee', minHeight: 'calc(100vh - 60px)', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '2px solid #e6ded3', paddingBottom: '12px' }}>
        <h2 style={{ margin: 0, color: '#221f1a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={24} style={{ color: '#b6412c' }} /> Kitchen & Live Orders
        </h2>
        <span style={{ background: '#b6412c', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
          {orders.length} Active Orders
        </span>
      </div>

      {orders.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e6ded3', padding: '60px 20px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <AlertCircle size={48} style={{ color: '#7f766a', margin: '0 auto 16px auto', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 8px 0', color: '#221f1a', fontWeight: '700' }}>No Incoming Orders</h3>
          <p style={{ margin: 0, color: '#7f766a', fontSize: '0.9rem' }}>Orders placed from the customer website or self-order kiosk will appear here in real-time.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Order Cards List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
            {orders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              const isWeb = order.orderNumber.startsWith('W-');
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: isSelected ? '2.5px solid #b6412c' : '1.5px solid #e6ded3',
                    padding: '14px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 6px 16px rgba(182,65,44,0.1)' : '0 4px 10px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '1.05rem', color: '#221f1a' }}>Order #{order.orderNumber}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Check/Tick complete button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickComplete(order);
                        }}
                        style={{
                          background: '#1c8d3c',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 5px rgba(28,141,60,0.2)',
                          outline: 'none',
                          padding: 0,
                          marginRight: '4px',
                        }}
                        title="Quick Complete Order"
                      >
                        <Check size={13} strokeWidth={3} style={{ display: 'block' }} />
                      </button>

                      {isWeb ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' }}>
                          <Smartphone size={10} /> Web
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700' }}>
                          <Monitor size={10} /> Kiosk
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: '#7f766a', marginBottom: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                      <Clock size={12} /> {getElapsedString(order.createdAt)}
                    </span>
                    <strong style={{ color: order.paymentStatus === 'paid' ? '#1c8d3c' : '#b6412c' }}>
                      {order.paymentStatus === 'paid' ? 'PAID' : 'PAY CASH'}
                    </strong>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#221f1a', background: '#fbf7f4', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f2e7db' }}>
                    {order.items.length} item{order.items.length > 1 ? 's' : ''} • <strong style={{ color: '#b6412c' }}>{formatCurrency(order.totalAmount)}</strong>
                  </div>

                  {/* Status Indicator Bar */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '5px',
                    borderTopLeftRadius: '12px',
                    borderBottomLeftRadius: '12px',
                    background: order.orderStatus === 'pending_acceptance' ? '#e2a106' : '#1c8d3c'
                  }} />
                </div>
              );
            })}
          </div>

          {/* Right Column: Active Order Details Screen */}
          {selectedOrder && (
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e6ded3', padding: '24px', boxShadow: '0 6px 20px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #f2e7db', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: '800', color: '#221f1a' }}>
                    Order #{selectedOrder.orderNumber}
                  </h3>
                  <span style={{ fontSize: '0.85rem', color: '#7f766a' }}>
                    Placed: {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleTimeString() : new Date(selectedOrder.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    background: selectedOrder.orderStatus === 'pending_acceptance' ? '#fef3c7' : '#dcfce7',
                    color: selectedOrder.orderStatus === 'pending_acceptance' ? '#b45309' : '#15803d'
                  }}>
                    {selectedOrder.orderStatus === 'pending_acceptance' ? 'Pending Approval' : 'Preparing'}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: selectedOrder.paymentStatus === 'paid' ? '#1c8d3c' : '#b6412c' }}>
                    {selectedOrder.paymentStatus === 'paid' ? '💳 PAID ONLINE' : '💵 PAY AT COUNTER'}
                  </span>
                </div>
              </div>

              {/* Customer Details */}
              <div style={{ background: '#fbf7f4', border: '1px dashed #e6ded3', borderRadius: '12px', padding: '14px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: '#7f766a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.92rem' }}>
                  <div>Name: <strong style={{ color: '#221f1a' }}>{selectedOrder.customerName || 'Customer'}</strong></div>
                  <div>Phone: <strong style={{ color: '#221f1a' }}>{selectedOrder.customerPhone || 'N/A'}</strong></div>
                  <div>Table: <strong style={{ color: '#221f1a' }}>{selectedOrder.tableNumber === 'Parcel' ? 'Parcel / Takeaway' : selectedOrder.tableNumber}</strong></div>
                  <div>Payment Method: <strong style={{ color: '#221f1a', textTransform: 'uppercase' }}>{selectedOrder.paymentMethod}</strong></div>
                </div>
              </div>

              {/* Items List */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '800', color: '#221f1a' }}>Items Ordered</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1.5px solid #f2e7db', borderRadius: '12px', overflow: 'hidden' }}>
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        borderBottom: idx === selectedOrder.items.length - 1 ? 'none' : '1px solid #f2e7db',
                        background: '#ffffff'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '1rem', color: '#221f1a', display: 'block' }}>
                          {item.name} <span style={{ color: '#b6412c', marginLeft: '6px' }}>x{item.quantity}</span>
                        </strong>
                        <span style={{ fontSize: '0.78rem', color: '#7f766a' }}>{formatCurrency(item.unitPrice)} each</span>
                      </div>
                      <strong style={{ fontSize: '1.05rem', color: '#221f1a' }}>{formatCurrency(item.totalPrice)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #e6ded3', paddingTop: '16px', marginBottom: '24px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#7f766a' }}>Total Amount</span>
                <span style={{ fontSize: '1.6rem', fontWeight: '800', color: '#b6412c' }}>{formatCurrency(selectedOrder.totalAmount)}</span>
              </div>

              {/* Actions Footer */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                {selectedOrder.orderStatus === 'pending_acceptance' ? (
                  <>
                    <button
                      onClick={() => handleCancelOrder(selectedOrder)}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #dc2626',
                        color: '#dc2626',
                        padding: '12px 24px',
                        borderRadius: '24px',
                        fontWeight: '700',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <X size={16} /> Reject Order
                    </button>
                    <button
                      onClick={() => handleAcceptOrder(selectedOrder)}
                      style={{
                        background: '#1C5C3A',
                        border: 'none',
                        color: '#ffffff',
                        padding: '12px 32px',
                        borderRadius: '24px',
                        fontWeight: '700',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(28,92,58,0.2)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Check size={16} /> Accept Order
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleCompleteOrder(selectedOrder)}
                    style={{
                      background: '#b6412c',
                      border: 'none',
                      color: '#ffffff',
                      padding: '14px 40px',
                      borderRadius: '24px',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 15px rgba(182,65,44,0.3)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Check size={18} /> Complete Order & Send Receipt
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveOrdersScreen;
