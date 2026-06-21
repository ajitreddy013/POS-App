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
  query,
  where,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { APP_CONFIG } from '../config';
import {
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
  Plus,
  Minus,
  Trash2,
  Search,
  X,
  SlidersHorizontal,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import useBarSettings from '../utils/useBarSettings';
import QRCode from 'qrcode';
import malabarLogo from '../assets/malabar-waffle-logo.png';

const CustomerMenu = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'cart'
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [upiQrStatus, setUpiQrStatus] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);
  const searchInputRef = useRef(null);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 80;

  // Checkout Form State
  const [name, setName] = useState('Customer');
  const [phone, setPhone] = useState('');
  const [phoneWarning, setPhoneWarning] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);
  const phoneInputRef = useRef(null);

  const [tableNumber, setTableNumber] = useState('Parcel');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const db = useMemo(() => getFirebaseDb(), []);
  const { barSettings } = useBarSettings();

  const loadMenu = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const list = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.available !== false) list.push(data);
      });
      setProducts(list);
    } catch (err) {
      console.error('Failed to load products from cloud:', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    loadMenu();
    return () => {
      document.head.removeChild(link);
    };
  }, [loadMenu]);

  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    const orderIdParam = searchParams.get('orderId');
    if (paymentParam === 'success' && orderIdParam) {
      setOrderSuccess(orderIdParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0 && activeTab === 'menu' && !refreshing) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [activeTab, refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0 && window.scrollY === 0) {
      e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, 120));
    } else {
      setPullDistance(0);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      await loadMenu();
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, refreshing, loadMenu]);

  // Veg/Non-veg detection
  const isVeg = (product) => {
    const n = (product.name || '').toLowerCase();
    const d = (product.description || '').toLowerCase();
    const nonVegKeywords = ['chicken', 'mutton', 'fish', 'egg', 'meat', 'prawn', 'shrimp', 'beef', 'pork', 'lamb'];
    return !nonVegKeywords.some(kw => n.includes(kw) || d.includes(kw));
  };

  const formatCurrency = (amount) => `₹${Number(amount).toFixed(2)}`;

  // Filter & group products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const term = searchTerm.toLowerCase();
      return (p.name || '').toLowerCase().includes(term) ||
             (p.description || '').toLowerCase().includes(term) ||
             (p.category || '').toLowerCase().includes(term);
    });
  }, [products, searchTerm]);

  const groupedProducts = useMemo(() => {
    const map = {};
    filteredProducts.forEach((p) => {
      const cat = p.category || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [filteredProducts]);

  // Cart operations
  const addToCart = (productId) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[productId] <= 1) delete copy[productId];
      else copy[productId]--;
      return copy;
    });
  };

  const deleteFromCart = (productId) => {
    setCart((prev) => { const copy = { ...prev }; delete copy[productId]; return copy; });
  };

  const cartItemsList = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((p) => String(p.id) === id);
        return product ? { ...product, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const totalAmount = useMemo(() => cartItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartItemsList]);
  const totalQuantity = useMemo(() => Object.values(cart).reduce((sum, q) => sum + q, 0), [cart]);

  useEffect(() => {
    if (totalQuantity === 0 && activeTab === 'cart') setActiveTab('menu');
  }, [totalQuantity, activeTab]);

  // Category scroll
  const scrollToCategory = (catName) => {
    const el = document.getElementById(`cat-sec-${catName.replace(/\s+/g, '-')}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const handleSelectPaymentMethod = (method) => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!phone.trim() || cleanPhone.length < 10) {
      setPhoneWarning('Please enter a valid 10-digit WhatsApp number first!');
      setTimeout(() => setPhoneWarning(''), 3000);
      if (phoneInputRef.current) {
        phoneInputRef.current.focus();
      }
      return;
    }
    setPhoneWarning('');
    setPaymentMethod(method);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cartItemsList.length === 0) return;
    
    const cleanPhone = phone.replace(/\D/g, '');
    if (!phone.trim() || cleanPhone.length < 10) {
      setPhoneWarning('Please enter a valid 10-digit WhatsApp number!');
      setTimeout(() => setPhoneWarning(''), 3000);
      if (phoneInputRef.current) {
        phoneInputRef.current.focus();
      }
      return;
    }
    setPhoneWarning('');
    setSubmitting(true);

    // Generate sequential order number starting with W-
    let orderNumber = `W-${Date.now().toString().slice(-6)}`;
    try {
      const q = query(
        collection(db, 'orders'),
        where('orderNumber', '>=', 'W-'),
        where('orderNumber', '<=', 'W-\uf8ff')
      );
      const querySnapshot = await getDocs(q);
      const webCount = querySnapshot.size;
      orderNumber = `W-${webCount + 1}`;
    } catch (err) {
      console.error('Failed to generate sequential W- order number, falling back:', err);
    }

    try {
      if (paymentMethod === 'upi') {
        setUpiQrLoading(true);
        setUpiQrStatus('Initiating secure payment checkout...');

        // 1. Create order in Firestore as pending
        const orderData = {
          orderNumber, customerName: name, customerPhone: phone, tableNumber,
          items: cartItemsList.map((item) => ({ productId: String(item.id), name: item.name, quantity: item.quantity, unitPrice: item.price, totalPrice: item.price * item.quantity })),
          totalAmount,
          discountAmount: 0,
          paymentMethod, paymentStatus: 'pending', orderStatus: 'pending_acceptance', createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'orders'), orderData);

        // 2. Initiate Cashfree checkout session
        const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;

        const res = await fetch(`${relayUrl}/payment/cashfree/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: totalAmount, orderId: orderNumber, phone, name }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to generate payment session.');

        // 3. Clear cart locally
        setCart({});

        // 4. Determine checkout redirection based on device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile && data.upiLink) {
          // Listen to Firestore for payment success to show success page automatically
          const unsubscribe = onSnapshot(doc(db, 'orders', docRef.id), (snap) => {
            if (snap.exists()) {
              const currentData = snap.data();
              if (currentData.paymentStatus === 'paid') {
                unsubscribe();
                setUpiQrLoading(false);
                setUpiQrStatus('');
                setOrderSuccess(orderNumber);
                setActiveTab('menu');
              }
            }
          });

          // Show indicator and redirect to the UPI Intent deep link
          setUpiQrLoading(true);
          setUpiQrStatus('Redirecting to your UPI apps...');
          window.location.href = data.upiLink;

          // Provide manual update text in case user returns to browser
          setTimeout(() => {
            setUpiQrStatus('Waiting for payment confirmation. Please complete payment in your UPI app...');
          }, 3000);
        } else {
          // Initialize Cashfree SDK and launch hosted checkout
          if (!window.Cashfree) {
            throw new Error('Cashfree SDK is not loaded. Please try again.');
          }

          const cashfree = window.Cashfree({
            mode: data.environment || 'sandbox' // 'sandbox' or 'production'
          });

          await cashfree.checkout({
            paymentSessionId: data.paymentSessionId,
            redirectTarget: '_self'
          });
        }
      } else {
        // Cash payment
        const orderData = {
          orderNumber, customerName: name, customerPhone: phone, tableNumber,
          items: cartItemsList.map((item) => ({ productId: String(item.id), name: item.name, quantity: item.quantity, unitPrice: item.price, totalPrice: item.price * item.quantity })),
          totalAmount,
          discountAmount: 0,
          paymentMethod, paymentStatus: 'pending', orderStatus: 'pending_acceptance', createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'orders'), orderData);

        // Send WhatsApp confirmation
        try {
          const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
          await fetch(`${relayUrl}/payment/send-confirmation`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone,
              name,
              orderNumber,
              tableNumber,
              totalAmount,
              discountAmount: 0,
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
        } catch (waErr) { console.error('WhatsApp notification failed:', waErr); }

        setCart({});
        setOrderSuccess(orderNumber);
        setActiveTab('menu');
      }
    } catch (err) {
      console.error('Order submission failed:', err);
      alert(err.message || 'Failed to place order. Please try again.');
      setUpiQrLoading(false);
      setUpiQrStatus('');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RENDER: Connection pending ───
  if (!db) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', fontFamily: '"Outfit", sans-serif', color: '#221f1a', background: '#f6f3ee' }}>
        <h2 style={{ fontWeight: '700', marginBottom: '8px', color: '#b6412c' }}>Store Connection Pending</h2>
        <p style={{ color: '#7f766a', textAlign: 'center', maxWidth: '360px', lineHeight: '1.6' }}>This shop is not connected to the cloud yet.</p>
      </div>
    );
  }

  // ─── RENDER: Loading ───
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f6f3ee' }}>
        <Loader2 className="animate-spin" size={48} style={{ color: '#b6412c' }} />
        <p style={{ marginTop: '16px', color: '#7f766a', fontFamily: '"Outfit", sans-serif', fontWeight: '600' }}>Loading delicious waffles...</p>
      </div>
    );
  }

  // ─── RENDER: Order Success ───
  if (orderSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '32px 24px', fontFamily: '"Outfit", sans-serif', background: '#b6412c', color: '#ffffff', textAlign: 'center' }}>
        <CheckCircle2 size={84} className="success-icon-anim" style={{ color: '#f2e7db', marginBottom: '24px' }} />
        <h1 className="success-text-anim" style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '16px' }}>Order Placed!</h1>
        <p className="success-text-anim" style={{ fontSize: '1.15rem', opacity: 0.95, maxWidth: '380px', margin: '0 auto 28px auto', lineHeight: '1.7' }}>
          Thank you! Your order <strong>#{orderSuccess}</strong> has been received. We&apos;ve sent a confirmation receipt to your WhatsApp.
        </p>
        <div className="success-status-anim" style={{ background: 'rgba(255,255,255,0.12)', padding: '20px 28px', borderRadius: '16px', border: '1.5px solid rgba(255,255,255,0.2)', marginBottom: '40px' }}>
          <span style={{ fontSize: '0.85rem', opacity: 0.8, display: 'block', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Current Status</span>
          <strong style={{ fontSize: '1.3rem', color: '#f2e7db' }}>Preparing in Kitchen</strong>
        </div>
        <button className="success-button-anim" onClick={() => setOrderSuccess(null)} style={{ background: '#ffffff', color: '#b6412c', border: 'none', padding: '14px 36px', borderRadius: '28px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Order Something Else <Sparkles size={16} />
        </button>
      </div>
    );
  }

  // ─── RENDER: Main App ───
  return (
    <div
      style={{ fontFamily: '"Outfit", sans-serif', color: '#221f1a', background: '#f6f3ee', minHeight: '100vh', paddingBottom: '80px', position: 'relative' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >

      {activeTab === 'menu' ? (
        <>
          {/* ═══ PULL-TO-REFRESH INDICATOR ═══ */}
          {(pullDistance > 0 || refreshing) && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: refreshing ? '50px' : `${pullDistance}px`,
              overflow: 'hidden', transition: refreshing ? 'height 0.3s' : 'none',
            }}>
              <RefreshCw
                size={22}
                className={refreshing ? 'animate-spin' : ''}
                style={{
                  color: '#b6412c',
                  transform: `rotate(${pullDistance * 3}deg)`,
                  opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
                  transition: refreshing ? 'none' : 'transform 0.1s',
                }}
              />
            </div>
          )}

          {/* ═══ KIOSK HEADER: Logo + Name + Search ═══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 14px 12px', background: '#f6f3ee', borderBottom: '1px solid #e6ded3', position: 'sticky', top: 0, zIndex: 100 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
              <div style={{ height: '36px', width: '36px', borderRadius: '50%', flexShrink: 0 }}>
                <img src={malabarLogo} alt="Logo" draggable="false" style={{ height: '100%', width: '100%', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e6ded3', background: '#ffffff', pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#221f1a', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {barSettings?.bar_name || 'Malabar Waffle'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSearch((prev) => {
                    const next = !prev;
                    if (next) setTimeout(() => { if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true }); }, 80);
                    else setSearchTerm('');
                    return next;
                  });
                }}
                style={{ background: showSearch ? '#f2e7db' : '#ffffff', border: '1px solid #e6ded3', color: '#b6412c', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}
              >
                {showSearch ? <X size={16} /> : <Search size={16} />}
              </button>
            </div>

            {/* Expandable Search Bar */}
            {showSearch && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#ffffff',
                border: '1.5px solid',
                borderColor: isSearchFocused ? '#b6412c' : '#e6ded3',
                borderRadius: '999px',
                padding: '0 16px',
                height: '40px',
                gap: '8px',
                boxShadow: isSearchFocused ? '0 0 0 3px rgba(182, 65, 44, 0.08)' : 'none',
                transition: 'all 0.2s ease-in-out'
              }}>
                <Search size={16} style={{ color: '#b6412c', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="search-input-field"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: '#221f1a', fontSize: '0.85rem', width: '100%', padding: 0 }}
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} style={{ background: 'transparent', border: 'none', color: '#7f766a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ═══ PRODUCT LIST BY CATEGORY (Kiosk Style) ═══ */}
          <div style={{ paddingBottom: '20px' }}>
            {Object.entries(groupedProducts).map(([categoryName, items]) => (
              <div key={categoryName} id={`cat-sec-${categoryName.replace(/\s+/g, '-')}`} style={{ marginBottom: '16px' }}>
                {/* Category Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', padding: '12px 14px 8px', borderBottom: '1px solid #e6ded3' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#221f1a' }}>
                    {categoryName}
                  </h2>
                </div>

                {/* Product Rows */}
                <div>
                  {items.map((product) => {
                    const qty = cart[product.id] || 0;
                    return (
                      <div key={product.id} style={{ display: 'flex', padding: '14px', borderBottom: '1px dashed #e6ded3', gap: '15px' }}>
                        {/* Left: Name, Price, Veg Badge, Description */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: '700', color: '#221f1a' }}>
                            {product.name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#b6412c' }}>
                              {formatCurrency(product.price)}
                            </p>
                            {/* Veg/Non-Veg Badge */}
                            <div style={{ width: '14px', height: '14px', border: isVeg(product) ? '1.5px solid #1c8d3c' : '1.5px solid #b6412c', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px', flexShrink: 0 }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isVeg(product) ? '#1c8d3c' : '#b6412c' }} />
                            </div>
                          </div>
                          <p style={{ margin: '0 0 12px', fontSize: '0.75rem', fontWeight: '600', color: '#1C5C3A' }}>
                            {product.description || (product.name.toLowerCase().includes('waffle') ? 'Fresh & Delicious' : 'Fresh & Delicious')}
                          </p>
                        </div>

                        {/* Right: Product Image + Overlapping ADD Button */}
                        <div style={{ flexShrink: 0, position: 'relative' }}>
                          <div style={{ position: 'relative', width: '115px', height: '115px', borderRadius: '16px', overflow: 'visible', background: '#f2e7db' }}>
                            {product.image ? (
                              <img src={product.image} alt={product.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', background: '#fffdf8', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e6ded3' }} />
                            )}

                            {/* Overlapping ADD / Qty Button */}
                            <div style={{ position: 'absolute', bottom: '0', left: '50%', transform: 'translate(-50%, 50%)', zIndex: 10, width: '85%', display: 'flex', justifyContent: 'center' }}>
                              {qty > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #b6412c', borderRadius: '8px', height: '28px', width: '100%', justifyContent: 'space-between', padding: '0 4px', boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}>
                                  <button onClick={() => removeFromCart(product.id)} style={{ background: 'transparent', border: 'none', color: '#b6412c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
                                    <Minus size={12} />
                                  </button>
                                  <span style={{ color: '#b6412c', fontSize: '0.8rem', fontWeight: '700' }}>{qty}</span>
                                  <button onClick={() => addToCart(product.id)} style={{ background: 'transparent', border: 'none', color: '#b6412c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
                                    <Plus size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => addToCart(product.id)} style={{ background: '#ffffff', border: '1px solid #b6412c', color: '#b6412c', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '800', height: '28px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textTransform: 'uppercase', boxShadow: '0 4px 10px rgba(0,0,0,0.06)', gap: '2px' }}>
                                  ADD
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {Object.keys(groupedProducts).length === 0 && (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#7f766a' }}>
                <p>No matching products found.</p>
              </div>
            )}
          </div>

          {/* ═══ FLOATING BOTTOM BAR: Category + Cart ═══ */}
          <div style={{ position: 'fixed', bottom: '16px', left: '12px', right: '12px', display: 'flex', gap: '10px', zIndex: 100, alignItems: 'center' }}>
            {/* Category Button */}
            <button
              onClick={() => setShowCategoryPicker(prev => !prev)}
              style={{ background: '#1C5C3A', color: '#ffffff', border: 'none', borderRadius: '999px', padding: '12px 18px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.15)', flexShrink: 0 }}
            >
              <SlidersHorizontal size={16} />
              <span>Category</span>
            </button>

            {/* Cart Pill */}
            {totalQuantity > 0 && (
              <div
                onClick={() => setActiveTab('cart')}
                style={{ flex: 1, background: '#b6412c', borderRadius: '999px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#ffffff', boxShadow: '0 10px 28px rgba(182,65,44,0.35)', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingCart size={18} />
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                    {totalQuantity} | {formatCurrency(totalAmount)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>VIEW</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            )}
          </div>

          {/* ═══ CATEGORY PICKER POPUP ═══ */}
          {showCategoryPicker && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.15)',
                zIndex: 200,
              }}
              onClick={() => setShowCategoryPicker(false)}
            >
              <div
                style={{
                  position: 'fixed',
                  bottom: '76px',
                  left: '12px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e6ded3',
                  borderRadius: '16px',
                  padding: '12px',
                  width: '200px',
                  maxHeight: '320px',
                  overflowY: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 201,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    color: '#7f766a',
                    textTransform: 'uppercase',
                    padding: '4px 8px',
                  }}
                >
                  Categories
                </div>
                {Object.keys(groupedProducts).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      scrollToCategory(cat);
                      setShowCategoryPicker(false);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#221f1a',
                      textAlign: 'left',
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f6f3ee'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ═══ COMPACT CART & PAYMENT SCREEN (Page 2) ═══ */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 4px', gap: '8px', borderBottom: '1px solid #e6ded3', background: '#f6f3ee', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setActiveTab('menu')} style={{ border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: '4px', color: '#b6412c', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer', padding: 0 }}>
                <ChevronLeft size={18} /> Back
              </button>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#221f1a', margin: 0 }}>Review Order</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('menu');
                setShowSearch(true);
                setTimeout(() => {
                  if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
                }, 80);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#b6412c',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                outline: 'none',
              }}
            >
              <Search size={18} />
            </button>
          </div>

          <main style={{ padding: '8px 12px 16px' }}>
            {/* Customer Info */}
            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '12px', marginBottom: '12px', border: '1.5px solid #e6ded3', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '700', borderBottom: 'none', paddingBottom: '0' }}>WhatsApp Mobile Number</h3>
              <div style={{ marginTop: '10px' }}>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="e.g. 9876543210"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e6ded3', outline: 'none', fontSize: '0.88rem', fontFamily: '"Outfit", sans-serif', color: '#221f1a', boxSizing: 'border-box' }}
                />
                {phoneWarning && (
                  <div style={{
                    marginTop: '6px',
                    color: '#b6412c',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    animation: 'fadeIn 0.2s ease-out'
                  }}>
                    ⚠️ {phoneWarning}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Items */}
            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '12px', marginBottom: '12px', border: '1.5px solid #e6ded3', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '6px' }}>Selected Items ({totalQuantity})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {cartItemsList.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f6f3ee' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.9rem', display: 'block', color: '#221f1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                      <span style={{ color: '#b6412c', fontSize: '0.8rem', fontWeight: '600' }}>{formatCurrency(item.price)} each</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#fbf7f4', border: '1px solid #e6ded3', borderRadius: '20px', padding: '2px' }}>
                        <button type="button" onClick={() => removeFromCart(item.id)} style={{ border: 'none', background: 'transparent', width: '22px', height: '22px', fontWeight: '700', cursor: 'pointer', color: '#b6412c', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                        <span style={{ minWidth: '16px', textAlign: 'center', fontWeight: '700', fontSize: '0.8rem', color: '#221f1a' }}>{item.quantity}</span>
                        <button type="button" onClick={() => addToCart(item.id)} style={{ border: 'none', background: 'transparent', width: '22px', height: '22px', fontWeight: '700', cursor: 'pointer', color: '#b6412c', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                      </div>
                      <button type="button" onClick={() => deleteFromCart(item.id)} style={{ border: 'none', background: 'transparent', color: '#7f766a', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}><Trash2 size={16} /></button>
                    </div>
                    <strong style={{ fontSize: '0.9rem', marginLeft: '8px', minWidth: '60px', textAlign: 'right' }}>{formatCurrency(item.price * item.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '1.05rem', fontWeight: '700', paddingTop: '4px' }}>
                <span>Grand Total</span>
                <span style={{ color: '#b6412c' }}>{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            {/* Payment Method */}
            <form onSubmit={handlePlaceOrder}>
              <div style={{ background: '#ffffff', borderRadius: '16px', padding: '12px', marginBottom: '16px', border: '1.5px solid #e6ded3', boxShadow: '0 4px 10px rgba(0,0,0,0.01)' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '6px' }}>Select Payment Method</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button type="button" onClick={() => handleSelectPaymentMethod('upi')} style={{ padding: '10px 8px', borderRadius: '12px', border: paymentMethod === 'upi' ? '2px solid #b6412c' : '1.5px solid #e6ded3', background: paymentMethod === 'upi' ? '#fbf7f4' : '#ffffff', color: paymentMethod === 'upi' ? '#b6412c' : '#7f766a', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
                    <span style={{ fontSize: '1.2rem' }}>📱</span><span>Pay Online (UPI)</span>
                  </button>
                  <button type="button" onClick={() => handleSelectPaymentMethod('cash')} style={{ padding: '10px 8px', borderRadius: '12px', border: paymentMethod === 'cash' ? '2px solid #b6412c' : '1.5px solid #e6ded3', background: paymentMethod === 'cash' ? '#fbf7f4' : '#ffffff', color: paymentMethod === 'cash' ? '#b6412c' : '#7f766a', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
                    <span style={{ fontSize: '1.2rem' }}>💵</span><span>Pay at Counter</span>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting} style={{ width: '100%', background: '#b6412c', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '24px', fontSize: '0.98rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 6px 20px rgba(182,65,44,0.3)', opacity: submitting ? 0.8 : 1, transition: 'opacity 0.2s' }}>
                {submitting ? (<><Loader2 className="animate-spin" size={18} />Processing Payment...</>) : paymentMethod === 'upi' ? 'Pay & Place Order' : 'Place Order (Pay Cash)'}
              </button>
            </form>
          </main>
        </>
      )}

      {/* ═══ LOADER / TRANSITION OVERLAY ═══ */}
      {upiQrLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(34,31,26,0.65)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(6px)' }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '320px', borderRadius: '20px', padding: '32px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', textAlign: 'center', border: '1.5px solid #e6ded3', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader2 className="animate-spin" size={40} style={{ color: '#b6412c' }} />
            <strong style={{ fontSize: '1.1rem', color: '#221f1a' }}>{upiQrStatus || 'Processing Payment...'}</strong>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#7f766a' }}>Please do not close this window or press back.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;
