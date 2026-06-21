import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { getFirebaseDb } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { APP_CONFIG } from '../config';
import {
  ShoppingBag,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
  Plus,
  Minus,
  Trash2,
  Search,
} from 'lucide-react';
import useBarSettings from '../utils/useBarSettings';
import QRCode from 'qrcode';

const CustomerMenu = () => {
  const searchParams = useSearchParams()[0];
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'cart'
  const [searchTerm, setSearchTerm] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [upiQrPayment, setUpiQrPayment] = useState(null);
  const [upiQrStatus, setUpiQrStatus] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);
  const qrPollIntervalRef = useRef(null);
  const qrPaymentPromiseRef = useRef({ resolve: null, reject: null });

  // Checkout Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' or 'cash'
  const [submitting, setSubmitting] = useState(false);

  // Get table number state initialized from URL, e.g., ?table=T3. Default to "Parcel" if not present.
  const [tableNumber, setTableNumber] = useState(searchParams.get('table') || 'Parcel');

  useEffect(() => {
    const table = searchParams.get('table');
    if (table) {
      setTableNumber(table);
    }
  }, [searchParams]);

  // Initialize Firebase Firestore db using default config
  const db = useMemo(() => getFirebaseDb(), []);
  const { barSettings } = useBarSettings();

  const loadMenu = useCallback(async () => {
    if (!db) {
      // Firebase not configured yet
      setLoading(false);
      return;
    }
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

  // Category Emoji Mapping matching Kiosk POS screen
  const getCategoryEmoji = (category) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('waffle')) return '🧇';
    if (
      cat.includes('drink') ||
      cat.includes('beverage') ||
      cat.includes('shake')
    )
      return '🥤';
    if (cat.includes('ice') || cat.includes('desert') || cat.includes('sweet') || cat.includes('dessert'))
      return '🍨';
    if (cat.includes('burger') || cat.includes('food')) return '🍔';
    if (cat === 'all') return '🍽️';
    return '✨';
  };

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const nameMatch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const descMatch = (p.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const catMatch = (p.category || '').toLowerCase().includes(searchTerm.toLowerCase());
      return nameMatch || descMatch || catMatch;
    });
  }, [products, searchTerm]);

  // Group products by category
  const categories = useMemo(() => {
    const map = {};
    filteredProducts.forEach((p) => {
      const cat = p.category || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [filteredProducts]);

  const [activeCategory, setActiveCategory] = useState('');

  // Auto-select first category if empty or no longer matching search
  useEffect(() => {
    const keys = Object.keys(categories);
    if (keys.length > 0) {
      if (!activeCategory || !keys.includes(activeCategory)) {
        setActiveCategory(keys[0]);
      }
    } else {
      setActiveCategory('');
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
        copy[productId]--;
      }
      return copy;
    });
  };

  const deleteFromCart = (productId) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[productId];
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

  const totalQuantity = useMemo(() => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0);
  }, [cart]);

  // Go to menu view automatically if cart is emptied
  useEffect(() => {
    if (totalQuantity === 0 && activeTab === 'cart') {
      setActiveTab('menu');
    }
  }, [totalQuantity, activeTab]);

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

  // Razorpay UPI QR integration
  const startRazorpayPayment = async (orderNumber) => {
    const relayUrl = APP_CONFIG.whatsappRelayUrl;

    return new Promise((resolve, reject) => {
      qrPaymentPromiseRef.current = { resolve, reject };
      setUpiQrLoading(true);
      setUpiQrStatus('Generating UPI QR code...');
      setUpiQrPayment({
        orderId: orderNumber,
        amount: totalAmount,
        qrImageUrl: '',
      });

      fetch(`${relayUrl}/payment/create-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: totalAmount, orderId: orderNumber }),
      })
        .then((response) => response.json())
        .then(async (data) => {
          if (!data.success) {
            throw new Error(data.error || 'Failed to create UPI QR code.');
          }

          setUpiQrLoading(false);

          // Prefer a locally-generated direct UPI QR (upi://) when merchant VPA is available in settings.
          let qrImage = data.qrImageUrl;
          try {
            if (barSettings && barSettings.upi_vpa) {
              const upiUri = `upi://pay?pa=${encodeURIComponent(
                barSettings.upi_vpa
              )}&pn=${encodeURIComponent(barSettings.bar_name || '')}&am=${encodeURIComponent(
                Number(totalAmount).toFixed(2)
              )}&cu=INR&tn=${encodeURIComponent('Order ' + orderNumber)}`;
              qrImage = await QRCode.toDataURL(upiUri, {
                errorCorrectionLevel: 'M',
                margin: 2,
                scale: 6,
              });
            }
          } catch (qrErr) {
            console.error('Failed to generate local UPI QR:', qrErr);
            // fallback to server-provided QR image
            qrImage = data.qrImageUrl;
          }

          setUpiQrPayment({
            orderId: orderNumber,
            amount: totalAmount,
            qrImageUrl: qrImage,
            paymentLinkId: data.paymentLinkId || null,
          });
          setUpiQrStatus('Waiting for customer payment...');

          if (qrPollIntervalRef.current) {
            clearInterval(qrPollIntervalRef.current);
          }

          qrPollIntervalRef.current = setInterval(async () => {
            try {
              const statusResponse = await fetch(`${relayUrl}/payment/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  qrCodeId: data.qrCodeId || null,
                  paymentLinkId: data.paymentLinkId || null,
                }),
              });

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
              console.error('Error polling Razorpay QR status:', error);
            }
          }, 2000);
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
    if (!name.trim() || !phone.trim()) {
      alert('Please fill in your name and mobile number.');
      return;
    }

    setSubmitting(true);
    const orderNumber = `W-${Date.now().toString().slice(-6)}`;

    try {
      let payStatus = 'pending';

      if (paymentMethod === 'upi') {
        await startRazorpayPayment(orderNumber);
        payStatus = 'paid';
      }

      // Save order to Firestore
      const orderData = {
        orderNumber,
        customerName: name,
        customerPhone: phone,
        tableNumber,
        items: cartItemsList.map((item) => ({
          productId: String(item.id),
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        totalAmount,
        paymentMethod,
        paymentStatus: payStatus,
        orderStatus: 'pending_acceptance',
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'orders'), orderData);

      // Trigger automatic WhatsApp confirmation via Render backend
      try {
        const relayUrl = APP_CONFIG.whatsappRelayUrl;
        await fetch(`${relayUrl}/payment/send-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            name,
            orderNumber,
            tableNumber,
            totalAmount,
            paymentMethod,
            items: cartItemsList.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.price,
              totalPrice: item.price * item.quantity
            })),
            subtotal: totalAmount
          }),
        });
      } catch (waErr) {
        console.error('WhatsApp notification relay failed:', waErr);
      }

      // Reset cart and show success screen
      setCart({});
      setOrderSuccess(orderNumber);
      setActiveTab('menu');
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
          color: '#221f1a',
          background: '#f6f3ee',
        }}
      >
        <h2 style={{ fontWeight: '700', marginBottom: '8px', color: '#b6412c' }}>
          Store Connection Pending
        </h2>
        <p style={{ color: '#7f766a', textAlign: 'center', maxWidth: '360px', lineHeight: '1.6' }}>
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
          background: '#f6f3ee',
        }}
      >
        <Loader2
          className="animate-spin"
          size={48}
          style={{ color: '#b6412c' }}
        />
        <p
          style={{
            marginTop: '16px',
            color: '#7f766a',
            fontFamily: '"Outfit", sans-serif',
            fontWeight: '600',
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
          padding: '32px 24px',
          fontFamily: '"Outfit", sans-serif',
          background: '#b6412c',
          color: '#ffffff',
          textAlign: 'center',
        }}
      >
        <CheckCircle2
          size={84}
          style={{ color: '#f2e7db', marginBottom: '24px' }}
        />
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            marginBottom: '16px',
          }}
        >
          Order Placed!
        </h1>
        <p
          style={{
            fontSize: '1.15rem',
            opacity: 0.95,
            maxWidth: '380px',
            margin: '0 auto 28px auto',
            lineHeight: '1.7',
          }}
        >
          Thank you, <strong>{name}</strong>! Your order{' '}
          <strong>#{orderSuccess}</strong> has been received for{' '}
          <strong>Table {tableNumber}</strong>. We&apos;ve sent a confirmation
          receipt to your WhatsApp.
        </p>
        <div
          style={{
            background: 'rgba(255,255,255,0.12)',
            padding: '20px 28px',
            borderRadius: '16px',
            border: '1.5px solid rgba(255,255,255,0.2)',
            marginBottom: '40px',
          }}
        >
          <span
            style={{
              fontSize: '0.85rem',
              opacity: 0.8,
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              marginBottom: '6px',
            }}
          >
            Current Status
          </span>
          <strong style={{ fontSize: '1.3rem', color: '#f2e7db' }}>
            Preparing in Kitchen
          </strong>
        </div>
        <button
          onClick={() => setOrderSuccess(null)}
          style={{
            background: '#ffffff',
            color: '#b6412c',
            border: 'none',
            padding: '14px 36px',
            borderRadius: '28px',
            fontWeight: '700',
            fontSize: '1rem',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'transform 0.2s',
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
        color: '#221f1a',
        background: '#f6f3ee',
        minHeight: '100vh',
        paddingBottom: activeTab === 'menu' && totalQuantity > 0 ? '94px' : '24px',
      }}
    >
      {/* 2-PAGE LAYOUT SWITCHING */}

      {activeTab === 'menu' ? (
        <>
          {/* MENU SCREEN (Page 1) */}
          
          {/* Kiosk Brand Header */}
          <header
            style={{
              background: '#b6412c',
              color: '#ffffff',
              padding: '24px 20px',
              borderBottomLeftRadius: '24px',
              borderBottomRightRadius: '24px',
              position: 'sticky',
              top: 0,
              zIndex: 100,
              boxShadow: '0 6px 20px rgba(182,65,44,0.15)',
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
                    opacity: 0.9,
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    fontWeight: '700',
                  }}
                >
                  Malabar Waffle
                </span>
                <h1
                  style={{
                    fontSize: '1.65rem',
                    fontWeight: '700',
                    margin: '4px 0 0 0',
                  }}
                >
                  {tableNumber === 'Parcel' ? 'Parcel Order' : `Table ${tableNumber}`}
                </h1>
              </div>
              <Sparkles size={26} style={{ color: '#f2e7db' }} />
            </div>
          </header>

          {/* Search bar inside menu - replicating kiosk search style */}
          <div style={{ padding: '16px 16px 8px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#ffffff',
                border: '1.5px solid #e6ded3',
                borderRadius: '12px',
                padding: '8px 14px',
                gap: '10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.01)',
              }}
            >
              <Search size={18} style={{ color: '#b6412c', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search waffles, shakes, coffees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.95rem',
                  fontFamily: '"Outfit", sans-serif',
                  color: '#221f1a',
                  background: 'transparent',
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#7f766a',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Category Navigation Bar (Pills matching Kiosk POS) */}
          {Object.keys(categories).length > 0 ? (
            <div
              style={{
                overflowX: 'auto',
                display: 'flex',
                padding: '8px 16px 16px 16px',
                gap: '10px',
                position: 'sticky',
                top: '74px',
                background: '#f6f3ee',
                zIndex: 90,
                scrollbarWidth: 'none',
              }}
            >
              {Object.keys(categories).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '24px',
                    border: activeCategory === cat ? 'none' : '1.5px solid #e6ded3',
                    background: activeCategory === cat ? '#b6412c' : '#ffffff',
                    color: activeCategory === cat ? '#ffffff' : '#221f1a',
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    boxShadow:
                      activeCategory === cat
                        ? '0 6px 14px rgba(182,65,44,0.2)'
                        : '0 2px 4px rgba(0,0,0,0.01)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.25s',
                  }}
                >
                  <span>{getCategoryEmoji(cat)}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#7f766a' }}>
              <p>No matching categories or products found.</p>
            </div>
          )}

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
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        gap: '16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                        border: '1.5px solid #e6ded3',
                        alignItems: 'center',
                      }}
                    >
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          style={{
                            width: '84px',
                            height: '84px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '84px',
                            height: '84px',
                            borderRadius: '12px',
                            background: '#f2e7db',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#b6412c',
                          }}
                        >
                          <ShoppingBag size={26} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: '700',
                            margin: '0 0 6px 0',
                            color: '#221f1a',
                          }}
                        >
                          {product.name}
                        </h3>
                        <p
                          style={{
                            fontSize: '0.85rem',
                            color: '#7f766a',
                            margin: '0 0 10px 0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: '1.4',
                          }}
                        >
                          {product.description ||
                            'Freshly baked waffle served warm.'}
                        </p>
                        <span
                          style={{
                            fontSize: '1.1rem',
                            fontWeight: '700',
                            color: '#b6412c',
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
                              background: '#fbf7f4',
                              border: '1.5px solid #b6412c',
                              borderRadius: '24px',
                              padding: '4px',
                            }}
                          >
                            <button
                              onClick={() => removeFromCart(product.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                width: '30px',
                                height: '30px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                color: '#b6412c',
                                fontSize: '1.1rem',
                              }}
                            >
                              -
                            </button>
                            <span
                              style={{
                                minWidth: '22px',
                                textAlign: 'center',
                                fontWeight: '700',
                                fontSize: '0.95rem',
                                color: '#221f1a',
                              }}
                            >
                              {qty}
                            </span>
                            <button
                              onClick={() => addToCart(product.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                width: '30px',
                                height: '30px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                color: '#b6412c',
                                fontSize: '1.1rem',
                              }}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product.id)}
                            style={{
                              background: '#b6412c',
                              color: '#ffffff',
                              border: 'none',
                              padding: '10px 24px',
                              borderRadius: '22px',
                              fontWeight: '700',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              boxShadow: '0 4px 10px rgba(182,65,44,0.15)',
                              transition: 'transform 0.1s',
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

          {/* Sticky Bottom Cart Action Bar */}
          {totalQuantity > 0 && (
            <div
              style={{
                position: 'fixed',
                bottom: '16px',
                left: '16px',
                right: '16px',
                background: '#b6412c',
                borderRadius: '30px',
                padding: '16px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#ffffff',
                boxShadow: '0 10px 28px rgba(182,65,44,0.35)',
                cursor: 'pointer',
                zIndex: 100,
                transition: 'transform 0.2s',
              }}
              onClick={() => setActiveTab('cart')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    background: '#ffffff',
                    color: '#b6412c',
                    borderRadius: '50%',
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: '0.9rem',
                  }}
                >
                  {totalQuantity}
                </span>
                <span style={{ fontWeight: '700', fontSize: '1rem', letterSpacing: '0.5px' }}>
                  View Cart
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '1.2rem' }}>
                  ₹{totalAmount.toFixed(2)}
                </strong>
                <ChevronRight size={20} />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* CART & PAYMENT SCREEN (Page 2) */}

          {/* Header Row */}
          <header
            style={{
              background: '#b6412c',
              color: '#ffffff',
              padding: '20px 16px',
              borderBottomLeftRadius: '24px',
              borderBottomRightRadius: '24px',
              position: 'sticky',
              top: 0,
              zIndex: 100,
              boxShadow: '0 6px 20px rgba(182,65,44,0.15)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => setActiveTab('menu')}
              style={{
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              <ArrowLeft size={20} /> Menu
            </button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', margin: '0 auto', transform: 'translateX(-20px)' }}>
              Review Order
            </h2>
          </header>

          <main style={{ padding: '20px 16px' }}>
            {/* Interactive Cart Items List */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                marginBottom: '24px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '10px' }}>
                Selected Items ({totalQuantity})
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {cartItemsList.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: '12px',
                      borderBottom: '1px solid #f6f3ee',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.98rem', display: 'block', color: '#221f1a' }}>
                        {item.name}
                      </span>
                      <span style={{ color: '#b6412c', fontSize: '0.88rem', fontWeight: '600' }}>
                        ₹{item.price.toFixed(2)} each
                      </span>
                    </div>

                    {/* Quantity Controls inside Cart view */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          background: '#fbf7f4',
                          border: '1px solid #e6ded3',
                          borderRadius: '20px',
                          padding: '2px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            width: '26px',
                            height: '26px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#b6412c',
                            fontSize: '1rem',
                          }}
                        >
                          -
                        </button>
                        <span
                          style={{
                            minWidth: '18px',
                            textAlign: 'center',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            color: '#221f1a',
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => addToCart(item.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            width: '26px',
                            height: '26px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#b6412c',
                            fontSize: '1rem',
                          }}
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteFromCart(item.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#7f766a',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <strong style={{ fontSize: '1rem', marginLeft: '12px', minWidth: '70px', textAlign: 'right' }}>
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </strong>
                  </div>
                ))}
              </div>

              {/* Total Row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '16px',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  paddingTop: '6px',
                }}
              >
                <span>Grand Total</span>
                <span style={{ color: '#b6412c' }}>
                  ₹{totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkout Form */}
            <form onSubmit={handlePlaceOrder}>
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  padding: '20px',
                  marginBottom: '24px',
                  border: '1.5px solid #e6ded3',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '10px' }}>
                  Customer Information
                </h3>

                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: '700',
                      fontSize: '0.88rem',
                      color: '#7f766a',
                    }}
                  >
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. John Doe"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.95rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: '700',
                      fontSize: '0.88rem',
                      color: '#7f766a',
                    }}
                  >
                    WhatsApp Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="10-digit number for order updates"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.95rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: '700',
                      fontSize: '0.88rem',
                      color: '#7f766a',
                    }}
                  >
                    Table / Dining Option
                  </label>
                  <select
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.95rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                      background: '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Parcel">Parcel / Takeaway</option>
                    {[...Array(12)].map((_, i) => {
                      const tName = `T${i + 1}`;
                      return (
                        <option key={tName} value={tName}>
                          Table {tName}
                        </option>
                      );
                    })}
                    {tableNumber !== 'Parcel' && !/^T([1-9]|1[0-2])$/.test(tableNumber) && (
                      <option value={tableNumber}>{tableNumber}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Payment Method selection */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  padding: '20px',
                  marginBottom: '32px',
                  border: '1.5px solid #e6ded3',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '10px' }}>
                  Select Payment Method
                </h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('upi')}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '12px',
                      border:
                        paymentMethod === 'upi'
                          ? '2px solid #b6412c'
                          : '1.5px solid #e6ded3',
                      background: paymentMethod === 'upi' ? '#fbf7f4' : '#ffffff',
                      color: paymentMethod === 'upi' ? '#b6412c' : '#7f766a',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '0.92rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '1.4rem' }}>📱</span>
                    <span>Pay Online (UPI)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '12px',
                      border:
                        paymentMethod === 'cash'
                          ? '2px solid #b6412c'
                          : '1.5px solid #e6ded3',
                      background:
                        paymentMethod === 'cash' ? '#fbf7f4' : '#ffffff',
                      color: paymentMethod === 'cash' ? '#b6412c' : '#7f766a',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '0.92rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '1.4rem' }}>💵</span>
                    <span>Pay at Counter</span>
                  </button>
                </div>
              </div>

              {/* Submit Order Button */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  background: '#b6412c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '18px',
                  borderRadius: '30px',
                  fontSize: '1.15rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 20px rgba(182,65,44,0.3)',
                  opacity: submitting ? 0.8 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={22} />
                    Processing Payment...
                  </>
                ) : paymentMethod === 'upi' ? (
                  `Pay & Place Order`
                ) : (
                  `Place Order (Pay Cash)`
                )}
              </button>
            </form>
          </main>
        </>
      )}

      {/* Razorpay UPI QR Modal */}
      {upiQrPayment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(34,31,26,0.65)',
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
              background: '#ffffff',
              width: '100%',
              maxWidth: '400px',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
              textAlign: 'center',
              border: '1.5px solid #e6ded3',
            }}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: '1.35rem',
                color: '#b6412c',
                fontWeight: '700',
              }}
            >
              Scan Razorpay UPI QR
            </h3>
            <p style={{ margin: '0 0 18px 0', color: '#7f766a', fontWeight: '600' }}>
              Order ID: #{upiQrPayment.orderId}
            </p>

            <div
              style={{
                background: '#f6f3ee',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '20px',
                border: '1px solid #e6ded3',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  color: '#7f766a',
                  marginBottom: '4px',
                  fontWeight: '600',
                }}
              >
                Amount to Pay
              </div>
              <strong style={{ fontSize: '1.5rem', color: '#b6412c' }}>
                ₹{Number(upiQrPayment.amount || 0).toFixed(2)}
              </strong>
            </div>

            <div
              style={{
                minHeight: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                border: '1.5px solid #e6ded3',
                borderRadius: '16px',
                background: '#ffffff',
                padding: '10px',
              }}
            >
              {upiQrLoading || !upiQrPayment.qrImageUrl ? (
                <div
                  style={{
                    color: '#7f766a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    fontWeight: '600',
                  }}
                >
                  <Loader2 className="animate-spin" size={32} style={{ color: '#b6412c' }} />
                  <span>Generating dynamic UPI QR code...</span>
                </div>
              ) : (
                <img
                  src={upiQrPayment.qrImageUrl}
                  alt="Razorpay UPI QR code"
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
                margin: '0 0 20px 0',
                color: '#b6412c',
                fontWeight: '700',
                fontSize: '1.05rem',
              }}
            >
              {upiQrStatus || 'Waiting for customer payment...'}
            </p>

            <button
              type="button"
              onClick={() => closeUpiQrPayment(true)}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '24px',
                border: '1.5px solid #e6ded3',
                background: '#ffffff',
                color: '#221f1a',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'background-color 0.2s',
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
