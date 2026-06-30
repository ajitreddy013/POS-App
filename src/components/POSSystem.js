import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Lock,
  ArrowRight,
  Package,
  Smartphone,
  Check,
  X,
  Bell,
  ChevronLeft,
  ChevronUp,
  Bookmark,
  Share2,
  SlidersHorizontal,
  MoreVertical,
  QrCode,
  Loader2,
  Tag,
} from 'lucide-react';
import { getLocalDateTimeString } from '../utils/dateUtils';
import { isOfferActiveToday, calculateOfferDiscount } from '../utils/offerUtils';
import { App } from '@capacitor/app';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';
import QRCode from 'qrcode';
import malabarLogo from '../assets/malabar-waffle-logo.png';
import {
  playSuccessFeedback,
  playErrorFeedback,
  playIncomingOrderChime,
} from '../utils/feedbackUtils';
import { getFirebaseDb } from '../firebase';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const POSSystem = ({ isKiosk, onOpenUnlockModal }) => {
  const [products, setProducts] = useState([]);
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimerRef = useRef(null);

  const startLongPress = (e) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setLongPressActive(true);
    longPressTimerRef.current = setTimeout(() => {
      if (onOpenUnlockModal) onOpenUnlockModal();
      setLongPressActive(false);
    }, 2000); // 2 seconds
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setLongPressActive(false);
  };
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [discount, setDiscount] = useState(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'cart' for mobile view
  const searchInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const qrPollIntervalRef = useRef(null);
  const cfUnsubRef = useRef(null);
  const cfWindowRef = useRef(null);
  const executeSaleWriteRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [upiQrPayment, setUpiQrPayment] = useState(null);
  const [upiQrStatus, setUpiQrStatus] = useState('');

  // Online Orders State
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [showOnlineOrdersModal, setShowOnlineOrdersModal] = useState(false);
  const qrPaymentPendingRef = useRef(false);

  // Handle Android Back Button
  useEffect(() => {
    const handleBackButton = async () => {
      if (activeTab === 'cart') {
        setActiveTab('menu');
      }
    };

    // Add listener
    let backButtonListener;
    App.addListener('backButton', handleBackButton).then((listener) => {
      backButtonListener = listener;
    });

    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (isKiosk || !barSettings) return;

    const db = getFirebaseDb();
    if (!db) return;

    const q = query(
      collection(db, 'orders'),
      where('orderStatus', 'in', ['pending_acceptance', 'preparing'])
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const ordersList = [];
        let pendingCount = 0;

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const order = { id: doc.id, ...data };
          ordersList.push(order);
          if (data.orderStatus === 'pending_acceptance') {
            pendingCount++;
          }
        });

        // Play chime ONLY if the number of pending orders increased
        setOnlineOrders((prev) => {
          const prevPendingCount = prev.filter(
            (o) => o.orderStatus === 'pending_acceptance'
          ).length;
          if (pendingCount > prevPendingCount) {
            playIncomingOrderChime();
          }
          return ordersList;
        });
      },
      (error) => {
        console.error('Error listening to online orders:', error);
      }
    );

    return () => unsubscribe();
  }, [isKiosk, barSettings]);

  useEffect(() => {
    loadProducts();
    loadBarSettings();

    // Pre-warm the deployed relay so the first payment is instant
    fetch(`${APP_CONFIG.whatsappRelayUrl}/health`).catch(() => {});

    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      if (qrPollIntervalRef.current) clearInterval(qrPollIntervalRef.current);
    };
  }, []);

  const showNotice = (type, message, duration = 5000) => {
    setNotice({ type, message });
    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }
    if (duration > 0) {
      noticeTimeoutRef.current = window.setTimeout(() => {
        setNotice(null);
      }, duration);
    }
  };

  const loadBarSettings = async () => {
    try {
      let settings = await dbService.getBarSettings();

      // Merge Firestore settings — ensures toggles (delivery, offer, etc.)
      // shown in the app always reflect the live cloud state
      try {
        const db = getFirebaseDb();
        if (db) {
          const snap = await getDoc(doc(db, 'settings', 'bar_settings'));
          if (snap.exists()) {
            settings = { ...settings, ...snap.data() };
          }
        }
      } catch (_) {
        // Firestore unavailable — use local settings only
      }

      setBarSettings(settings);

      // Check if WhatsApp is linked and active
      try {
        const relayUrl =
          settings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
        const data = await whatsappService.getStatus(relayUrl);
        if (data && data.status !== 'CONNECTED') {
          showNotice(
            'warning',
            'Warning: WhatsApp is not linked. Please link your device in Settings to send receipts.',
            2000
          );
        }
      } catch (waErr) {
        showNotice(
          'warning',
          'Warning: Could not connect to WhatsApp relay. Please check your settings.',
          2000
        );
      }
    } catch (error) {
      // Failed to load bar settings
      setBarSettings(null);
    }
  };

  const loadProducts = async () => {
    try {
      const productList = await dbService.getProducts();
      setProducts(productList); // Show all products
    } catch (error) {
      // Failed to load products
      setProducts([]);
    }
  };

  const handleAcceptOnlineOrder = async (order) => {
    try {
      const db = getFirebaseDb();
      if (!db) return;

      // 1. Save to local Dexie database to record sale and deduct stock
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
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      await dbService.createSale(saleData);

      // 2. Update status in Firestore
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        orderStatus: 'preparing',
      });

      // Reload local products to update stock level visual in UI
      await loadProducts();
      showNotice(
        'success',
        `Accepted Order #${order.orderNumber}. Sent to kitchen.`
      );
    } catch (err) {
      console.error('Failed to accept online order:', err);
      alert(`Error accepting order: ${err.message || err}`);
    }
  };

  const handleCancelOnlineOrder = async (order) => {
    if (
      !window.confirm(
        `Are you sure you want to reject and cancel Order #${order.orderNumber}?`
      )
    ) {
      return;
    }
    try {
      const db = getFirebaseDb();
      if (!db) return;

      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        orderStatus: 'cancelled',
      });

      showNotice('warning', `Cancelled Order #${order.orderNumber}.`);
    } catch (err) {
      console.error('Failed to cancel online order:', err);
      alert(`Error cancelling order: ${err.message || err}`);
    }
  };

  const handleCompleteOnlineOrder = async (order) => {
    try {
      const db = getFirebaseDb();
      if (!db) return;

      // 1. Update status in Firestore to completed
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        orderStatus: 'completed',
      });

      // 2. Silently trigger WhatsApp receipt delivery via Render server
      if (order.customerPhone) {
        try {
          const relayUrl =
            barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
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
            saleDate: getLocalDateTimeString(),
          };
          await whatsappService.sendBill(
            relayUrl,
            barSettings || {},
            saleDataForReceipt
          );
        } catch (waErr) {
          console.error('WhatsApp final receipt failed:', waErr);
        }
      }

      showNotice(
        'success',
        `Completed Order #${order.orderNumber}. Receipt sent to customer.`
      );
    } catch (err) {
      console.error('Failed to complete online order:', err);
      alert(`Error completing order: ${err.message || err}`);
    }
  };

  const categories = useMemo(() => {
    return ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory && selectedCategory !== 'All') {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          (product.sku || '').toLowerCase().includes(term) ||
          (product.barcode && product.barcode.includes(term))
      );
    }
    return result;
  }, [products, selectedCategory, searchTerm]);

  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach((product) => {
      const cat = product.category || 'General';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  const toggleCategoryCollapse = (catName) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  const getCategoryEmoji = (category) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('waffle')) return '🧇';
    if (
      cat.includes('drink') ||
      cat.includes('beverage') ||
      cat.includes('shake')
    )
      return '🥤';
    if (cat.includes('ice') || cat.includes('desert') || cat.includes('sweet'))
      return '🍨';
    if (cat.includes('burger') || cat.includes('food')) return '🍔';
    if (cat === 'all') return '🍽️';
    return '✨';
  };

  const isVeg = (product) => {
    const name = (product.name || '').toLowerCase();
    const cat = (product.category || '').toLowerCase();
    if (
      name.includes('chicken') ||
      name.includes('egg') ||
      name.includes('meat') ||
      name.includes('fish') ||
      cat.includes('non-veg')
    ) {
      return false;
    }
    return true;
  };

  const totalCartItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const addToCart = (product) => {
    // Pre-warm the deployed relay the moment the customer adds their first item
    if (isKiosk && cart.length === 0) {
      fetch(`${APP_CONFIG.whatsappRelayUrl}/health`).catch(() => {});
    }

    const existingItem = cart.find((item) => item.id === product.id);

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image || '',
          quantity: 1,
          maxStock: product.counter_stock,
        },
      ]);
    }

    // Clear search
    setSearchTerm('');
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart(
      cart.map((item) =>
        item.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const cartDiscountAmount = useMemo(() => {
    return Math.min(discount, cartSubtotal);
  }, [discount, cartSubtotal]);

  const offerActive = useMemo(() => isOfferActiveToday(barSettings), [barSettings]);

  const offerDiscount = useMemo(() => {
    if (!offerActive || cart.length === 0) return 0;
    return calculateOfferDiscount(cart).discountAmount;
  }, [offerActive, cart]);

  const offerFreeItems = useMemo(() => {
    if (!offerActive || cart.length === 0) return [];
    return calculateOfferDiscount(cart).freeItems;
  }, [offerActive, cart]);

  const isOfferCartOdd = useMemo(() => {
    if (!offerActive) return false;
    return totalCartItems % 2 !== 0;
  }, [offerActive, totalCartItems]);

  const offerAddMoreCount = useMemo(() => {
    if (!isOfferCartOdd) return 0;
    return (totalCartItems + 1) / 2;
  }, [isOfferCartOdd, totalCartItems]);

  const cartTotal = useMemo(() => {
    return Math.max(0, cartSubtotal - cartDiscountAmount - offerDiscount);
  }, [cartSubtotal, cartDiscountAmount, offerDiscount]);

  const calculateSubtotal = () => cartSubtotal;
  const calculateDiscountAmount = () => cartDiscountAmount;
  const calculateTotal = () => cartTotal;

  const generateSaleNumber = async () => {
    // Generate a sequential order number based on total sales
    const allSales = (await dbService.getSales()) || [];
    return (allSales.length + 1).toString();
  };

  const executeSaleWrite = async (selectedMethod) => {
    setLoading(true);
    try {
      const saleData = {
        saleNumber: await generateSaleNumber(),
        saleType: 'parcel',
        tableNumber: null,
        customerName: isKiosk
          ? 'Kiosk Customer'
          : customerName || 'Walk-in Customer',
        customerPhone,
        items: cart.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        subtotal: calculateSubtotal(),
        taxAmount: 0,
        discountAmount: calculateDiscountAmount() + offerDiscount,
        totalAmount: calculateTotal(),
        paymentMethod: selectedMethod || paymentMethod,
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      // Save sale to database
      await dbService.createSale(saleData);

      // Auto-send WhatsApp receipt silently if customer phone is available
      if (customerPhone && customerPhone.trim() !== '') {
        try {
          const relayUrl = APP_CONFIG.whatsappRelayUrl;
          await whatsappService.sendBill(relayUrl, barSettings || {}, saleData);
        } catch (waErr) {
          // Silent fail — WhatsApp is optional
        }
      }

      // Clear cart and customer info
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPhoneError('');
      setDiscount(0);
      setShowDiscountInput(false);
      setActiveTab('menu');

      // Reload products to update stock
      await loadProducts();

      // Trigger dashboard refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent('saleCompleted'));
      playSuccessFeedback();
      showNotice('success', 'Order Placed! Check WhatsApp for receipt.');
    } catch (error) {
      // Failed to process sale
      console.error('Sale write error:', error);
      playErrorFeedback();
      showNotice('error', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Keep ref pointing at latest executeSaleWrite so stale interval closures always call the fresh version
  executeSaleWriteRef.current = executeSaleWrite;

  const processSale = async (method) => {
    if (cart.length === 0) {
      showNotice('error', 'Cart is empty.', 4000);
      return;
    }

    if (isOfferCartOdd) {
      showNotice('warning', `➕ Add 1 more item to get ${offerAddMoreCount} item${offerAddMoreCount > 1 ? 's' : ''} free!`, 5000);
      return;
    }

    const cleanedPhone = customerPhone.replace(/\D/g, '');
    if (!cleanedPhone || cleanedPhone.length !== 10) {
      setPhoneError('Enter a valid 10-digit phone number to continue.');
      if (phoneInputRef.current) {
        phoneInputRef.current.focus({ preventScroll: true });
      }
      return;
    }

    const selectedMethod = method || paymentMethod;
    if (method) {
      setPaymentMethod(method);
    }

    const isCashfreeEnabled = barSettings?.upi_provider === 'cashfree';
    if (selectedMethod === 'upi' && isCashfreeEnabled) {
      await startCashfreeKioskPayment();
      return;
    }

    const isRazorpayEnabled = barSettings && barSettings.razorpay_enabled === 1;
    if (selectedMethod === 'upi' && isRazorpayEnabled) {
      await startRazorpayPayment(selectedMethod);
      return;
    }

    executeSaleWrite(selectedMethod);
  };

  const startCashfreeKioskPayment = async () => {
    const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();
      setLoading(true);

      const response = await fetch(`${relayUrl}/payment/cashfree/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          orderId,
          phone: customerPhone || '9999999999',
          name: 'Kiosk Customer',
          isKiosk: true,
        }),
      });
      const data = await response.json();
      setLoading(false);

      if (!data.success) throw new Error(data.error || 'Failed to create Cashfree order.');

      const cfOrderId = data.cfOrderId || data.orderId;
      cfWindowRef.current = window.open(
        data.paymentLink,
        'cashfree_payment',
        'width=800,height=700,toolbar=0,menubar=0,scrollbars=1,resizable=1'
      );

      qrPaymentPendingRef.current = true;
      setUpiQrPayment({ orderId, amount, qrImageUrl: null, mode: 'cashfree', hostedUrl: data.paymentLink });
      setUpiQrStatus('Waiting for customer payment...');

      // Firestore listener — fires when webhook marks order paid
      const db = getFirebaseDb();
      if (db) {
        if (cfUnsubRef.current) cfUnsubRef.current();
        const orderData = {
          orderNumber: String(orderId),
          amount,
          customerPhone: customerPhone || '',
          paymentStatus: 'pending',
          paymentMethod: 'upi',
          createdAt: new Date(),
          items: cart.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.price })),
        };
        const docRef = await addDoc(collection(db, 'orders'), orderData);
        cfUnsubRef.current = onSnapshot(docRef, (snap) => {
          const d = snap.data();
          if (d && d.paymentStatus === 'paid' && qrPaymentPendingRef.current) {
            completeCashfreePayment();
          }
        });
      }

      // Polling fallback — directly checks CF order status every 3 s
      if (qrPollIntervalRef.current) clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = setInterval(async () => {
        if (!qrPaymentPendingRef.current) return;
        try {
          const statusRes = await fetch(`${relayUrl}/payment/cashfree/order-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cfOrderId }),
          });
          const statusData = await statusRes.json();
          if (statusData.success && statusData.paid && qrPaymentPendingRef.current) {
            completeCashfreePayment();
          }
        } catch (pollErr) {
          console.error('CF order status poll error:', pollErr);
        }
      }, 3000);

    } catch (err) {
      setLoading(false);
      setUpiQrPayment(null);
      setUpiQrStatus('');
      alert(`Cannot create Cashfree payment:\n${relayUrl}\n\nError: ${err.message}`);
    }
  };

  const completeCashfreePayment = () => {
    if (!qrPaymentPendingRef.current) return;
    qrPaymentPendingRef.current = false;
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }
    if (cfUnsubRef.current) {
      cfUnsubRef.current();
      cfUnsubRef.current = null;
    }
    // Close the Cashfree payment popup from the kiosk side
    try {
      if (cfWindowRef.current && !cfWindowRef.current.closed) {
        cfWindowRef.current.close();
      }
    } catch (_) {}
    cfWindowRef.current = null;
    setUpiQrStatus('Payment received. Completing order...');
    setTimeout(async () => {
      setUpiQrPayment(null);
      setUpiQrStatus('');
      // Use ref so we always call the latest executeSaleWrite (avoids stale closure)
      const saleWriter = executeSaleWriteRef.current || executeSaleWrite;
      await saleWriter('upi');
    }, 1000);
  };

  const startRazorpayPayment = async (selectedMethod) => {
    const relayUrl =
      barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();
      setLoading(true);
      const response = await fetch(`${relayUrl}/payment/create-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, orderId }),
      });
      const data = await response.json();
      setLoading(false);

      if (!data.success) throw new Error(data.error || 'Unknown error creating QR code.');

      // If merchant VPA is configured, prefer showing a direct UPI QR generated locally
      let qrImage = data.qrImageUrl;
      try {
        if (barSettings && barSettings.upi_vpa) {
          const upiUri = `upi://pay?pa=${encodeURIComponent(barSettings.upi_vpa)}&pn=${encodeURIComponent(
            barSettings.bar_name || ''
          )}&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR&tn=${encodeURIComponent('Order ' + orderId)}`;
          qrImage = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
        }
      } catch (qrErr) {
        console.error('Failed to generate local UPI QR:', qrErr);
        qrImage = data.qrImageUrl;
      }

      qrPaymentPendingRef.current = true;
      setUpiQrPayment({ orderId, amount, qrImageUrl: qrImage, paymentLinkId: data.paymentLinkId || null });
      setUpiQrStatus('Waiting for customer payment...');

      if (qrPollIntervalRef.current) clearInterval(qrPollIntervalRef.current);

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
            qrPaymentPendingRef.current = false;
            if (qrPollIntervalRef.current) {
              clearInterval(qrPollIntervalRef.current);
              qrPollIntervalRef.current = null;
            }
            setUpiQrStatus('Payment received. Completing order...');
            setTimeout(async () => {
              setUpiQrPayment(null);
              setUpiQrStatus('');
              await executeSaleWrite(selectedMethod);
            }, 1000);
          }
        } catch (pollError) {
          console.error('Error polling Razorpay QR status:', pollError);
        }
      }, 2000);
    } catch (err) {
      setLoading(false);
      setUpiQrPayment(null);
      setUpiQrStatus('');
      alert(
        `Cannot create payment QR at:\n${relayUrl}\n\nError: ${err.message}`
      );
    }
  };

  const closeUpiQrPayment = () => {
    if (qrPollIntervalRef.current) {
      clearInterval(qrPollIntervalRef.current);
      qrPollIntervalRef.current = null;
    }
    if (cfUnsubRef.current) {
      cfUnsubRef.current();
      cfUnsubRef.current = null;
    }
    qrPaymentPendingRef.current = false;
    setUpiQrPayment(null);
    setUpiQrStatus('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
    }
  };

  return (
    <div className="pos-system" style={{ position: 'relative' }}>
      {notice && (
        <div className={`pos-notice pos-notice-${notice.type}`}>
          <div className="pos-notice-bar" />
          <div
            className="pos-notice-content"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '12px 16px',
            }}
          >
            {notice.message === 'success' || notice.message === 'error' ? (
              <strong
                style={{
                  fontSize: '15px',
                  color: notice.type === 'success' ? '#166534' : '#b91c1c',
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                {notice.message}
              </strong>
            ) : (
              <>
                <strong>
                  {notice.type === 'success'
                    ? 'Success'
                    : notice.type === 'warning'
                      ? 'Warning'
                      : 'Error'}
                </strong>
                <span>{notice.message}</span>
              </>
            )}
          </div>
        </div>
      )}
      <div className="pos-layout">
        <div
          className={`product-panel ${isKiosk && activeTab === 'cart' ? 'mobile-hidden' : ''}`}
        >
          <div
            className="kiosk-header"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '16px 14px 12px',
              background: '#f6f3ee',
              borderBottom: '1px solid #e6ded3',
            }}
          >
            {/* Single Row: Logo + Name + Online Orders + Search Icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
              }}
            >
              <div
                onMouseDown={startLongPress}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={startLongPress}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
                style={{
                  height: '36px',
                  width: '36px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  cursor: 'pointer',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  opacity: longPressActive ? 0.5 : 1,
                  transition: 'opacity 0.2s',
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
                {!isKiosk && barSettings?.address && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: '#7f766a',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    📍 {barSettings.address}
                  </span>
                )}
              </div>

              {!isKiosk && getFirebaseDb() && (
                <button
                  onClick={() => setShowOnlineOrdersModal(true)}
                  style={{
                    background:
                      onlineOrders.filter(
                        (o) => o.orderStatus === 'pending_acceptance'
                      ).length > 0
                        ? '#ea580c'
                        : '#1C5C3A',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <Smartphone size={14} />
                  <span
                    style={{
                      background: 'white',
                      color:
                        onlineOrders.filter(
                          (o) => o.orderStatus === 'pending_acceptance'
                        ).length > 0
                          ? '#ea580c'
                          : '#1C5C3A',
                      borderRadius: '50%',
                      width: '16px',
                      height: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: '800',
                    }}
                  >
                    {onlineOrders.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowSearch((prev) => {
                    const next = !prev;
                    if (next) {
                      setTimeout(() => {
                        if (searchInputRef.current)
                          searchInputRef.current.focus({ preventScroll: true });
                      }, 80);
                    } else {
                      setSearchTerm('');
                    }
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
                title="Search"
                aria-label="Search products"
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
                  border: '1px solid #e6ded3',
                  borderRadius: '999px',
                  padding: '0 16px',
                  height: '40px',
                  gap: '8px',
                }}
              >
                <Search size={16} style={{ color: '#b6412c', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyPress}
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

          <div className="products-grid pos-products-grid">
            {filteredProducts.length === 0 ? (
              <div className="pos-empty-products">
                <h3>No matching items</h3>
                <p>Try another product name, SKU, or barcode.</p>
              </div>
            ) : isKiosk ? (
              Object.entries(groupedProducts).map(([categoryName, items]) => {
                const isCollapsed = collapsedCategories[categoryName];
                return (
                  <div
                    key={categoryName}
                    className="kiosk-category-section"
                    id={`cat-sec-${categoryName.replace(/\s+/g, '-')}`}
                    style={{ marginBottom: '16px' }}
                  >
                    <div
                      className="kiosk-category-header"
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
                    {true && (
                      <div className="kiosk-category-items">
                        {items.map((product) => {
                          const cartItem = cart.find(
                            (item) => item.id === product.id
                          );
                          const qty = cartItem ? cartItem.quantity : 0;
                          return (
                            <div
                              key={product.id}
                              className="kiosk-product-row"
                              style={{
                                display: 'flex',
                                padding: '14px',
                                borderBottom: '1px dashed #e6ded3',
                                gap: '15px',
                              }}
                            >
                              <div
                                className="kiosk-product-left"
                                style={{
                                  flex: 1,
                                  display: 'flex',
                                  flexDirection: 'column',
                                }}
                              >
                                <h3
                                  className="kiosk-product-name"
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
                                  className="kiosk-product-price-row"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    margin: '0 0 6px',
                                  }}
                                >
                                  <p
                                    className="kiosk-product-price"
                                    style={{
                                      margin: 0,
                                      fontSize: '0.9rem',
                                      fontWeight: '800',
                                      color: '#b6412c',
                                    }}
                                  >
                                    {formatCurrency(product.price)}
                                  </p>
                                  <div
                                    className={`veg-badge ${isVeg(product) ? 'veg' : 'non-veg'}`}
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
                                      className="veg-indicator"
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
                                  className="kiosk-product-offer"
                                  style={{
                                    margin: '0 0 12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#1C5C3A',
                                  }}
                                >
                                  {product.description ||
                                    (product.name
                                      .toLowerCase()
                                      .includes('waffle')
                                      ? 'On Buy 1 Get 1 Free'
                                      : 'Fresh & Delicious')}
                                </p>
                              </div>
                              <div
                                className="kiosk-product-right"
                                style={{ flexShrink: 0, position: 'relative' }}
                              >
                                <div
                                  className="kiosk-image-container"
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
                                      className="kiosk-placeholder-image"
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

                                  {/* Overlapping ADD Button */}
                                  <div
                                    className="kiosk-add-btn-container"
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
                                    {qty > 0 ? (
                                      <div
                                        className="kiosk-qty-controls"
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
                                          boxShadow:
                                            '0 4px 10px rgba(0,0,0,0.06)',
                                        }}
                                      >
                                        <button
                                          onClick={() =>
                                            updateQuantity(product.id, qty - 1)
                                          }
                                          className="kiosk-qty-btn minus"
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
                                          className="kiosk-qty-value"
                                          style={{
                                            color: '#b6412c',
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                          }}
                                        >
                                          {qty}
                                        </span>
                                        <button
                                          onClick={() => addToCart(product)}
                                          className="kiosk-qty-btn plus"
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
                                    ) : (
                                      <button
                                        className="kiosk-add-btn"
                                        onClick={() => addToCart(product)}
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
                                          boxShadow:
                                            '0 4px 10px rgba(0,0,0,0.06)',
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
                    )}
                  </div>
                );
              })
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="minimal-product-card"
                  style={{ cursor: 'default' }}
                >
                  <div className="minimal-card-image-wrapper">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="minimal-card-placeholder" />
                    )}
                  </div>
                  <div className="minimal-card-info">
                    <h4 className="minimal-card-name" title={product.name}>
                      {product.name}
                    </h4>
                    <p className="minimal-card-price">
                      {formatCurrency(product.price)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {isKiosk && <div
          className={`cart-panel cart-panel-minimal ${activeTab === 'menu' ? 'mobile-hidden' : ''}`}
        >
          <div
            className="cart-section"
            style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}
          >
            <div
              className="cart-header-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '8px',
                gap: '8px',
              }}
            >
              <button
                type="button"
                className="mobile-back-btn"
                onClick={() => setActiveTab('menu')}
              >
                ← Menu
              </button>
              <h3 style={{ margin: 0 }}>
                <ShoppingCart
                  size={18}
                  style={{ marginRight: '8px', display: 'inline' }}
                />{' '}
                Current Order ({totalCartItems})
              </h3>
            </div>

            <div
              className="form-row cart-phone-row"
              style={{ marginTop: '16px', marginBottom: '16px' }}
            >
              <input
                type="tel"
                placeholder={
                  isKiosk
                    ? 'Enter 10-digit Phone Number (Mandatory)'
                    : 'Phone Number'
                }
                value={customerPhone}
                ref={phoneInputRef}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 10) {
                    setCustomerPhone(value);
                    if (phoneError) {
                      setPhoneError('');
                    }
                  }
                }}
                className={`form-input cart-phone-input ${phoneError ? 'error' : ''}`}
                style={{ padding: '8px 12px', fontSize: '13px', width: '100%' }}
                maxLength="10"
              />
              {phoneError && (
                <div className="cart-phone-error" role="alert">
                  {phoneError}
                </div>
              )}
            </div>
            {offerActive && (
              <div style={{ margin: '0 0 8px 0', background: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)', border: '1.5px solid #fde047', borderRadius: '10px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={14} style={{ color: '#92400e', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92400e', lineHeight: '1.4' }}>
                  1+1 Offer Active! Add waffles in pairs — the cheaper one is FREE. Quantities step by 2.
                </span>
              </div>
            )}
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="empty-cart" style={{ padding: '40px 0' }}>
                  <ShoppingCart size={32} />
                  <p style={{ color: '#6c757d', marginTop: '12px' }}>
                    Cart is empty
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="cart-item-minimal">
                    <div className="cart-item-minimal-layout">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="remove-btn cart-item-delete-btn"
                        style={{ padding: '0' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="cart-item-minimal-text">
                        <h4
                          className="cart-item-minimal-name"
                          title={item.name}
                        >
                          {item.name}
                        </h4>
                      </div>
                      <div
                        className="quantity-controls cart-item-minimal-qty"
                        style={{
                          transform: 'scale(0.8)',
                          transformOrigin: 'center',
                        }}
                      >
                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          className="qty-btn"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="cart-item-qty-value">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          className="qty-btn"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="cart-item-minimal-price-block">
                        <div className="item-total cart-item-minimal-total">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                        <p className="cart-item-minimal-unit-price">
                          {formatCurrency(item.price)} each
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="billing-section payment-checkout-panel">
            {!isKiosk && (
              <div
                className="billing-controls"
                style={{
                  padding: '8px 10px',
                  borderTop: '1px solid #e6ded3',
                  background: '#fffdf8',
                }}
              >
                <div
                  className="payment-method-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #e6ded3',
                        background: showDiscountInput
                          ? '#f2e7db'
                          : 'transparent',
                        color: '#7f766a',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowDiscountInput((prev) => !prev)}
                    >
                      % Discount
                    </button>
                    {showDiscountInput && (
                      <input
                        type="number"
                        value={discount === 0 ? '' : discount}
                        onChange={(e) =>
                          setDiscount(parseFloat(e.target.value) || 0)
                        }
                        min="0"
                        className="form-input"
                        placeholder="Amt"
                        style={{
                          width: '60px',
                          padding: '4px 8px',
                          fontSize: '11px',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            <div
              className="bill-summary payment-total-card cart-summary-card"
              style={{ borderTop: '1px solid #e6ded3', paddingTop: '12px' }}
            >
              {!isKiosk && (
                <div
                  className="summary-line cart-summary-row"
                  style={{ fontSize: '12px', marginBottom: '4px' }}
                >
                  <span style={{ color: '#7f766a' }}>Subtotal:</span>
                  <span style={{ color: '#221f1a', fontWeight: '500' }}>
                    {formatCurrency(calculateSubtotal())}
                  </span>
                </div>
              )}
              {!isKiosk && discount > 0 && (
                <div
                  className="summary-line discount cart-summary-row"
                  style={{
                    fontSize: '12px',
                    marginBottom: '4px',
                    color: '#b6412c',
                  }}
                >
                  <span>Discount:</span>
                  <span>-{formatCurrency(calculateDiscountAmount())}</span>
                </div>
              )}
              {offerActive && offerDiscount > 0 && (
                <div
                  className="summary-line discount cart-summary-row"
                  style={{ fontSize: '12px', marginBottom: '4px', color: '#92400e', background: '#fef9c3', borderRadius: '6px', padding: '4px 6px' }}
                >
                  <span style={{ fontWeight: '700' }}>🎉 1+1 Saving ({offerFreeItems.length} free):</span>
                  <span style={{ fontWeight: '700' }}>-{formatCurrency(offerDiscount)}</span>
                </div>
              )}
              {offerActive && isOfferCartOdd && totalCartItems > 0 && (
                <div
                  className="summary-line cart-summary-row"
                  style={{ fontSize: '12px', marginBottom: '4px', color: '#92400e', background: '#fff7ed', border: '1.5px dashed #f97316', borderRadius: '6px', padding: '5px 8px', fontWeight: '700' }}
                >
                  <span>➕ Add 1 more → get {offerAddMoreCount} free!</span>
                </div>
              )}
              <div
                className="summary-line total cart-summary-total"
                style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px dashed #e6ded3',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                <span style={{ color: '#221f1a' }}>Total:</span>
                <span style={{ color: '#b6412c' }}>
                  {formatCurrency(calculateTotal())}
                </span>
              </div>
            </div>

            <div
              className="action-buttons payment-action-grid"
              style={{ display: 'flex', gap: '12px', marginTop: '10px' }}
            >
              <button
                className="payment-action-card payment-action-upi"
                onClick={() => processSale('upi')}
                disabled={cart.length === 0 || loading || isOfferCartOdd}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '12px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  height: '92px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (cart.length > 0 && !loading && !isOfferCartOdd) {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow =
                      '0 10px 15px -3px rgba(239, 68, 68, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                }}
              >
                <img
                  src="upi-logo.png"
                  alt="UPI Payment"
                  style={{
                    height: '40px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    opacity: cart.length === 0 || loading ? 0.5 : 1,
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: '#4b5563',
                    fontWeight: '600',
                    opacity: cart.length === 0 || loading ? 0.6 : 1,
                  }}
                >
                  UPI Pay
                </span>
              </button>
              <button
                className="payment-action-card payment-action-cash"
                onClick={() => processSale('cash')}
                disabled={cart.length === 0 || loading || isOfferCartOdd}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '2px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '12px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  height: '92px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (cart.length > 0 && !loading && !isOfferCartOdd) {
                    e.currentTarget.style.borderColor = '#16a34a';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow =
                      '0 10px 15px -3px rgba(22, 163, 74, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                }}
              >
                <img
                  src="cash-logo.png"
                  alt="Cash Payment"
                  style={{
                    height: '40px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    opacity: cart.length === 0 || loading ? 0.5 : 1,
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: '#4b5563',
                    fontWeight: '600',
                    opacity: cart.length === 0 || loading ? 0.6 : 1,
                  }}
                >
                  Pay at Counter
                </span>
              </button>
            </div>
          </div>
        </div>}
      </div>

      {/* Sticky Bottom Mobile Navigation — kiosk only */}
      {isKiosk && <div className="mobile-nav-bar">
        <button
          className={activeTab === 'menu' ? 'active' : ''}
          onClick={() => setActiveTab('menu')}
        >
          <Package size={20} />
          <span>Menu</span>
        </button>
        <button
          className={activeTab === 'cart' ? 'active' : ''}
          onClick={() => setActiveTab('cart')}
        >
          <ShoppingCart size={20} />
          <span>Cart ({totalCartItems})</span>
        </button>
      </div>}

      {/* Floating Cart Banner for Mobile — kiosk only */}
      {isKiosk && totalCartItems > 0 && activeTab === 'menu' && (
        <div
          className="mobile-cart-floating-bar"
          onClick={() => setActiveTab('cart')}
        >
          <div className="bar-info">
            <ShoppingCart size={isKiosk ? 18 : 20} />
            <span>
              {isKiosk
                ? `${totalCartItems} | ${formatCurrency(calculateTotal())}`
                : `${totalCartItems} ${totalCartItems === 1 ? 'item' : 'items'} | ${formatCurrency(calculateTotal())}`}
            </span>
          </div>
          <div className="bar-action">
            <span>{isKiosk ? 'View' : 'View Cart'}</span>
            <ArrowRight size={isKiosk ? 16 : 18} />
          </div>
        </div>
      )}

      {/* UPI Payment Modal — Cashfree hosted page or Razorpay QR */}
      {upiQrPayment && (
        <div
          className="upi-qr-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="UPI payment"
        >
          <div className="upi-qr-sheet">
            <div className="upi-qr-header">
              <div className="upi-qr-title-wrap">
                <span className="upi-qr-icon">
                  <QrCode size={20} />
                </span>
                <div>
                  <h3>{upiQrPayment.mode === 'cashfree' ? 'UPI Payment' : 'Scan UPI QR'}</h3>
                  <p>Order #{upiQrPayment.orderId}</p>
                </div>
              </div>
              <button
                type="button"
                className="upi-qr-close"
                onClick={closeUpiQrPayment}
                aria-label="Close UPI payment"
              >
                <X size={18} />
              </button>
            </div>

            <div className="upi-qr-body">
              <div className="upi-qr-amount-card">
                <span>Amount to Pay</span>
                <strong>{formatCurrency(upiQrPayment.amount)}</strong>
              </div>

              {upiQrPayment.mode === 'cashfree' ? (
                <div className="upi-qr-browser-notice">
                  <div className="upi-qr-browser-icon">🌐</div>
                  <p>Payment page opened in browser.</p>
                  <p>Scan the UPI QR on that page to pay.</p>
                  <button
                    type="button"
                    style={{ marginTop: '12px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #e6ded3', background: '#f6f3ee', cursor: 'pointer', fontSize: '0.82rem' }}
                    onClick={() => window.open(upiQrPayment.hostedUrl, '_blank')}
                  >
                    Reopen Payment Page
                  </button>
                </div>
              ) : (
                <div className="upi-qr-image-frame">
                  {upiQrPayment.qrImageUrl ? (
                    <img
                      src={upiQrPayment.qrImageUrl}
                      alt="UPI QR code"
                    />
                  ) : (
                    <div className="upi-qr-placeholder">
                      <Loader2 size={28} className="spin" />
                    </div>
                  )}
                </div>
              )}

              <div className="upi-qr-status">
                <Loader2 size={16} className="spin" />
                <span>{upiQrStatus || 'Waiting for payment...'}</span>
              </div>
            </div>

            <div className="upi-qr-actions">
              {upiQrPayment?.mode === 'cashfree' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }}
                  onClick={completeCashfreePayment}
                >
                  Payment Received ✓
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeUpiQrPayment}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Online Orders Live Modal */}
      {showOnlineOrdersModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              width: '650px',
              maxWidth: '90%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 15px 30px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#1C5C3A',
                color: 'white',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Bell size={20} />
                Live Online Orders ({onlineOrders.length})
              </h3>
              <button
                onClick={() => setShowOnlineOrdersModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                flex: 1,
                background: '#f8fafc',
              }}
            >
              {onlineOrders.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#64748b',
                  }}
                >
                  <Smartphone
                    size={48}
                    style={{ margin: '0 auto 12px auto', opacity: 0.5 }}
                  />
                  <p style={{ margin: 0, fontWeight: '600' }}>
                    No active online orders
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                    Orders placed by customers from their mobile browsers will
                    show up here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                  }}
                >
                  {onlineOrders.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        background: 'white',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        padding: '16px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px',
                          borderBottom: '1px solid #f1f5f9',
                          paddingBottom: '10px',
                        }}
                      >
                        <div>
                          <strong
                            style={{ fontSize: '1.05rem', color: '#1e293b' }}
                          >
                            Order #{order.orderNumber}
                          </strong>
                          <span
                            style={{
                              marginLeft: '10px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background:
                                order.orderStatus === 'pending_acceptance'
                                  ? '#ffedd5'
                                  : '#dcfce7',
                              color:
                                order.orderStatus === 'pending_acceptance'
                                  ? '#ea580c'
                                  : '#15803d',
                            }}
                          >
                            {order.orderStatus === 'pending_acceptance'
                              ? 'Pending Approval'
                              : 'Preparing'}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.85rem',
                            color: '#64748b',
                            fontWeight: '500',
                          }}
                        >
                          Table:{' '}
                          <strong style={{ color: '#1C5C3A' }}>
                            {order.tableNumber}
                          </strong>
                        </span>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <span
                          style={{
                            fontSize: '0.85rem',
                            color: '#64748b',
                            display: 'block',
                          }}
                        >
                          Customer: <strong>{order.customerName}</strong> (
                          {order.customerPhone})
                        </span>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <strong
                          style={{
                            fontSize: '0.9rem',
                            color: '#475569',
                            display: 'block',
                            marginBottom: '6px',
                          }}
                        >
                          Items:
                        </strong>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            paddingLeft: '8px',
                          }}
                        >
                          {order.items.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                fontSize: '0.9rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>
                                {item.name}{' '}
                                <span style={{ color: '#64748b' }}>
                                  x{item.quantity}
                                </span>
                              </span>
                              <strong>{formatCurrency(item.totalPrice)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderTop: '1px solid #f1f5f9',
                          paddingTop: '12px',
                        }}
                      >
                        <div>
                          <span
                            style={{ fontSize: '0.85rem', color: '#64748b' }}
                          >
                            Total Paid via {order.paymentMethod.toUpperCase()}
                            :{' '}
                          </span>
                          <strong
                            style={{ fontSize: '1.1rem', color: '#1C5C3A' }}
                          >
                            {formatCurrency(order.totalAmount)}
                          </strong>
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              color:
                                order.paymentStatus === 'paid'
                                  ? '#16a34a'
                                  : '#dc2626',
                            }}
                          >
                            (
                            {order.paymentStatus === 'paid'
                              ? 'Paid Online'
                              : 'Pay Cash'}
                            )
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          {order.orderStatus === 'pending_acceptance' ? (
                            <>
                              <button
                                onClick={() => handleCancelOnlineOrder(order)}
                                className="btn btn-sm btn-danger"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '6px 12px',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <X size={14} /> Reject
                              </button>
                              <button
                                onClick={() => handleAcceptOnlineOrder(order)}
                                className="btn btn-sm btn-primary"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '6px 16px',
                                  fontSize: '0.8rem',
                                  background: '#1C5C3A',
                                }}
                              >
                                <Check size={14} /> Accept
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleCompleteOnlineOrder(order)}
                              className="btn btn-sm btn-primary"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 16px',
                                fontSize: '0.8rem',
                                background: '#EAB308',
                                color: '#1e293b',
                              }}
                            >
                              <Check size={14} /> Complete Order
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: '15px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                background: '#f1f5f9',
              }}
            >
              <button
                onClick={() => setShowOnlineOrdersModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 20px' }}
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Kiosk Menu Categories Quick Link */}
      {isKiosk && activeTab !== 'cart' && (
        <>
          <button
            className="kiosk-floating-menu-btn"
            onClick={() => setShowCategoryMenu((prev) => !prev)}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              backgroundColor: '#b6412c',
              color: '#ffffff',
              border: '1px solid #b6412c',
              padding: '12px 20px',
              borderRadius: '999px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '700',
              fontSize: '0.9rem',
              zIndex: 9999,
              cursor: 'pointer',
            }}
          >
            🍴 <span>Category</span>
          </button>

          {showCategoryMenu && (
            <div
              className="kiosk-category-popover-overlay"
              onClick={() => setShowCategoryMenu(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.2)',
                zIndex: 9998,
              }}
            >
              <div
                className="kiosk-category-popover"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  bottom: '84px',
                  right: '24px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e6ded3',
                  borderRadius: '16px',
                  padding: '12px',
                  width: '200px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
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
                {categories.map((cat) => (
                  <button
                    key={cat}
                    style={{
                      background:
                        selectedCategory === cat ? '#f2e7db' : 'transparent',
                      border: 'none',
                      color: selectedCategory === cat ? '#b6412c' : '#221f1a',
                      textAlign: 'left',
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setShowCategoryMenu(false);
                      if (cat !== 'All') {
                        setTimeout(() => {
                          const element = document.getElementById(
                            `cat-sec-${cat.replace(/\s+/g, '-')}`
                          );
                          if (element) {
                            element.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }
                        }, 100);
                      }
                    }}
                  >
                    <span>{getCategoryEmoji(cat)}</span>
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default POSSystem;
