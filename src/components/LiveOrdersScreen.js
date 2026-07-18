import React, { useState, useEffect } from 'react';
import { getFirebaseDb } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import {
  Clock,
  Smartphone,
  Monitor,
  AlertCircle,
  MapPin,
  Check,
} from 'lucide-react';

const formatCurrency = (amount) => `₹${Number(amount).toFixed(2)}`;

const getElapsedString = (createdAt) => {
  if (!createdAt) return 'Just now';
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  return `${diffMins} mins ago`;
};

// Single source of truth for order-type theming — add a new order type here
// rather than threading a new ternary branch through every color/border below.
const ORDER_TYPE_THEME = {
  delivery: {
    cardBg: '#faf5ff',
    cardBorder: '1.5px solid #d8b4fe',
    cardBorderSelected: '2.5px solid #7e22ce',
    shadowSelected: '0 4px 10px rgba(126,34,206,0.12)',
    accent: '#7e22ce',
    boxBorder: '#e9d5ff',
    boxBg: '#f3e8ff',
    badgeBg: '#f3e8ff',
    badgeColor: '#7e22ce',
    statusBar: '#7e22ce',
  },
  parcel: {
    cardBg: '#fffbeb',
    cardBorder: '1.5px solid #fde68a',
    cardBorderSelected: '2.5px solid #b45309',
    shadowSelected: '0 4px 10px rgba(180,83,9,0.12)',
    accent: '#b45309',
    boxBorder: '#fde68a',
    boxBg: '#fef3c7',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
    statusBar: '#b45309',
  },
  default: {
    cardBg: '#ffffff',
    cardBorder: '1.5px solid #e6ded3',
    cardBorderSelected: '2.5px solid #b6412c',
    shadowSelected: '0 4px 10px rgba(182,65,44,0.08)',
    accent: '#b6412c',
    boxBorder: '#f2e7db',
    boxBg: '#fbf7f4',
    badgeBg: null,
    badgeColor: null,
    statusBar: '#1c8d3c',
  },
};

const getOrderTypeTheme = (orderType) =>
  ORDER_TYPE_THEME[orderType] || ORDER_TYPE_THEME.default;

const LiveOrdersScreen = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [tickedOrders, setTickedOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('liveOrders_ticked');
      if (!saved) return new Set();
      const { date, ids } = JSON.parse(saved);
      const today = new Date().toLocaleDateString('en-CA');
      return date === today ? new Set(ids) : new Set();
    } catch {
      return new Set();
    }
  });
  const [timeCounter, setTimeCounter] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const toggleTick = (orderId) => {
    setTickedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      try {
        localStorage.setItem('liveOrders_ticked', JSON.stringify({
          date: new Date().toLocaleDateString('en-CA'),
          ids: [...next],
        }));
      } catch { /* silent */ }
      return next;
    });
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTimeCounter((prev) => prev + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db) return;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>=', startOfToday),
      orderBy('createdAt', 'desc')
    );

    const todayStr = startOfToday.toLocaleDateString('en-CA'); // YYYY-MM-DD

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const list = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();

          // Client-side date guard — reject any order not from today
          const createdMs = data.createdAt?.toMillis
            ? data.createdAt.toMillis()
            : data.createdAt instanceof Date
              ? data.createdAt.getTime()
              : null;
          if (createdMs !== null) {
            const orderDateStr = new Date(createdMs).toLocaleDateString('en-CA');
            if (orderDateStr !== todayStr) return;
          }

          const isCash = data.paymentMethod === 'cash';
          const isPaidUPI =
            data.paymentMethod === 'upi' && data.paymentStatus === 'paid';
          if (isCash || isPaidUPI) {
            list.push({ id: doc.id, ...data });
          }
        });
        setOrders(list);

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
        console.error("Error listening to today's orders:", err);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div
      style={{
        padding: '16px 16px calc(96px + env(safe-area-inset-bottom, 0px))',
        background: '#f6f3ee',
        minHeight: 'calc(100dvh - 60px)',
        fontFamily: 'Outfit, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {orders.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e6ded3',
            padding: '40px 20px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
          }}
        >
          <AlertCircle
            size={40}
            style={{
              color: '#7f766a',
              margin: '0 auto 12px auto',
              opacity: 0.6,
            }}
          />
          <h3
            style={{ margin: '0 0 4px 0', color: '#221f1a', fontWeight: '700' }}
          >
            No Incoming Orders
          </h3>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '300px 1fr',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          {/* Left: Order Cards List */}
          {(!isMobile || !selectedOrder) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: 'calc(100dvh - 180px)',
                overflowY: 'auto',
                paddingRight: '4px',
                paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              {orders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const isDelivery = order.orderType === 'delivery';
                const isParcel = order.orderType === 'parcel';
                const isWeb = order.source === 'web' || (!order.source && order.orderNumber?.startsWith('W-'));
                const isTicked = tickedOrders.has(order.id);
                const theme = getOrderTypeTheme(order.orderType);

                return (
                  <div key={order.id} style={{ position: 'relative' }}>
                    <div
                      onClick={() => setSelectedOrder(order)}
                      style={{
                        background: theme.cardBg,
                        borderRadius: '10px',
                        border: isSelected ? theme.cardBorderSelected : theme.cardBorder,
                        padding: '10px 44px 10px 10px',
                        cursor: 'pointer',
                        boxShadow: isSelected ? theme.shadowSelected : '0 2px 6px rgba(0,0,0,0.01)',
                        transition: 'all 0.25s',
                        position: 'relative',
                        filter: isTicked ? 'blur(2px)' : 'none',
                        opacity: isTicked ? 0.4 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <strong style={{ fontSize: '1rem', color: '#221f1a' }}>
                          {order.customerName || 'Customer'} #{order.orderNumber}
                        </strong>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {(isDelivery || isParcel) && (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                background: theme.badgeBg,
                                color: theme.badgeColor,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                              }}
                            >
                              {isDelivery ? '🛵 Delivery' : 'Parcel 📦'}
                            </span>
                          )}
                          {isWeb ? (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '1px 4px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                              }}
                            >
                              <Smartphone size={8} /> Web
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '1px 4px',
                                borderRadius: '4px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                              }}
                            >
                              <Monitor size={8} /> Kiosk
                            </span>
                          )}
                        </div>
                      </div>
                      {isDelivery && order.customerPhone && (
                        <div style={{ fontSize: '0.8rem', color: '#7e22ce', fontWeight: '700', marginBottom: '6px' }}>
                          📞 {order.customerPhone}
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.78rem',
                          color: '#7f766a',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: '500',
                          }}
                        >
                          <Clock size={11} />{' '}
                          {getElapsedString(order.createdAt)}
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            gap: '4px',
                            alignItems: 'center',
                          }}
                        >
                          <strong
                            style={{
                              color:
                                order.paymentMethod === 'cash'
                                  ? '#b6412c' // Keep cash distinct visually
                                  : order.paymentStatus === 'paid'
                                  ? '#1c8d3c'
                                  : '#b6412c',
                            }}
                          >
                            {order.paymentMethod === 'cash' ? 'CASH' : (order.paymentStatus === 'paid' ? 'PAID' : 'PENDING')}
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#221f1a',
                          background: theme.boxBg,
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${theme.boxBorder}`,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: '700',
                            fontSize: '0.75rem',
                            color: isDelivery || isParcel ? theme.accent : '#7f766a',
                            marginBottom: '4px',
                            borderBottom: `1px solid ${theme.boxBorder}`,
                            paddingBottom: '2px',
                          }}
                        >
                          Items:
                        </div>
                        {order.items.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.78rem',
                              marginBottom: '2px',
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '180px',
                              }}
                            >
                              • {item.name}
                            </span>
                            <strong>x{item.quantity}</strong>
                          </div>
                        ))}
                        <div
                          style={{
                            borderTop: `1px solid ${theme.boxBorder}`,
                            marginTop: '4px',
                            paddingTop: '4px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                          }}
                        >
                          <span>Total:</span>
                          <span style={{ color: theme.accent }}>
                            {formatCurrency(order.totalAmount || order.amount || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Status color bar on left edge */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: '4px',
                          borderTopLeftRadius: '10px',
                          borderBottomLeftRadius: '10px',
                          background: theme.statusBar,
                        }}
                      />
                    </div>

                    {/* Tick button — stays sharp above the blur */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTick(order.id);
                      }}
                      title={isTicked ? 'Unmark as done' : 'Mark as done'}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        right: '10px',
                        zIndex: 10,
                        background: isTicked ? '#16a34a' : '#ffffff',
                        border: isTicked
                          ? '2px solid #16a34a'
                          : '2px solid #d1d5db',
                        borderRadius: '50%',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.2s',
                        boxShadow: isTicked
                          ? '0 2px 8px rgba(22,163,74,0.35)'
                          : '0 1px 4px rgba(0,0,0,0.12)',
                      }}
                    >
                      {isTicked && (
                        <Check size={13} strokeWidth={3} color="#ffffff" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Right: Order Detail Panel */}
          {selectedOrder && (!isMobile || selectedOrder) && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: getOrderTypeTheme(selectedOrder.orderType).cardBorder,
                padding: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                maxHeight: 'calc(100dvh - 140px)',
                overflowY: 'auto',
                paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1.5px solid #f2e7db',
                  paddingBottom: '12px',
                  marginBottom: '16px',
                }}
              >
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
                        gap: '4px',
                      }}
                    >
                      ← Back to Orders
                    </button>
                  )}
                  <h3
                    style={{
                      margin: '0 0 2px 0',
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      color: '#221f1a',
                    }}
                  >
                    {selectedOrder.customerName || 'Customer'} #{selectedOrder.orderNumber}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#7f766a' }}>
                    Placed:{' '}
                    {selectedOrder.createdAt?.toDate
                      ? selectedOrder.createdAt.toDate().toLocaleTimeString()
                      : new Date(selectedOrder.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      color:
                        selectedOrder.paymentMethod === 'cash'
                          ? '#b6412c'
                          : selectedOrder.paymentStatus === 'paid'
                          ? '#1c8d3c'
                          : '#b6412c',
                    }}
                  >
                    {selectedOrder.paymentMethod === 'cash'
                      ? '💵 CASH'
                      : selectedOrder.paymentStatus === 'paid'
                      ? '💳 PAID ONLINE'
                      : selectedOrder.orderType === 'delivery'
                      ? '🛵 CASH ON DELIVERY'
                      : '💵 PAY AT COUNTER'}
                  </span>
                </div>
              </div>

              {/* Customer Info */}
              <div
                style={{
                  background: '#fbf7f4',
                  border: '1px dashed #e6ded3',
                  borderRadius: '8px',
                  padding: '10px',
                  marginBottom: '12px',
                  fontSize: '0.88rem',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 6px 0',
                    fontSize: '0.8rem',
                    color: '#7f766a',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Customer
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                  }}
                >
                  <div>
                    Name:{' '}
                    <strong style={{ color: '#221f1a' }}>
                      {selectedOrder.customerName || 'Customer'}
                    </strong>
                  </div>
                  <div>
                    Type:{' '}
                    <strong style={{ color: '#221f1a' }}>
                      {selectedOrder.orderType === 'delivery'
                        ? 'Delivery'
                        : selectedOrder.orderType === 'parcel'
                        ? 'Parcel'
                        : 'Dine In'}
                    </strong>
                  </div>
                  {selectedOrder.orderType === 'delivery' && selectedOrder.customerPhone && (
                    <div>
                      Phone:{' '}
                      <strong style={{ color: '#221f1a' }}>
                        {selectedOrder.customerPhone}
                      </strong>
                    </div>
                  )}
                  <div>
                    Payment:{' '}
                    <strong
                      style={{ color: '#221f1a', textTransform: 'uppercase' }}
                    >
                      {selectedOrder.paymentMethod === 'cash' &&
                      selectedOrder.orderType === 'delivery'
                        ? 'Cash on Delivery'
                        : selectedOrder.paymentMethod}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Delivery Address — shown only for delivery orders */}
              {selectedOrder.orderType === 'delivery' && (
                <div
                  style={{
                    background: '#faf5ff',
                    border: '2px solid #c084fc',
                    borderRadius: '10px',
                    padding: '14px',
                    marginBottom: '16px',
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '0.85rem',
                      color: '#7e22ce',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <MapPin size={14} /> Delivery Address
                  </h4>
                  {selectedOrder.deliveryAddress ? (
                    <div
                      style={{
                        color: '#221f1a',
                        lineHeight: '1.9',
                        fontSize: '0.92rem',
                      }}
                    >
                      <div>
                        <strong>{selectedOrder.deliveryAddress.address}</strong>
                      </div>
                      {selectedOrder.deliveryAddress.landmark && (
                        <div style={{ color: '#7f766a' }}>
                          Near: {selectedOrder.deliveryAddress.landmark}
                        </div>
                      )}
                      <div>
                        Pincode:{' '}
                        <strong>{selectedOrder.deliveryAddress.pincode}</strong>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        color: '#9ca3af',
                        fontStyle: 'italic',
                        fontSize: '0.88rem',
                      }}
                    >
                      No address provided
                    </div>
                  )}
                </div>
              )}

              {/* Items Ordered */}
              <div style={{ marginBottom: '16px' }}>
                <h4
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    color: '#221f1a',
                  }}
                >
                  Items Ordered
                </h4>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1.5px solid #f2e7db',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderBottom:
                          idx === selectedOrder.items.length - 1
                            ? 'none'
                            : '1px solid #f2e7db',
                        background: '#ffffff',
                      }}
                    >
                      <div>
                        <strong
                          style={{
                            fontSize: '0.9rem',
                            color: '#221f1a',
                            display: 'block',
                          }}
                        >
                          {item.name}{' '}
                          <span style={{ color: '#b6412c', marginLeft: '4px' }}>
                            x{item.quantity}
                          </span>
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#7f766a' }}>
                          {formatCurrency(item.unitPrice)} each
                        </span>
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#221f1a' }}>
                        {formatCurrency(item.totalPrice || (item.unitPrice * item.quantity) || 0)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill Totals */}
              <div
                style={{ borderTop: '2px solid #e6ded3', paddingTop: '12px' }}
              >
                {selectedOrder.orderType === 'delivery' &&
                  selectedOrder.deliveryFee > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        color: '#7f766a',
                        marginBottom: '4px',
                      }}
                    >
                      <span>Subtotal</span>
                      <span>
                        {formatCurrency(
                          selectedOrder.subtotal ||
                            (selectedOrder.totalAmount || selectedOrder.amount || 0) -
                              (selectedOrder.deliveryFee || 0)
                        )}
                      </span>
                    </div>
                  )}
                {selectedOrder.orderType === 'delivery' && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                      color: '#7f766a',
                      marginBottom: '6px',
                    }}
                  >
                    <span>Delivery fee</span>
                    <span
                      style={{
                        color:
                          selectedOrder.deliveryFee === 0
                            ? '#1c8d3c'
                            : '#221f1a',
                        fontWeight: '700',
                      }}
                    >
                      {selectedOrder.deliveryFee === 0
                        ? 'Free'
                        : formatCurrency(selectedOrder.deliveryFee)}
                    </span>
                  </div>
                )}
                {selectedOrder.orderType === 'parcel' &&
                  selectedOrder.parcelCharge > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        color: '#7f766a',
                        marginBottom: '4px',
                      }}
                    >
                      <span>Subtotal</span>
                      <span>
                        {formatCurrency(
                          selectedOrder.subtotal ||
                            (selectedOrder.totalAmount || selectedOrder.amount || 0) -
                              (selectedOrder.parcelCharge || 0)
                        )}
                      </span>
                    </div>
                  )}
                {selectedOrder.orderType === 'parcel' && selectedOrder.parcelCharge > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                      color: '#7f766a',
                      marginBottom: '6px',
                    }}
                  >
                    <span>Parcel charge</span>
                    <span style={{ color: '#b45309', fontWeight: '700' }}>
                      {formatCurrency(selectedOrder.parcelCharge)}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: '700',
                      color: '#7f766a',
                    }}
                  >
                    Total Amount
                  </span>
                  <span
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: '800',
                      color: '#b6412c',
                    }}
                  >
                    {formatCurrency(selectedOrder.totalAmount || selectedOrder.amount || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveOrdersScreen;
