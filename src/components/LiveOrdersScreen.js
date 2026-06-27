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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Track viewport changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Real-time Firestore orders listener (today's orders only)
  useEffect(() => {
    const db = getFirebaseDb();
    if (!db) return;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfToday),
      orderBy('createdAt', 'desc') // Recent orders on top
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const list = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.orderStatus === 'cancelled') return;
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
          const isMobileViewport = window.innerWidth < 768;
          if (isMobileViewport) {
            if (prev) {
              const found = list.find((o) => o.id === prev.id);
              return found || null;
            }
            return null;
          }
          if (!prev && list.length > 0) return list[0];
          if (prev) {
            const found = list.find((o) => o.id === prev.id);
            return found || (list.length > 0 ? list[0] : null);
          }
          return null;
        });
      },
      (err) => {
        console.error('Error listening to today\'s orders:', err);
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
    <div style={{ padding: '16px', background: '#f6f3ee', minHeight: 'calc(100vh - 60px)', fontFamily: 'Outfit, sans-serif' }}>


      {orders.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1.5px solid #e6ded3', padding: '40px 20px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <AlertCircle size={40} style={{ color: '#7f766a', margin: '0 auto 12px auto', opacity: 0.6 }} />
          <h3 style={{ margin: '0 0 4px 0', color: '#221f1a', fontWeight: '700' }}>No Incoming Orders</h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '16px', alignItems: 'start' }}>
          {/* Left Column: Order Cards List */}
          {(!isMobile || !selectedOrder) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '78vh', overflowY: 'auto', paddingRight: '4px' }}>
            {orders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              const isWeb = order.orderNumber.startsWith('W-');
              const isCompleted = order.orderStatus === 'completed';
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  style={{
                    background: isCompleted ? '#f3f4f6' : '#ffffff',
                    opacity: isCompleted ? 0.8 : 1,
                    borderRadius: '10px',
                    border: isSelected ? '2.5px solid #b6412c' : (isCompleted ? '1.5px dashed #ccc' : '1.5px solid #e6ded3'),
                    padding: '10px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 10px rgba(182,65,44,0.08)' : '0 2px 6px rgba(0,0,0,0.01)',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '1rem', color: '#221f1a' }}>Order #{order.orderNumber}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Check/Tick complete button */}
                      {!isCompleted && (
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
                            width: '22px',
                            height: '22px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 5px rgba(28,141,60,0.2)',
                            outline: 'none',
                            padding: 0,
                            marginRight: '2px',
                          }}
                          title="Quick Complete Order"
                        >
                          <Check size={12} strokeWidth={3} style={{ display: 'block' }} />
                        </button>
                      )}

                      {order.orderType === 'delivery' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#fdf4ff', color: '#7e22ce', padding: '1px 4px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700' }}>
                          🛵 Delivery
                        </span>
                      )}
                      {isWeb ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#e0f2fe', color: '#0369a1', padding: '1px 4px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700' }}>
                          <Smartphone size={8} /> Web
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#fef3c7', color: '#b45309', padding: '1px 4px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700' }}>
                          <Monitor size={8} /> Kiosk
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#7f766a', marginBottom: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                      <Clock size={11} /> {getElapsedString(order.createdAt)}
                    </span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {isCompleted && (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 4px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: '700' }}>
                          COMPLETED
                        </span>
                      )}
                      <strong style={{ color: order.paymentStatus === 'paid' ? '#1c8d3c' : '#b6412c' }}>
                        {order.paymentStatus === 'paid' ? 'PAID' : 'CASH'}
                      </strong>
                    </div>
                  </div>

                  {/* Show Order Items directly on the card */}
                  <div style={{ fontSize: '0.8rem', color: '#221f1a', background: isCompleted ? '#e9ecef' : '#fbf7f4', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f2e7db' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#7f766a', marginBottom: '4px', borderBottom: '1px solid #f2e7db', paddingBottom: '2px' }}>
                      Items:
                    </div>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '2px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>• {item.name}</span>
                        <strong>x{item.quantity}</strong>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #f2e7db', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: '700' }}>
                      <span>Total:</span>
                      <span style={{ color: '#b6412c' }}>{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Status Indicator Bar */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '4px',
                    borderTopLeftRadius: '10px',
                    borderBottomLeftRadius: '10px',
                    background: isCompleted ? '#7f766a' : (order.orderStatus === 'pending_acceptance' ? '#e2a106' : '#1c8d3c')
                  }} />
                </div>
              );
            })}
            </div>
          )}

          {/* Right Column: Active Order Details Screen */}
          {selectedOrder && (!isMobile || selectedOrder) && (
            <div style={{ background: '#ffffff', borderRadius: '12px', border: '1.5px solid #e6ded3', padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #f2e7db', paddingBottom: '12px', marginBottom: '16px' }}>
                <div>
                  {isMobile && (
                    <button
                      onClick={() => setSelectedOrder(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#b6412c',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        padding: '0 0 8px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      ← Back to Orders
                    </button>
                  )}
                  <h3 style={{ margin: '0 0 2px 0', fontSize: '1.25rem', fontWeight: '800', color: '#221f1a' }}>
                    Order #{selectedOrder.orderNumber}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#7f766a' }}>
                    Placed: {selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate().toLocaleTimeString() : new Date(selectedOrder.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    background: selectedOrder.orderStatus === 'pending_acceptance' ? '#fef3c7' : (selectedOrder.orderStatus === 'completed' ? '#dcfce7' : '#dcfce7'),
                    color: selectedOrder.orderStatus === 'pending_acceptance' ? '#b45309' : (selectedOrder.orderStatus === 'completed' ? '#15803d' : '#15803d')
                  }}>
                    {selectedOrder.orderStatus === 'pending_acceptance' ? 'Pending Approval' : (selectedOrder.orderStatus === 'completed' ? 'Completed' : 'Preparing')}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: selectedOrder.paymentStatus === 'paid' ? '#1c8d3c' : '#b6412c' }}>
                    {selectedOrder.paymentStatus === 'paid'
                      ? '💳 PAID ONLINE'
                      : selectedOrder.orderType === 'delivery'
                        ? '🛵 CASH ON DELIVERY'
                        : '💵 PAY AT COUNTER'}
                  </span>
                </div>
              </div>

              {/* Customer Details */}
              <div style={{ background: '#fbf7f4', border: '1px dashed #e6ded3', borderRadius: '8px', padding: '10px', marginBottom: selectedOrder.orderType === 'delivery' ? '8px' : '16px', fontSize: '0.88rem' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: '#7f766a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>Name: <strong style={{ color: '#221f1a' }}>{selectedOrder.customerName || 'Customer'}</strong></div>
                  <div>Phone: <strong style={{ color: '#221f1a' }}>{selectedOrder.customerPhone || 'N/A'}</strong></div>
                  <div>Table: <strong style={{ color: '#221f1a' }}>{selectedOrder.tableNumber === 'Parcel' ? 'Parcel / Takeaway' : selectedOrder.tableNumber}</strong></div>
                  <div>Payment: <strong style={{ color: '#221f1a', textTransform: 'uppercase' }}>{selectedOrder.paymentMethod === 'cash' && selectedOrder.orderType === 'delivery' ? 'Cash on Delivery' : selectedOrder.paymentMethod}</strong></div>
                </div>
              </div>

              {/* Delivery Address */}
              {selectedOrder.orderType === 'delivery' && selectedOrder.deliveryAddress && (
                <div style={{ background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: '8px', padding: '10px', marginBottom: '16px', fontSize: '0.88rem' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🛵 Delivery Address</h4>
                  <div style={{ color: '#221f1a', lineHeight: '1.6' }}>
                    <div><strong>{selectedOrder.deliveryAddress.address}</strong></div>
                    {selectedOrder.deliveryAddress.landmark && (
                      <div style={{ color: '#7f766a' }}>Near: {selectedOrder.deliveryAddress.landmark}</div>
                    )}
                    <div>Pincode: <strong>{selectedOrder.deliveryAddress.pincode}</strong></div>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: '800', color: '#221f1a' }}>Items Ordered</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1.5px solid #f2e7db', borderRadius: '8px', overflow: 'hidden' }}>
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderBottom: idx === selectedOrder.items.length - 1 ? 'none' : '1px solid #f2e7db',
                        background: '#ffffff'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: '#221f1a', display: 'block' }}>
                          {item.name} <span style={{ color: '#b6412c', marginLeft: '4px' }}>x{item.quantity}</span>
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#7f766a' }}>{formatCurrency(item.unitPrice)} each</span>
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#221f1a' }}>{formatCurrency(item.totalPrice)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals */}
              <div style={{ borderTop: '2px solid #e6ded3', paddingTop: '12px', marginBottom: '16px' }}>
                {selectedOrder.orderType === 'delivery' && selectedOrder.deliveryFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#7f766a', marginBottom: '4px' }}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(selectedOrder.subtotal || (selectedOrder.totalAmount - selectedOrder.deliveryFee))}</span>
                  </div>
                )}
                {selectedOrder.orderType === 'delivery' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#7f766a', marginBottom: '6px' }}>
                    <span>Delivery fee</span>
                    <span style={{ color: selectedOrder.deliveryFee === 0 ? '#1c8d3c' : '#221f1a', fontWeight: '700' }}>
                      {selectedOrder.deliveryFee === 0 ? 'Free' : formatCurrency(selectedOrder.deliveryFee)}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#7f766a' }}>Total Amount</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#b6412c' }}>{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Actions Footer */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                {selectedOrder.orderStatus === 'pending_acceptance' ? (
                  <>
                    <button
                      onClick={() => handleCancelOrder(selectedOrder)}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #dc2626',
                        color: '#dc2626',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <X size={14} /> Reject
                    </button>
                    <button
                      onClick={() => handleAcceptOrder(selectedOrder)}
                      style={{
                        background: '#1C5C3A',
                        border: 'none',
                        color: '#ffffff',
                        padding: '8px 20px',
                        borderRadius: '20px',
                        fontWeight: '700',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 8px rgba(28,92,58,0.15)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Check size={14} /> Accept
                    </button>
                  </>
                ) : selectedOrder.orderStatus === 'completed' ? (
                  <div style={{ color: '#15803d', fontWeight: '700', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={16} /> Completed Order
                  </div>
                ) : (
                  <button
                    onClick={() => handleCompleteOrder(selectedOrder)}
                    style={{
                      background: '#b6412c',
                      border: 'none',
                      color: '#ffffff',
                      padding: '10px 24px',
                      borderRadius: '20px',
                      fontWeight: '700',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 3px 10px rgba(182,65,44,0.2)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Check size={16} /> Complete Order & Send Receipt
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
