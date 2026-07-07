import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Keyboard } from '@capacitor/keyboard';
import { getFirebaseDb } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  runTransaction,
} from 'firebase/firestore';
import { APP_CONFIG } from '../config';
import {
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import useBarSettings from '../utils/useBarSettings';
import { isOfferActiveToday, calculateOfferDiscount } from '../utils/offerUtils';

const CustomerMenu = () => {
  const searchParams = useSearchParams()[0];
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [upiQrPayment, setUpiQrPayment] = useState(null);
  const [upiQrStatus, setUpiQrStatus] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);
  const qrPollIntervalRef = useRef(null);
  const qrPaymentPromiseRef = useRef({ resolve: null, reject: null });

  // Checkout Form State
  const [name, setName] = useState('');
  const nameInputRef = useRef(null);
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' or 'cash'
  const [submitting, setSubmitting] = useState(false);

  // Get table number from URL, e.g., ?table=T3. Default to "Parcel" if not present.
  const tableNumber = searchParams.get('table') || 'Parcel';

  // Initialize Firebase Firestore db using default config
  const db = useMemo(() => getFirebaseDb(), []);
  const { barSettings } = useBarSettings();

  useEffect(() => {
    // Dynamically load Google Fonts for modern aesthetics
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    loadMenu();
    return () => {
      if (qrPollIntervalRef.current) {
        clearInterval(qrPollIntervalRef.current);
        qrPollIntervalRef.current = null;
      }
      document.head.removeChild(link);
    };
  }, [loadMenu]);

  const loadMenu = useCallback(async () => {
    if (!db) {
      // Firebase not configured yet
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const list = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.available !== false) {
          list.push(data);
        }
      });
      setProducts(list);
    } catch (err) {
      console.error('Failed to load products from cloud:', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  // Group products by category
  const categories = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const cat = p.category || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    Object.values(map).forEach((items) =>
      items.sort((a, b) => Number(a.price) - Number(b.price))
    );
    return map;
  }, [products]);

  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => {
    const keys = Object.keys(categories);
    if (keys.length > 0 && !activeCategory) {
      setActiveCategory(keys[0]);
    }
  }, [categories, activeCategory]);

  // Cart operations
  const addToCart = (productId) => {
    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1,
    }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[productId] <= 1) {
        delete copy[productId];
      } else {
        copy[productId] -= 1;
      }
      return copy;
    });
  };

  // Cart totals
  const cartItemsList = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((p) => String(p.id) === id);
        return product ? { ...product, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const totalAmount = useMemo(() => {
    return cartItemsList.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }, [cartItemsList]);

  const fmt12h = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const offerActive = useMemo(() => isOfferActiveToday(barSettings), [barSettings]);

  const offerResult = useMemo(() => {
    if (!offerActive || cartItemsList.length === 0) return { discountAmount: 0, freeItems: [] };
    return calculateOfferDiscount(cartItemsList);
  }, [offerActive, cartItemsList]);

  const finalTotal = useMemo(() => Math.max(0, totalAmount - offerResult.discountAmount), [totalAmount, offerResult]);

  const totalQuantity = useMemo(() => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0);
  }, [cart]);

  const closeUpiQrPayment = (shouldReject = true) => {
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }

    setUpiQrPayment(null);
    setUpiQrStatus('');
    setUpiQrLoading(false);

    const pendingReject = qrPaymentPromiseRef.current.reject;
    qrPaymentPromiseRef.current = { resolve: null, reject: null };

    if (shouldReject && pendingReject) {
      pendingReject(new Error('Payment cancelled by customer.'));
    }
  };

  // Cashfree UPI QR integration — tempOrderId is a throwaway id used only for
  // Cashfree's own bookkeeping; the real sequential order number is assigned
  // only after this promise resolves (see handlePlaceOrder), so an abandoned
  // or failed payment never wastes a number.
  const startCashfreeUpiPayment = async (tempOrderId) => {
    const relayUrl = APP_CONFIG.relayUrl;

    return new Promise((resolve, reject) => {
      qrPaymentPromiseRef.current = { resolve, reject };
      setUpiQrLoading(true);
      setUpiQrStatus('Generating UPI QR code...');
      setUpiQrPayment({
        orderId: tempOrderId,
        amount: finalTotal,
        qrImageUrl: '',
      });

      fetch(`${relayUrl}/payment/cashfree/upi-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalTotal,
          orderId: tempOrderId,
          phone: '9999999999',
          name,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (!data.success) {
            throw new Error(data.error || 'Failed to create UPI QR code.');
          }

          setUpiQrLoading(false);

          const cfOrderId = data.orderId;
          setUpiQrPayment({
            orderId: tempOrderId,
            amount: finalTotal,
            qrImageUrl: `data:image/png;base64,${data.qrData}`,
          });
          setUpiQrStatus('Waiting for customer payment...');

          if (qrPollIntervalRef.current) {
            clearInterval(qrPollIntervalRef.current);
          }

          qrPollIntervalRef.current = setInterval(async () => {
            try {
              const statusResponse = await fetch(
                `${relayUrl}/payment/cashfree/order-status`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cfOrderId }),
                }
              );

              const statusData = await statusResponse.json();
              if (statusData.success && statusData.paid) {
                if (qrPollIntervalRef.current) {
                  clearInterval(qrPollIntervalRef.current);
                  qrPollIntervalRef.current = null;
                }
                setUpiQrStatus('Payment received. Completing order...');
                setTimeout(() => {
                  setUpiQrLoading(false);
                  setUpiQrPayment(null);
                  setUpiQrStatus('');
                  const pendingResolve = qrPaymentPromiseRef.current.resolve;
                  qrPaymentPromiseRef.current = { resolve: null, reject: null };
                  pendingResolve({ success: true });
                }, 1000);
              }
            } catch (error) {
              console.error('Error polling Cashfree QR status:', error);
            }
          }, 3000);
        })
        .catch((error) => {
          if (qrPollIntervalRef.current) {
            clearInterval(qrPollIntervalRef.current);
            qrPollIntervalRef.current = null;
          }
          setUpiQrLoading(false);
          setUpiQrStatus('');
          setUpiQrPayment(null);
          qrPaymentPromiseRef.current = { resolve: null, reject: null };
          reject(error);
        });
    });
  };

  // Submit order to cloud database
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cartItemsList.length === 0) return;
    if (!name.trim()) {
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInputRef.current?.focus();
      Keyboard.show().catch(() => {});
      return;
    }

    setSubmitting(true);

    try {
      let payStatus = 'pending';

      if (paymentMethod === 'upi') {
        // Real order number is only reserved once payment is actually
        // confirmed — a temp id is enough for Cashfree's own bookkeeping
        // pre-payment, so an abandoned/cancelled QR never wastes a number.
        const tempOrderId = `APP-${Date.now()}`;
        await startCashfreeUpiPayment(tempOrderId);
        payStatus = 'paid';
      }
      // Use finalTotal (after 1+1 offer discount) for actual payment

      // Fallback if the counter transaction below never runs (e.g. db unavailable).
      let orderNumber = `PENDING-${Date.now()}`;
      if (db) {
        try {
          const settingsRef = doc(db, 'settings', 'order_counters');
          await runTransaction(db, async (transaction) => {
            const settingsSnap = await transaction.get(settingsRef);
            let currentCount = 0;
            if (settingsSnap.exists()) {
              currentCount = settingsSnap.data().totalOrders || 0;
            }
            currentCount += 1;
            transaction.set(settingsRef, { totalOrders: currentCount }, { merge: true });
            orderNumber = `A-${currentCount}`;
          });
        } catch (err) {
          console.error('Failed to generate sequential app order number:', err);
        }
      }

      // Save order to Firestore
      const orderData = {
        orderNumber,
        source: 'app',
        customerName: name,
        tableNumber,
        items: cartItemsList.map((item) => ({
          productId: String(item.id),
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        totalAmount: finalTotal,
        discountAmount: offerResult.discountAmount,
        paymentMethod,
        paymentStatus: payStatus,
        orderStatus: 'completed',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'orders'), orderData);

      // Reset cart and show success screen
      setCart({});
      setOrderSuccess(orderNumber);
      setShowCheckout(false);
    } catch (err) {
      console.error('Order submission failed:', err);
      alert(err.message || 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!db) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '20px',
          fontFamily: '"Outfit", sans-serif',
          color: '#1E293B',
          background: '#F8FAFC',
        }}
      >
        <h2 style={{ fontWeight: '600', marginBottom: '8px' }}>
          Store Connection Pending
        </h2>
        <p style={{ color: '#64748B', textAlign: 'center' }}>
          This shop is not connected to the cloud yet. Please paste your
          Firebase configuration in the Admin settings dashboard.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#F8FAFC',
        }}
      >
        <Loader2
          className="animate-spin"
          size={48}
          style={{ color: '#1C5C3A' }}
        />
        <p
          style={{
            marginTop: '12px',
            color: '#64748B',
            fontFamily: '"Outfit", sans-serif',
          }}
        >
          Loading delicious waffles...
        </p>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          fontFamily: '"Outfit", sans-serif',
          background: '#1C5C3A',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <CheckCircle2
          size={72}
          style={{ color: '#EAB308', marginBottom: '24px' }}
        />
        <h1
          style={{
            fontSize: '2.2rem',
            fontWeight: '700',
            marginBottom: '12px',
          }}
        >
          Order Placed!
        </h1>
        <p
          style={{
            fontSize: '1.1rem',
            opacity: 0.9,
            maxWidth: '340px',
            margin: '0 auto 24px auto',
            lineHeight: '1.6',
          }}
        >
          Thank you, <strong>{name}</strong>! Your order{' '}
          <strong>#{orderSuccess}</strong> is placed for{' '}
          <strong>Table {tableNumber}</strong>.
        </p>
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.2)',
            marginBottom: '32px',
          }}
        >
          <span
            style={{
              fontSize: '0.9rem',
              opacity: 0.8,
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Status
          </span>
          <strong style={{ fontSize: '1.2rem', color: '#FCD34D' }}>
            Preparing in Kitchen
          </strong>
        </div>
        <button
          onClick={() => setOrderSuccess(null)}
          style={{
            background: 'white',
            color: '#1C5C3A',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '24px',
            fontWeight: '700',
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          Order Something Else <Sparkles size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: '"Outfit", sans-serif',
        color: '#1E293B',
        background: '#F8FAFC',
        minHeight: '100vh',
        paddingBottom: totalQuantity > 0 ? '90px' : '20px',
      }}
    >
      {/* Premium Header */}
      <header
        style={{
          background: '#1C5C3A',
          color: 'white',
          padding: '24px 20px',
          borderBottomLeftRadius: '24px',
          borderBottomRightRadius: '24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.85rem',
                opacity: 0.85,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: '600',
              }}
            >
              Malabar Waffle
            </span>
            <h1
              style={{
                fontSize: '1.6rem',
                fontWeight: '700',
                margin: '2px 0 0 0',
              }}
            >
              Table {tableNumber}
            </h1>
          </div>
          <Sparkles size={24} style={{ color: '#EAB308' }} />
        </div>
      </header>

      {/* 1+1 Offer Banner */}
      {offerActive && (
        <div style={{
          background: 'linear-gradient(135deg, #EAB308 0%, #F59E0B 100%)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          boxShadow: '0 4px 16px rgba(234,179,8,0.35)',
          position: 'sticky',
          top: '92px',
          zIndex: 95,
        }}>
          <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>🎉</span>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: '900', fontSize: '1.05rem', color: '#1e293b', letterSpacing: '-0.01em' }}>
              BUY 1 GET 1 FREE — Today Only!
            </p>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#1e293b', opacity: 0.8, fontWeight: '600' }}>
              Add any 2 waffles · the cheaper one is FREE
            </p>
          </div>
          <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>🧇</span>
        </div>
      )}

      {/* Category Navigation Bar */}
      <div
        style={{
          overflowX: 'auto',
          display: 'flex',
          padding: '16px 12px',
          gap: '8px',
          position: 'sticky',
          top: '78px',
          background: '#F8FAFC',
          zIndex: 90,
          scrollbarWidth: 'none',
        }}
      >
        {Object.keys(categories).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              border: activeCategory === cat ? 'none' : '1px solid #E2E8F0',
              background: activeCategory === cat ? '#1C5C3A' : 'white',
              color: activeCategory === cat ? 'white' : '#64748B',
              fontWeight: '600',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxShadow:
                activeCategory === cat
                  ? '0 4px 10px rgba(28,92,90,0.2)'
                  : 'none',
              transition: 'all 0.2s',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu Cards */}
      <main style={{ padding: '0 16px' }}>
        {activeCategory && categories[activeCategory] && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {categories[activeCategory].map((product) => {
              const qty = cart[product.id] || 0;
              return (
                <div
                  key={product.id}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    gap: '14px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                    border: '1px solid #EDF2F7',
                    alignItems: 'center',
                  }}
                >
                  {/* 1+1 badge on product image */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                  {offerActive && (
                    <span style={{
                      position: 'absolute', top: '-6px', left: '-6px', zIndex: 2,
                      background: '#EAB308', color: '#1e293b',
                      fontSize: '0.62rem', fontWeight: '900',
                      padding: '2px 6px', borderRadius: '999px',
                      border: '1.5px solid #fff',
                      letterSpacing: '0.02em',
                      boxShadow: '0 2px 6px rgba(234,179,8,0.4)',
                    }}>1+1</span>
                  )}
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '12px',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '12px',
                        background: '#EDF2F7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#A0AEC0',
                      }}
                    >
                      <ShoppingBag size={24} />
                    </div>
                  )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: '700',
                        margin: '0 0 4px 0',
                      }}
                    >
                      {product.name}
                    </h3>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: '#718096',
                        margin: '0 0 10px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {product.description ||
                        'Freshly baked waffle served warm.'}
                    </p>
                    <span
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: '700',
                        color: '#1C5C3A',
                      }}
                    >
                      ₹{Number(product.price).toFixed(2)}
                    </span>
                  </div>

                  {/* Add / Qty Buttons */}
                  <div>
                    {qty > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          background: '#F7FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '24px',
                          padding: '4px',
                        }}
                      >
                        <button
                          onClick={() => removeFromCart(product.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            width: '28px',
                            height: '28px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#4A5568',
                          }}
                        >
                          -
                        </button>
                        <span
                          style={{
                            minWidth: '20px',
                            textAlign: 'center',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                          }}
                        >
                          {qty}
                        </span>
                        <button
                          onClick={() => addToCart(product.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            width: '28px',
                            height: '28px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#4A5568',
                          }}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product.id)}
                        style={{
                          background: '#EAB308',
                          color: '#1E293B',
                          border: 'none',
                          padding: '8px 20px',
                          borderRadius: '20px',
                          fontWeight: '700',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 10px rgba(234,179,8,0.2)',
                        }}
                      >
                        ADD
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky Bottom Cart Bar */}
      {totalQuantity > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            left: '16px',
            right: '16px',
            background: '#1C5C3A',
            borderRadius: '30px',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
            boxShadow: '0 10px 25px rgba(28,92,90,0.35)',
            cursor: 'pointer',
            zIndex: 100,
          }}
          onClick={() => setShowCheckout(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: '#EAB308',
                color: '#1E293B',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '0.85rem',
              }}
            >
              {totalQuantity}
            </span>
            <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
              View Cart
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {offerActive && offerResult.discountAmount > 0 && (
              <span style={{ fontSize: '0.75rem', textDecoration: 'line-through', opacity: 0.6 }}>₹{totalAmount.toFixed(2)}</span>
            )}
            <strong style={{ fontSize: '1.1rem' }}>
              ₹{finalTotal.toFixed(2)}
            </strong>
            <ChevronRight size={18} />
          </div>
        </div>
      )}

      {/* Checkout Sheet / Overlay */}
      {showCheckout && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-end',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'white',
              width: '100%',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <button
                onClick={() => setShowCheckout(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#64748B',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>
                Review Order
              </h2>
              <div style={{ width: '40px' }} /> {/* Spacer */}
            </div>

            {/* Cart Summary */}
            <div
              style={{
                background: '#F8FAFC',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              {cartItemsList.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #EDF2F7',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                      {item.name}
                    </span>
                    <span
                      style={{
                        color: '#718096',
                        fontSize: '0.85rem',
                        marginLeft: '8px',
                      }}
                    >
                      x{item.quantity}
                    </span>
                  </div>
                  <strong style={{ fontSize: '0.95rem' }}>
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </strong>
                </div>
              ))}
              {offerActive && offerResult.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.9rem', background: '#fef9c3', borderRadius: '8px', padding: '8px 10px' }}>
                  <span style={{ fontWeight: '700', color: '#92400e' }}>🎉 1+1 Saving ({offerResult.freeItems.length} free)</span>
                  <span style={{ fontWeight: '700', color: '#92400e' }}>-₹{offerResult.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '12px',
                  fontSize: '1.1rem',
                }}
              >
                <strong>Total Amount</strong>
                <div style={{ textAlign: 'right' }}>
                  {offerActive && offerResult.discountAmount > 0 && (
                    <div style={{ fontSize: '0.85rem', textDecoration: 'line-through', color: '#94a3b8' }}>₹{totalAmount.toFixed(2)}</div>
                  )}
                  <strong style={{ color: '#1C5C3A' }}>
                    ₹{finalTotal.toFixed(2)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Checkout Form */}
            <form onSubmit={handlePlaceOrder}>
              <div style={{ marginBottom: '24px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    color: '#4A5568',
                  }}
                >
                  Payment Method
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border:
                        paymentMethod === 'upi'
                          ? '2px solid #1C5C3A'
                          : '1px solid #CBD5E1',
                      background: paymentMethod === 'upi' ? '#F0FDF4' : 'white',
                      color: paymentMethod === 'upi' ? '#1C5C3A' : '#4A5568',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Pay Online (UPI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border:
                        paymentMethod === 'cash'
                          ? '2px solid #1C5C3A'
                          : '1px solid #CBD5E1',
                      background:
                        paymentMethod === 'cash' ? '#F0FDF4' : 'white',
                      color: paymentMethod === 'cash' ? '#1C5C3A' : '#4A5568',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Pay at Counter (Cash)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    color: '#4A5568',
                  }}
                >
                  Your Name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. John Doe"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    outline: 'none',
                    fontSize: '0.95rem',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  background: '#1C5C3A',
                  color: 'white',
                  border: 'none',
                  padding: '16px',
                  borderRadius: '30px',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 15px rgba(28,92,90,0.3)',
                  opacity: submitting ? 0.8 : 1,
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Processing Payment...
                  </>
                ) : paymentMethod === 'upi' ? (
                  `Pay & Place Order`
                ) : (
                  `Place Order (Pay Cash)`
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cashfree UPI QR Modal */}
      {upiQrPayment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.58)',
            zIndex: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              background: 'white',
              width: '100%',
              maxWidth: '420px',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              textAlign: 'center',
            }}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.3rem',
                color: '#1C5C3A',
              }}
            >
              Scan UPI QR to Pay
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#64748B' }}>
              Order #{upiQrPayment.orderId}
            </p>

            <div
              style={{
                background: '#F8FAFC',
                borderRadius: '16px',
                padding: '14px 16px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  color: '#64748B',
                  marginBottom: '4px',
                }}
              >
                Amount to Pay
              </div>
              <strong style={{ fontSize: '1.4rem', color: '#1C5C3A' }}>
                ₹{Number(upiQrPayment.amount || 0).toFixed(2)}
              </strong>
            </div>

            <div
              style={{
                minHeight: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                background: '#fff',
              }}
            >
              {upiQrLoading || !upiQrPayment.qrImageUrl ? (
                <div
                  style={{
                    color: '#64748B',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <Loader2 className="animate-spin" size={28} />
                  <span>Generating dynamic UPI QR code...</span>
                </div>
              ) : (
                <img
                  src={upiQrPayment.qrImageUrl}
                  alt="UPI QR code"
                  style={{
                    width: '200px',
                    height: '200px',
                    objectFit: 'contain',
                  }}
                />
              )}
            </div>

            <p
              style={{
                margin: '0 0 18px 0',
                color: '#0F766E',
                fontWeight: '600',
              }}
            >
              {upiQrStatus || 'Waiting for customer payment...'}
            </p>

            <button
              type="button"
              onClick={() => closeUpiQrPayment(true)}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '14px',
                border: '1px solid #CBD5E1',
                background: '#fff',
                color: '#475569',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Cancel Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;
