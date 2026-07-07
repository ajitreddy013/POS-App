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
  onSnapshot,
  doc,
  query,
  where,
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
import useBarSettings from '../hooks/useBarSettings';
import QRCode from 'qrcode';
import malabarLogo from '../assets/malabar-waffle-logo.png';

function isOfferActiveToday(barSettings) {
  if (!barSettings?.offer_enabled) return false;
  const dates = barSettings.offer_dates || [];
  if (dates.length === 0) return false;
  const istDate = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  return dates.includes(istDate.toISOString().slice(0, 10));
}

function calculateOfferDiscount(cartItems) {
  const flat = [];
  cartItems.forEach((item) => {
    for (let i = 0; i < item.quantity; i++)
      flat.push({ name: item.name, price: Number(item.price) });
  });
  flat.sort((a, b) => b.price - a.price);
  const freeCount = Math.floor(flat.length / 2);
  if (freeCount === 0) return { discountAmount: 0, freeItems: [] };
  const freeItems = flat.slice(flat.length - freeCount);
  return {
    discountAmount: freeItems.reduce((s, i) => s + i.price, 0),
    freeItems,
  };
}

function getSuccessOrderIdFromLocation() {
  const hashSearch = window.location.hash.split('?')[1] || '';
  const hashParams = new URLSearchParams(hashSearch);
  const hashOrderId =
    hashParams.get('payment') === 'success' && hashParams.get('orderId')
      ? hashParams.get('orderId')
      : null;

  if (hashOrderId) return hashOrderId;

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('payment') === 'success' &&
    searchParams.get('orderId')
    ? searchParams.get('orderId')
    : null;
}

const CustomerMenu = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'cart'
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(() => {
    // Read synchronously so the success screen renders on the very first paint,
    // before any useEffect or loadMenu runs — avoids the loading screen flash.
    return getSuccessOrderIdFromLocation();
  });
  const [upiQrStatus, setUpiQrStatus] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);
  const [upiQrCodeDataUrl, setUpiQrCodeDataUrl] = useState('');
  const [cfSessionId, setCfSessionId] = useState('');
  const [cfEnv, setCfEnv] = useState('');
  const searchInputRef = useRef(null);

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 80;

  // Checkout Form State
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const nameInputRef = useRef(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);

  const [tableNumber, setTableNumber] = useState('Website');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Delivery state
  const [orderType, setOrderType] = useState('dine_in'); // 'dine_in' | 'delivery'
  // Parcel — only relevant when orderType is 'dine_in'; ticked = takeaway w/ packing charge
  const [isParcel, setIsParcel] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    address: '',
    pincode: '',
    landmark: '',
  });
  const [addressWarning, setAddressWarning] = useState('');

  const db = useMemo(() => getFirebaseDb(), []);
  const { barSettings } = useBarSettings();

  const loadMenu = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const list = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.available !== false) list.push({ ...data, out_of_stock: data.out_of_stock || false });
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
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    // Skip loading the menu if we're showing the payment success screen
    if (!orderSuccess) {
      loadMenu();
    } else {
      setLoading(false);
    }
    return () => {
      document.head.removeChild(link);
    };
  }, [loadMenu, orderSuccess]);

  useEffect(() => {
    const orderIdParam = getSuccessOrderIdFromLocation();
    if (orderIdParam) {
      setOrderSuccess(orderIdParam);
      // Clear payment params from URL so a page refresh doesn't re-show the success screen
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, setSearchParams]);

  // While the payment webhook is still assigning the final W-N number, the
  // success screen only has the temporary ticket — watch the order doc so it
  // flips over live once the webhook writes the real orderNumber.
  useEffect(() => {
    if (!orderSuccess || !orderSuccess.startsWith('T-') || !db) return;
    const ticketQuery = query(
      collection(db, 'orders'),
      where('ticketId', '==', orderSuccess)
    );
    const unsubscribe = onSnapshot(ticketQuery, (snap) => {
      if (snap.empty) return;
      const liveOrderNumber = snap.docs[0].data().orderNumber;
      if (liveOrderNumber && !liveOrderNumber.startsWith('T-')) {
        setOrderSuccess(liveOrderNumber);
      }
    });
    return () => unsubscribe();
  }, [orderSuccess, db]);

  useEffect(() => {
    const tableParam = searchParams.get('table');
    if (tableParam) {
      setTableNumber(tableParam);
    }
  }, [searchParams]);

  // Pull-to-refresh handlers
  const handleTouchStart = useCallback(
    (e) => {
      if (window.scrollY === 0 && activeTab === 'menu' && !refreshing) {
        touchStartY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    },
    [activeTab, refreshing]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!isPulling.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;
      if (diff > 0 && window.scrollY === 0) {
        e.preventDefault();
        setPullDistance(Math.min(diff * 0.5, 120));
      } else {
        setPullDistance(0);
      }
    },
    [refreshing]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      window.location.reload();
      return;
    }
    setPullDistance(0);
  }, [pullDistance, refreshing]);

  // React's onTouchMove is passive by default — e.preventDefault() is silently ignored there.
  // Attach manually with { passive: false } so we can block native scroll during pull.
  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', handleTouchMove);
  }, [handleTouchMove]);

  // Veg/Non-veg detection
  const isVeg = (product) => {
    if (product.dietary_type) {
      return product.dietary_type === 'veg';
    }
    const n = (product.name || '').toLowerCase();
    const d = (product.description || '').toLowerCase();
    const nonVegKeywords = [
      'chicken',
      'mutton',
      'fish',
      'egg',
      'meat',
      'prawn',
      'shrimp',
      'beef',
      'pork',
      'lamb',
    ];
    return !nonVegKeywords.some((kw) => n.includes(kw) || d.includes(kw));
  };

  const formatCurrency = (amount) => `₹${Number(amount).toFixed(2)}`;

  // Filter & group products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const term = searchTerm.toLowerCase();
      return (
        (p.name || '').toLowerCase().includes(term) ||
        (p.description || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
      );
    });
  }, [products, searchTerm]);

  const groupedProducts = useMemo(() => {
    const map = {};
    filteredProducts.forEach((p) => {
      const cat = p.category || 'General';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    Object.values(map).forEach((items) =>
      items.sort((a, b) => Number(a.price) - Number(b.price))
    );
    return map;
  }, [filteredProducts]);

  const fmt12h = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const checkDeliveryOpen = (settings) => {
    const start = settings?.delivery_start_time;
    const end = settings?.delivery_end_time;
    if (!start || !end) return true;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (startMins > endMins) {
      // overnight range e.g. 4 PM – 7 AM: open if after start OR before end
      return nowMins >= startMins || nowMins < endMins;
    }
    return nowMins >= startMins && nowMins < endMins;
  };

  const [deliveryOpen, setDeliveryOpen] = useState(() => checkDeliveryOpen(barSettings));

  useEffect(() => {
    setDeliveryOpen(checkDeliveryOpen(barSettings));
    const interval = setInterval(() => setDeliveryOpen(checkDeliveryOpen(barSettings)), 30000);
    return () => clearInterval(interval);
  }, [barSettings?.delivery_start_time, barSettings?.delivery_end_time]);

  const offerActive = useMemo(
    () => isOfferActiveToday(barSettings),
    [barSettings]
  );

  const cartItemsList = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = products.find((p) => String(p.id) === id);
        return product ? { ...product, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, products]);

  const totalAmount = useMemo(
    () =>
      cartItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItemsList]
  );
  const totalQuantity = useMemo(
    () => Object.values(cart).reduce((sum, q) => sum + q, 0),
    [cart]
  );

  const offerResult = useMemo(() => {
    if (!offerActive || cartItemsList.length === 0)
      return { discountAmount: 0, freeItems: [] };
    return calculateOfferDiscount(cartItemsList);
  }, [offerActive, cartItemsList]);

  const isOfferCartOdd = useMemo(() => {
    if (!offerActive) return false;
    return totalQuantity % 2 !== 0;
  }, [offerActive, totalQuantity]);

  const offerAddMoreCount = useMemo(() => {
    if (!isOfferCartOdd) return 0;
    return (totalQuantity + 1) / 2;
  }, [isOfferCartOdd, totalQuantity]);

  // Cart operations
  const addToCart = (productId) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => {
      const copy = { ...prev };
      if ((copy[productId] || 0) <= 1) delete copy[productId];
      else copy[productId] -= 1;
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

  const DELIVERY_FEE = barSettings?.delivery_fee ?? 30;
  const DELIVERY_FREE_ABOVE = barSettings?.delivery_free_above ?? 300;
  const PARCEL_CHARGE = barSettings?.parcel_charge ?? 10;

  const deliveryFeeAmount = useMemo(() => {
    if (orderType !== 'delivery') return 0;
    return totalAmount >= DELIVERY_FREE_ABOVE ? 0 : DELIVERY_FEE;
  }, [orderType, totalAmount, DELIVERY_FEE, DELIVERY_FREE_ABOVE]);

  const parcelChargeAmount = useMemo(() => {
    return orderType !== 'delivery' && isParcel ? PARCEL_CHARGE : 0;
  }, [orderType, isParcel, PARCEL_CHARGE]);

  const finalOrderType = orderType === 'delivery' ? 'delivery' : (isParcel ? 'parcel' : 'dine_in');

  const finalTotal = useMemo(
    () =>
      Math.max(0, totalAmount + deliveryFeeAmount + parcelChargeAmount - offerResult.discountAmount),
    [totalAmount, deliveryFeeAmount, parcelChargeAmount, offerResult]
  );

  useEffect(() => {
    if (totalQuantity === 0 && activeTab === 'cart') {
      setActiveTab('menu');
      // Replace the cart history entry so back button doesn't re-enter cart
      window.history.replaceState({ appTab: 'menu' }, '');
    }
  }, [totalQuantity, activeTab]);

  // Push a history entry when entering cart so browser back returns to menu
  const pendingSearchAfterBack = useRef(false);

  const goToCart = () => {
    window.history.pushState({ appTab: 'cart' }, '');
    setActiveTab('cart');
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab('menu');
      if (pendingSearchAfterBack.current) {
        pendingSearchAfterBack.current = false;
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 80);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Category scroll
  const scrollToCategory = (catName) => {
    const el = document.getElementById(
      `cat-sec-${catName.replace(/\s+/g, '-')}`
    );
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const handleSelectPaymentMethod = (method) => {
    if (isOfferCartOdd) return;
    setPaymentMethod(method);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (cartItemsList.length === 0) return;
    if (isOfferCartOdd) return;

    if (!name.trim()) {
      setNameError(true);
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInputRef.current?.focus();
      return;
    }

    if (orderType === 'delivery') {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        setPhoneError(true);
        return;
      }
      if (!deliveryAddress.address.trim() || !deliveryAddress.pincode.trim()) {
        setAddressWarning('Please fill in your street address and pincode.');
        setTimeout(() => setAddressWarning(''), 4000);
        return;
      }
      if (!/^\d{6}$/.test(deliveryAddress.pincode.trim())) {
        setAddressWarning('Pincode must be exactly 6 digits.');
        setTimeout(() => setAddressWarning(''), 4000);
        return;
      }
    }
    setAddressWarning('');
    setSubmitting(true);

    try {
      if (paymentMethod === 'upi') {
        // ── UPI PAYMENT: Save order → get Cashfree link → redirect ──
        // The real sequential W-N number is only assigned once the Cashfree
        // webhook confirms payment (see relay's PAYMENT_SUCCESS_WEBHOOK
        // handler) — this avoids burning a bill number on abandoned/never-
        // paid checkouts. Use a throwaway ticket until then.
        const orderNumber = `T-${Date.now()}`;
        setUpiQrStatus('Creating your order...');

        // 1. Save order to Firestore (pending)
        const orderData = {
          orderNumber,
          ticketId: orderNumber,
          source: 'web',
          customerName: name,
          customerPhone: phone || '9999999999',
          tableNumber,
          items: cartItemsList.map((item) => ({
            productId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          })),
          subtotal: totalAmount,
          deliveryFee: deliveryFeeAmount,
          parcelCharge: parcelChargeAmount,
          totalAmount: finalTotal,
          discountAmount: offerResult.discountAmount,
          orderType: finalOrderType,
          ...(orderType === 'delivery' && { deliveryAddress }),
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'awaiting_payment',
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'orders'), orderData);

        // 2. Get Cashfree payment link from backend
        const relayUrl = APP_CONFIG.relayUrl;
        // Hash-based URL so HashRouter's useSearchParams can read the params on return
        const returnUrl = `${window.location.origin}/?payment=success&orderId=${orderNumber}`;
        const res = await fetch(`${relayUrl}/payment/cashfree/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: finalTotal,
            orderId: orderNumber,
            phone: phone || '9999999999',
            name,
            returnUrl,
          }),
        });
        const data = await res.json();
        if (!data.success)
          throw new Error(
            data.error || 'Failed to create payment. Please try again.'
          );

        // 3. Clear cart locally
        setCart({});

        // 4. Initialize Cashfree SDK and launch hosted checkout
        if (window.Cashfree) {
          try {
            const cashfree = window.Cashfree({
              mode: data.environment || 'sandbox',
            });
            // WhatsApp is sent by the Cashfree webhook on the relay — do NOT save here
            await cashfree.checkout({
              paymentSessionId: data.paymentSessionId,
              redirectTarget: '_self',
            });
            console.log('Successfully launched Cashfree SDK checkout.');
          } catch (sdkErr) {
            console.warn(
              'Cashfree SDK checkout failed, falling back to direct URL redirection:',
              sdkErr
            );
            if (!data.paymentLink)
              throw new Error(
                'No payment link received from server. Please try again.'
              );
            window.location.href = data.paymentLink;
          }
        } else {
          console.warn(
            'Cashfree SDK not loaded, falling back to direct URL redirection.'
          );
          if (!data.paymentLink)
            throw new Error(
              'No payment link received from server. Please try again.'
            );
          // WhatsApp is sent by the Cashfree webhook on the relay — do NOT save here
          window.location.href = data.paymentLink;
        }
      } else {
        // Cash / COD payment — number reserved via relay (Admin SDK) so it
        // never races with the UPI webhook transaction on the same counter.
        let orderNumber = `W-${Date.now().toString().slice(-5)}`;
        try {
          const numRes = await fetch(`${APP_CONFIG.relayUrl}/order/reserve-number`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: 'W' }),
          });
          const numData = await numRes.json();
          if (numData.success && numData.orderNumber) {
            orderNumber = numData.orderNumber;
          }
        } catch (err) {
          console.error('Failed to reserve web order number:', err);
        }

        const orderData = {
          orderNumber,
          ticketId: orderNumber,
          source: 'web',
          customerName: name,
          customerPhone: phone || '9999999999',
          tableNumber,
          items: cartItemsList.map((item) => ({
            productId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          })),
          subtotal: totalAmount,
          deliveryFee: deliveryFeeAmount,
          parcelCharge: parcelChargeAmount,
          totalAmount: finalTotal,
          discountAmount: offerResult.discountAmount,
          orderType: finalOrderType,
          ...(orderType === 'delivery' && { deliveryAddress }),
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: 'completed',
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'orders'), orderData);

        setCart({});
        setIsParcel(false);
        setOrderSuccess(orderNumber);
        setActiveTab('menu');
        window.history.replaceState({ appTab: 'menu' }, '');
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
        <h2
          style={{ fontWeight: '700', marginBottom: '8px', color: '#b6412c' }}
        >
          Store Connection Pending
        </h2>
        <p
          style={{
            color: '#7f766a',
            textAlign: 'center',
            maxWidth: '360px',
            lineHeight: '1.6',
          }}
        >
          This shop is not connected to the cloud yet.
        </p>
      </div>
    );
  }

  // ─── RENDER: Order Success (checked before loading so payment return skips the loading screen) ───
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
          className="success-icon-anim"
          style={{ color: '#f2e7db', marginBottom: '24px' }}
        />
        <h1
          className="success-text-anim"
          style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            marginBottom: '16px',
          }}
        >
          Order Placed!
        </h1>
        <p
          className="success-text-anim"
          style={{
            fontSize: '1.15rem',
            opacity: 0.95,
            maxWidth: '380px',
            margin: '0 auto 28px auto',
            lineHeight: '1.7',
          }}
        >
          Thank you! Your order{' '}
          <strong>
            #{orderSuccess.startsWith('T-') ? 'confirming…' : orderSuccess}
          </strong>{' '}
          has been received.
        </p>
        <div
          className="success-status-anim"
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
            {orderType === 'delivery'
              ? '🛵 Out for Delivery Soon!'
              : 'Preparing in Kitchen'}
          </strong>
        </div>
        <button
          className="success-button-anim"
          onClick={() => {
            setOrderSuccess(null);
            setIsParcel(false);
            window.history.replaceState({}, '', window.location.pathname);
          }}
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
          }}
        >
          Order Something Else <Sparkles size={16} />
        </button>
      </div>
    );
  }

  // ─── RENDER: Loading ───
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

  // ─── RENDER: Main App ───
  return (
    <div
      style={{
        fontFamily: '"Outfit", sans-serif',
        color: '#221f1a',
        background: '#f6f3ee',
        minHeight: '100vh',
        paddingBottom: '80px',
        position: 'relative',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {activeTab === 'menu' ? (
        <>
          {/* ═══ PULL-TO-REFRESH INDICATOR ═══ */}
          {(pullDistance > 0 || refreshing) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: refreshing ? '50px' : `${pullDistance}px`,
                overflow: 'hidden',
                transition: refreshing ? 'height 0.3s' : 'none',
              }}
            >
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '16px 14px 12px',
              background: '#f6f3ee',
              borderBottom: '1px solid #e6ded3',
              position: 'sticky',
              top: 0,
              zIndex: 100,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
              }}
            >
              <div
                style={{
                  height: '36px',
                  width: '36px',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              >
                <img
                  src={malabarLogo}
                  alt="Logo"
                  draggable="false"
                  style={{
                    height: '100%',
                    width: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '1.5px solid #e6ded3',
                    background: '#ffffff',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: '800',
                    color: '#221f1a',
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {barSettings?.bar_name || 'Malabar Waffle'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSearch((prev) => {
                    const next = !prev;
                    if (next)
                      setTimeout(() => {
                        if (searchInputRef.current)
                          searchInputRef.current.focus({ preventScroll: true });
                      }, 80);
                    else setSearchTerm('');
                    return next;
                  });
                }}
                style={{
                  background: showSearch ? '#f2e7db' : '#ffffff',
                  border: '1px solid #e6ded3',
                  color: '#b6412c',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                }}
              >
                {showSearch ? <X size={16} /> : <Search size={16} />}
              </button>
            </div>

            {/* Expandable Search Bar */}
            {showSearch && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#ffffff',
                  border: '1.5px solid',
                  borderColor: isSearchFocused ? '#b6412c' : '#e6ded3',
                  borderRadius: '999px',
                  padding: '0 16px',
                  height: '40px',
                  gap: '8px',
                  boxShadow: isSearchFocused
                    ? '0 0 0 3px rgba(182, 65, 44, 0.08)'
                    : 'none',
                  transition: 'all 0.2s ease-in-out',
                }}
              >
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
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#221f1a',
                    fontSize: '0.85rem',
                    width: '100%',
                    padding: 0,
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7f766a',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ═══ 1+1 OFFER BANNER ═══ */}
          {offerActive && (
            <div
              style={{
                margin: '10px 14px 0',
                background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)',
                border: '1.5px solid #fde68a',
                borderRadius: '14px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>🎉</span>
              <p
                style={{
                  margin: 0,
                  fontWeight: '800',
                  fontSize: '0.9rem',
                  color: '#92400e',
                }}
              >
                1+1 Offer Active Today!
              </p>
            </div>
          )}

          {/* ═══ PRODUCT LIST BY CATEGORY (Kiosk Style) ═══ */}
          <div style={{ paddingBottom: '20px' }}>
            {Object.entries(groupedProducts).map(([categoryName, items]) => (
              <div
                key={categoryName}
                id={`cat-sec-${categoryName.replace(/\s+/g, '-')}`}
                style={{ marginBottom: '16px' }}
              >
                {/* Category Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px 8px',
                    borderBottom: '1px solid #e6ded3',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.1rem',
                      fontWeight: '800',
                      color: '#221f1a',
                    }}
                  >
                    {categoryName}
                  </h2>
                </div>

                {/* Product Rows */}
                <div>
                  {items.map((product) => {
                    const qty = cart[product.id] || 0;
                    const isOutOfStock = product.out_of_stock === true;
                    return (
                      <div
                        key={product.id}
                        style={{
                          display: 'flex',
                          padding: '14px',
                          borderBottom: '1px dashed #e6ded3',
                          gap: '15px',
                          opacity: isOutOfStock ? 0.6 : 1,
                        }}
                      >
                        {/* Left: Name, Price, Veg Badge, Description */}
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <h3
                            style={{
                              margin: '0 0 6px',
                              fontSize: '0.95rem',
                              fontWeight: '700',
                              color: '#221f1a',
                            }}
                          >
                            {product.name}
                          </h3>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              margin: '0 0 6px',
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: '0.9rem',
                                fontWeight: '800',
                                color: '#b6412c',
                              }}
                            >
                              {formatCurrency(product.price)}
                            </p>
                            {/* Veg/Non-Veg Badge */}
                            <div
                              style={{
                                width: '14px',
                                height: '14px',
                                border: isVeg(product)
                                  ? '1.5px solid #1c8d3c'
                                  : '1.5px solid #b6412c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '2px',
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: isVeg(product)
                                    ? '#1c8d3c'
                                    : '#b6412c',
                                }}
                              />
                            </div>
                          </div>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              color: '#1C5C3A',
                            }}
                          >
                            {product.description ||
                              (product.name.toLowerCase().includes('waffle')
                                ? 'Fresh & Delicious'
                                : 'Fresh & Delicious')}
                          </p>
                        </div>

                        {/* Right: Product Image + Overlapping ADD Button */}
                        <div style={{ flexShrink: 0, position: 'relative' }}>
                          <div
                            style={{
                              position: 'relative',
                              width: '115px',
                              height: '115px',
                              borderRadius: '16px',
                              overflow: 'visible',
                              background: '#f2e7db',
                            }}
                          >
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                loading="lazy"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  borderRadius: '16px',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  background: '#fffdf8',
                                  borderRadius: '16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid #e6ded3',
                                }}
                              />
                            )}

                            {/* Out of Stock overlay on image */}
                            {isOutOfStock && (
                              <div style={{
                                position: 'absolute', inset: 0, borderRadius: '16px',
                                background: 'rgba(255,255,255,0.55)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span style={{ background: '#dc2626', color: '#fff', fontSize: '0.6rem', fontWeight: '800', padding: '3px 7px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Out of Stock
                                </span>
                              </div>
                            )}

                            {/* Overlapping ADD / Qty Button */}
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '0',
                                left: '50%',
                                transform: 'translate(-50%, 50%)',
                                zIndex: 10,
                                width: '85%',
                                display: 'flex',
                                justifyContent: 'center',
                              }}
                            >
                              {qty > 0 && !isOutOfStock ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #b6412c',
                                    borderRadius: '8px',
                                    height: '28px',
                                    width: '100%',
                                    justifyContent: 'space-between',
                                    padding: '0 4px',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                                  }}
                                >
                                  <button
                                    onClick={() => removeFromCart(product.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#b6412c',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '2px',
                                    }}
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span
                                    style={{
                                      color: '#b6412c',
                                      fontSize: '0.8rem',
                                      fontWeight: '700',
                                    }}
                                  >
                                    {qty}
                                  </span>
                                  <button
                                    onClick={() => addToCart(product.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#b6412c',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '2px',
                                    }}
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              ) : isOutOfStock ? (
                                <button
                                  disabled
                                  style={{
                                    background: '#f3f4f6',
                                    border: '1px solid #d1d5db',
                                    color: '#9ca3af',
                                    borderRadius: '8px',
                                    fontSize: '0.65rem',
                                    fontWeight: '800',
                                    height: '28px',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'not-allowed',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  Out of Stock
                                </button>
                              ) : (
                                <button
                                  onClick={() => addToCart(product.id)}
                                  style={{
                                    background: '#ffffff',
                                    border: '1px solid #b6412c',
                                    color: '#b6412c',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    height: '28px',
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
                                    gap: '2px',
                                  }}
                                >
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
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: '#7f766a',
                }}
              >
                <p>No matching products found.</p>
              </div>
            )}
          </div>

          {/* ═══ FLOATING BOTTOM BAR: Category + Cart ═══ */}
          <div
            style={{
              position: 'fixed',
              bottom: '16px',
              left: '12px',
              right: '12px',
              display: 'flex',
              gap: '10px',
              zIndex: 100,
              alignItems: 'center',
            }}
          >
            {/* Category Button */}
            <button
              onClick={() => setShowCategoryPicker((prev) => !prev)}
              style={{
                background: '#1C5C3A',
                color: '#ffffff',
                border: 'none',
                borderRadius: '999px',
                padding: '12px 18px',
                fontWeight: '700',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                flexShrink: 0,
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Category</span>
            </button>

            {/* Cart Pill */}
            {totalQuantity > 0 && (
              <div
                onClick={goToCart}
                style={{
                  flex: 1,
                  background:
                    offerActive && isOfferCartOdd ? '#d97706' : '#b6412c',
                  borderRadius: '999px',
                  padding: '12px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: '#ffffff',
                  boxShadow:
                    offerActive && isOfferCartOdd
                      ? '0 10px 28px rgba(217,119,6,0.35)'
                      : '0 10px 28px rgba(182,65,44,0.35)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <ShoppingCart size={18} />
                  <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                    {offerActive && isOfferCartOdd
                      ? `➕ Add 1 more item!`
                      : `${totalQuantity} | ${formatCurrency(totalAmount)}`}
                  </span>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                    VIEW
                  </span>
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f6f3ee';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px 4px',
              gap: '8px',
              borderBottom: '1px solid #e6ded3',
              background: '#f6f3ee',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => window.history.back()}
                style={{
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#b6412c',
                  fontWeight: '700',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <ChevronLeft size={18} /> Back
              </button>
              <h2
                style={{
                  fontSize: '1.05rem',
                  fontWeight: '800',
                  color: '#221f1a',
                  margin: 0,
                }}
              >
                Review Order
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                pendingSearchAfterBack.current = true;
                window.history.back();
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
            {/* Delivery open/closed status — shown when Home Delivery is selected */}
            {barSettings?.delivery_enabled && orderType === 'delivery' && (
              <div style={{
                background: deliveryOpen ? '#f0fdf4' : '#fef9ec',
                border: `1px solid ${deliveryOpen ? '#bbf7d0' : '#fde68a'}`,
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                color: deliveryOpen ? '#166534' : '#92400e',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
              }}>
                🛵{' '}
                {deliveryOpen
                  ? `Delivery Open · ${fmt12h(barSettings.delivery_start_time)} – ${fmt12h(barSettings.delivery_end_time)} · Within 2 km radius`
                  : `Delivery Closed · Available ${fmt12h(barSettings.delivery_start_time)} – ${fmt12h(barSettings.delivery_end_time)} · Within 2 km radius`}
              </div>
            )}

            {/* Order Type Selector — only show if delivery is enabled in settings */}
            {barSettings?.delivery_enabled && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '1.5px solid #e6ded3',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                }}
              >
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: '700' }}>
                    Order Type
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => { setOrderType('dine_in'); setAddressWarning(''); }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '12px',
                        border: orderType === 'dine_in' ? '2px solid #b6412c' : '1.5px solid #e6ded3',
                        background: orderType === 'dine_in' ? '#fbf7f4' : '#ffffff',
                        color: orderType === 'dine_in' ? '#b6412c' : '#7f766a',
                        fontWeight: '700',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                    >
                      <span>Dine In / Pickup</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOrderType('delivery'); setIsParcel(false); setAddressWarning(''); }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '12px',
                        border: orderType === 'delivery' ? '2px solid #b6412c' : '1.5px solid #e6ded3',
                        background: orderType === 'delivery' ? '#fbf7f4' : '#ffffff',
                        color: orderType === 'delivery' ? '#b6412c' : '#7f766a',
                        fontWeight: '700',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                    >
                      <span>Home Delivery</span>
                    </button>
                  </div>
              </div>
            )}

            {/* Delivery Address Form */}
            {orderType === 'delivery' && barSettings?.delivery_enabled && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '1.5px solid #e6ded3',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 10px 0',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                  }}
                >
                  Delivery Address
                </h3>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <input
                    type="text"
                    value={deliveryAddress.address}
                    disabled={!deliveryOpen}
                    onChange={(e) =>
                      setDeliveryAddress((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    placeholder="Street address, building, floor *"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.88rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                      boxSizing: 'border-box',
                      background: deliveryOpen ? '#fff' : '#f5f5f5',
                    }}
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    value={deliveryAddress.pincode}
                    disabled={!deliveryOpen}
                    onChange={(e) =>
                      setDeliveryAddress((prev) => ({
                        ...prev,
                        pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    placeholder="Pincode * (6 digits)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.88rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                      boxSizing: 'border-box',
                      background: deliveryOpen ? '#fff' : '#f5f5f5',
                    }}
                  />
                  <input
                    type="text"
                    value={deliveryAddress.landmark}
                    disabled={!deliveryOpen}
                    onChange={(e) =>
                      setDeliveryAddress((prev) => ({
                        ...prev,
                        landmark: e.target.value,
                      }))
                    }
                    placeholder="Landmark (optional)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #e6ded3',
                      outline: 'none',
                      fontSize: '0.88rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                      boxSizing: 'border-box',
                      background: deliveryOpen ? '#fff' : '#f5f5f5',
                    }}
                  />
                  {addressWarning && (
                    <div
                      style={{
                        color: '#b6412c',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      ⚠️ {addressWarning}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Customer Info */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '12px',
                marginBottom: '12px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
              }}
            >
              <h3
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  borderBottom: 'none',
                  paddingBottom: '0',
                }}
              >
                Your Details
              </h3>
              <div style={{ marginBottom: '10px' }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  disabled={orderType === 'delivery' && !deliveryOpen}
                  onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameError(false); }}
                  required
                  placeholder="Your name *"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1.5px solid ${nameError ? '#dc2626' : '#e6ded3'}`,
                    outline: 'none',
                    fontSize: '0.88rem',
                    fontFamily: '"Outfit", sans-serif',
                    color: '#221f1a',
                    boxSizing: 'border-box',
                    background: orderType === 'delivery' && !deliveryOpen ? '#f5f5f5' : '#fff',
                  }}
                />
                {nameError && (
                  <p style={{ color: '#b6412c', fontSize: '0.78rem', margin: '4px 0 0', fontWeight: '600' }}>
                    Please enter your name
                  </p>
                )}
              </div>
              {orderType === 'delivery' && (
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    disabled={!deliveryOpen}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(val);
                      if (val.length === 10) setPhoneError(false);
                    }}
                    required={orderType === 'delivery'}
                    placeholder="Phone Number * (10 digits)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1.5px solid ${phoneError ? '#dc2626' : '#e6ded3'}`,
                      outline: 'none',
                      fontSize: '0.88rem',
                      fontFamily: '"Outfit", sans-serif',
                      color: '#221f1a',
                      boxSizing: 'border-box',
                      background: deliveryOpen ? '#fff' : '#f5f5f5',
                    }}
                  />
                  {phoneError && (
                    <p style={{ color: '#b6412c', fontSize: '0.78rem', margin: '4px 0 0', fontWeight: '600' }}>
                      Please enter a valid 10-digit phone number
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Cart Items */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '12px',
                marginBottom: '12px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
              }}
            >
              <h3
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  borderBottom: '1.5px solid #f6f3ee',
                  paddingBottom: '6px',
                }}
              >
                Selected Items ({totalQuantity})
              </h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {cartItemsList.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #f6f3ee',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                      <span
                        style={{
                          fontWeight: '700',
                          fontSize: '0.9rem',
                          display: 'block',
                          color: '#221f1a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </span>
                      <span
                        style={{
                          color: '#b6412c',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                        }}
                      >
                        {formatCurrency(item.price)} each
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
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
                            width: '22px',
                            height: '22px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#b6412c',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Minus size={12} />
                        </button>
                        <span
                          style={{
                            minWidth: '16px',
                            textAlign: 'center',
                            fontWeight: '700',
                            fontSize: '0.8rem',
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
                            width: '22px',
                            height: '22px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            color: '#b6412c',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus size={12} />
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
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <strong
                      style={{
                        fontSize: '0.9rem',
                        marginLeft: '8px',
                        minWidth: '60px',
                        textAlign: 'right',
                      }}
                    >
                      {formatCurrency(item.price * item.quantity)}
                    </strong>
                  </div>
                ))}
              </div>
              {orderType === 'delivery' && barSettings?.delivery_enabled && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '10px',
                    fontSize: '0.88rem',
                    color: '#7f766a',
                    paddingTop: '4px',
                  }}
                >
                  <span>Subtotal</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              )}
              {orderType === 'delivery' && barSettings?.delivery_enabled && (
                <div
                  style={{
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f6f3ee',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      fontSize: '0.88rem',
                    }}
                  >
                    <span style={{ color: '#7f766a' }}>Delivery fee</span>
                    {deliveryFeeAmount === 0 ? (
                      <span style={{ color: '#1c8d3c', fontWeight: '700' }}>
                        Free!
                      </span>
                    ) : (
                      <span style={{ color: '#221f1a', fontWeight: '700' }}>
                        {formatCurrency(deliveryFeeAmount)}
                      </span>
                    )}
                  </div>
                  {deliveryFeeAmount > 0 ? (
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '0.78rem',
                        color: '#92400e',
                        fontWeight: '600',
                      }}
                    >
                      Add items worth ₹
                      {Math.ceil(DELIVERY_FREE_ABOVE - totalAmount)} more for
                      free delivery!
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '0.78rem',
                        color: '#1c8d3c',
                        fontWeight: '600',
                      }}
                    >
                      Free delivery on orders above ₹{DELIVERY_FREE_ABOVE}
                    </div>
                  )}
                </div>
              )}
              {offerActive && offerResult.discountAmount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                    fontSize: '0.9rem',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #f6f3ee',
                  }}
                >
                  <span style={{ fontWeight: '700', color: '#92400e' }}>
                    🎉 1+1 Saving ({offerResult.freeItems.length} free)
                  </span>
                  <span style={{ fontWeight: '700', color: '#92400e' }}>
                    -{formatCurrency(offerResult.discountAmount)}
                  </span>
                </div>
              )}
              {offerActive && isOfferCartOdd && totalQuantity > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '8px',
                    padding: '8px 10px',
                    background: '#fff7ed',
                    border: '1.5px dashed #f97316',
                    borderRadius: '10px',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>➕</span>
                  <span
                    style={{
                      fontWeight: '700',
                      fontSize: '0.85rem',
                      color: '#92400e',
                    }}
                  >
                    Add 1 more item to get {offerAddMoreCount} item
                    {offerAddMoreCount > 1 ? 's' : ''} free!
                  </span>
                </div>
              )}
              {orderType !== 'delivery' && (
                <div
                  onClick={() => setIsParcel((prev) => !prev)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #f6f3ee',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#221f1a',
                      fontWeight: '600',
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '5px',
                        border: isParcel ? 'none' : '1.5px solid #d1d5db',
                        background: isParcel ? '#b6412c' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontSize: '0.7rem',
                        flexShrink: 0,
                      }}
                    >
                      {isParcel && '✓'}
                    </span>
                    Parcel 📦
                  </span>
                  <span style={{ color: '#7f766a', fontWeight: '700' }}>
                    +{formatCurrency(PARCEL_CHARGE)}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '10px',
                  fontSize: '1.05rem',
                  fontWeight: '700',
                  paddingTop: '4px',
                }}
              >
                <span>Grand Total</span>
                <span style={{ color: '#b6412c' }}>
                  {formatCurrency(finalTotal)}
                </span>
              </div>
            </div>

            {/* Payment Method */}
            <form onSubmit={handlePlaceOrder}>
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '12px',
                  marginBottom: '16px',
                  border: '1.5px solid #e6ded3',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                }}
              >
                <h3
                  style={{
                    margin: '0 0 10px 0',
                    fontSize: '0.95rem',
                    fontWeight: '700',
                    borderBottom: '1.5px solid #f6f3ee',
                    paddingBottom: '6px',
                  }}
                >
                  Select Payment Method
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPaymentMethod('upi')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '12px',
                      border:
                        paymentMethod === 'upi'
                          ? '2px solid #b6412c'
                          : '1.5px solid #e6ded3',
                      background:
                        paymentMethod === 'upi' ? '#fbf7f4' : '#ffffff',
                      color: paymentMethod === 'upi' ? '#b6412c' : '#7f766a',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>📱</span>
                    <span>Pay Online (UPI)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPaymentMethod('cash')}
                    style={{
                      padding: '10px 8px',
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
                      fontSize: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>💵</span>
                    <span>
                      {orderType === 'delivery'
                        ? 'Cash on Delivery'
                        : 'Pay at Counter'}
                    </span>
                  </button>
                </div>
              </div>
              {orderType === 'delivery' && !deliveryOpen && (
                <div style={{
                  textAlign: 'center',
                  padding: '10px',
                  marginBottom: '8px',
                  background: '#fef9ec',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  color: '#92400e',
                  fontWeight: '600',
                }}>
                  Delivery closed · Available {fmt12h(barSettings?.delivery_start_time)} – {fmt12h(barSettings?.delivery_end_time)}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || isOfferCartOdd || (orderType === 'delivery' && !deliveryOpen)}
                style={{
                  width: '100%',
                  background: isOfferCartOdd || (orderType === 'delivery' && !deliveryOpen) ? '#9ca3af' : '#b6412c',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '24px',
                  fontSize: '0.98rem',
                  fontWeight: '700',
                  cursor: isOfferCartOdd || (orderType === 'delivery' && !deliveryOpen) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: isOfferCartOdd || (orderType === 'delivery' && !deliveryOpen)
                    ? 'none'
                    : '0 6px 20px rgba(182,65,44,0.3)',
                  opacity: submitting ? 0.8 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Processing...
                  </>
                ) : paymentMethod === 'upi' ? (
                  'Pay & Place Order'
                ) : orderType === 'delivery' ? (
                  'Place Delivery Order (COD)'
                ) : (
                  'Place Order (Pay Cash)'
                )}
              </button>
            </form>
          </main>
        </>
      )}

      {/* ═══ LOADER / TRANSITION OVERLAY ═══ */}
      {upiQrLoading && (
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
              maxWidth: '340px',
              borderRadius: '24px',
              padding: '28px 24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              textAlign: 'center',
              border: '1.5px solid #e6ded3',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {upiQrCodeDataUrl ? (
              <>
                <strong
                  style={{
                    fontSize: '1.1rem',
                    color: '#221f1a',
                    marginBottom: '4px',
                  }}
                >
                  Scan QR Code to Pay
                </strong>
                <div
                  style={{
                    padding: '12px',
                    background: '#fbf7f4',
                    borderRadius: '16px',
                    border: '1px solid #e6ded3',
                    display: 'inline-block',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <img
                    src={upiQrCodeDataUrl}
                    alt="UPI Payment QR Code"
                    style={{
                      width: '180px',
                      height: '180px',
                      display: 'block',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                    margin: '4px 0',
                  }}
                >
                  <Loader2
                    className="animate-spin"
                    size={16}
                    style={{ color: '#b6412c' }}
                  />
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: '600',
                      color: '#b6412c',
                    }}
                  >
                    {upiQrStatus || 'Waiting for payment...'}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.8rem',
                    color: '#7f766a',
                    lineHeight: '1.4',
                  }}
                >
                  Scan with GPay, PhonePe, Paytm, or BHIM. Keep this window open
                  after payment.
                </p>
                <div
                  style={{
                    width: '100%',
                    height: '1px',
                    background: '#e6ded3',
                    margin: '8px 0',
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (!window.Cashfree)
                        throw new Error('Cashfree SDK not loaded.');
                      const cashfree = window.Cashfree({ mode: cfEnv });
                      await cashfree.checkout({
                        paymentSessionId: cfSessionId,
                        redirectTarget: '_self',
                      });
                    } catch (err) {
                      alert('Could not launch hosted payment: ' + err.message);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#b6412c',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    textDecoration: 'underline',
                  }}
                >
                  Pay via Card / Net Banking / Wallet
                </button>
              </>
            ) : (
              <>
                <Loader2
                  className="animate-spin"
                  size={40}
                  style={{ color: '#b6412c' }}
                />
                <strong style={{ fontSize: '1.1rem', color: '#221f1a' }}>
                  {upiQrStatus || 'Processing Payment...'}
                </strong>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#7f766a' }}>
                  Please do not close this window or press back.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenu;
