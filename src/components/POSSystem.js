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
} from 'lucide-react';
import { getLocalDateTimeString } from '../utils/dateUtils';
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
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
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

      // Sync settings from Firestore if online
      try {
        const db = getFirebaseDb();
        if (db) {
          const settingsRef = doc(db, 'settings', 'bar_settings');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const cloudSettings = settingsSnap.data();
            settings = {
              ...settings,
              ...cloudSettings,
            };
            await dbService.saveBarSettings(settings);
          }
        }
      } catch (cloudErr) {
        console.error('Failed to sync settings from Firestore:', cloudErr);
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

  const cartTotal = useMemo(() => {
    return Math.max(0, cartSubtotal - cartDiscountAmount);
  }, [cartSubtotal, cartDiscountAmount]);

  const calculateSubtotal = () => cartSubtotal;
  const calculateDiscountAmount = () => cartDiscountAmount;
  const calculateTotal = () => cartTotal;

  const generateSaleNumber = async () => {
    // Generate a sequential order number based on total sales excluding web orders
    const allSales = (await dbService.getSales()) || [];
    const appSalesCount = allSales.filter(s => !s.saleNumber?.startsWith('W-')).length;
    return `A-${appSalesCount + 1}`;
  };

  const executeSaleWrite = async (selectedMethod) => {
    setLoading(true);
    try {
      const orderNumber = await generateSaleNumber();

      if (isKiosk) {
        // KIOSK MODE: Write order to Firestore 'orders' collection
        const db = getFirebaseDb();
        if (!db) {
          throw new Error("Firebase not configured on client.");
        }

        const orderData = {
          orderNumber,
          customerName: 'Kiosk Customer',
          customerPhone: customerPhone || '',
          tableNumber: 'Kiosk',
          items: cart.map((item) => ({
            productId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          })),
          totalAmount: calculateTotal(),
          paymentMethod: selectedMethod || paymentMethod,
          paymentStatus: (selectedMethod || paymentMethod) === 'upi' ? 'paid' : 'pending',
          orderStatus: 'pending_acceptance',
          createdAt: new Date(),
        };

        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(db, 'orders'), orderData);

        if (customerPhone && (selectedMethod || paymentMethod) === 'cash') {
          try {
            const relayUrl = APP_CONFIG.whatsappRelayUrl;
            await fetch(`${relayUrl}/payment/send-confirmation`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: customerPhone,
                name: 'Kiosk Customer',
                orderNumber,
                tableNumber: 'Kiosk',
                totalAmount: calculateTotal(),
                paymentMethod: 'cash',
                items: cart.map((item) => ({
                  name: item.name,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  totalPrice: item.price * item.quantity
                })),
                subtotal: calculateSubtotal(),
                discountAmount: calculateDiscountAmount(),
                taxAmount: 0
              })
            });
          } catch (waErr) {
            console.error('WhatsApp Kiosk confirmation failed:', waErr);
          }
        }

        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setPhoneError('');
        setDiscount(0);
        setShowDiscountInput(false);
        setActiveTab('menu');

        const successMsg = (selectedMethod || paymentMethod) === 'upi'
          ? `Order #${orderNumber} Placed! Paid successfully via UPI.`
          : `Order #${orderNumber} Placed! Please pay Cash at the counter.`;
        showNotice('success', successMsg);
        playSuccessFeedback();
        return;
      }

      // ADMIN MODE: Write sale directly to local Dexie
      const saleData = {
        saleNumber: orderNumber,
        saleType: 'parcel',
        tableNumber: null,
        customerName: customerName || 'Walk-in Customer',
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
        discountAmount: calculateDiscountAmount(),
        totalAmount: calculateTotal(),
        paymentMethod: selectedMethod || paymentMethod,
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      await dbService.createSale(saleData);

      if (customerPhone && customerPhone.trim() !== '') {
        try {
          const relayUrl = APP_CONFIG.whatsappRelayUrl;
          await whatsappService.sendBill(relayUrl, barSettings || {}, saleData);
        } catch (waErr) {
          // Silent fail
        }
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setPhoneError('');
      setDiscount(0);
      setShowDiscountInput(false);
      setActiveTab('menu');

      await loadProducts();
      window.dispatchEvent(new CustomEvent('saleCompleted'));
      playSuccessFeedback();
      showNotice('success', 'Order Placed! Check WhatsApp for receipt.');
    } catch (error) {
      console.error('Sale write error:', error);
      playErrorFeedback();
      showNotice('error', error.message || 'Failed to place order.');
    } finally {
      setLoading(false);
    }
  };

  const processSale = async (method) => {
    if (cart.length === 0) {
      showNotice('error', 'Cart is empty.', 4000);
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

    // Check if payment method is UPI and automated QR is enabled or direct VPA configured
    const isUpiEnabled = barSettings && (
      barSettings.razorpay_enabled === 1 || 
      !!barSettings.upi_vpa || 
      barSettings.upi_provider === 'cashfree'
    );
    if (selectedMethod === 'upi' && isUpiEnabled) {
      await startUpiQrPayment(selectedMethod);
      return;
    }

    executeSaleWrite(selectedMethod);
  };

  const startUpiQrPayment = async (selectedMethod) => {
    const relayUrl =
      barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
    const upiProvider = barSettings?.upi_provider || 'razorpay';

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();
      setLoading(true);

      if (upiProvider === 'cashfree') {
        const db = getFirebaseDb();
        if (!db) {
          throw new Error("Firestore not configured. Cashfree integration requires Firestore.");
        }

        const orderData = {
          orderNumber: orderId,
          customerName: isKiosk ? 'Kiosk Customer' : (customerName || 'Walk-in Customer'),
          customerPhone: customerPhone || '',
          tableNumber: isKiosk ? 'Kiosk' : 'Counter',
          items: cart.map((item) => ({
            productId: String(item.id),
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          })),
          totalAmount: amount,
          paymentMethod: 'upi',
          paymentStatus: 'pending',
          orderStatus: 'pending_acceptance',
          createdAt: new Date(),
        };

        const docRef = await addDoc(collection(db, 'orders'), orderData);
        console.log(`Created Cashfree-tracked Firestore order with ID: ${docRef.id}`);

        const response = await fetch(`${relayUrl}/payment/cashfree/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            orderId,
            phone: customerPhone || '9999999999',
            name: isKiosk ? 'Kiosk Customer' : (customerName || 'Walk-in Customer')
          }),
        });
        const data = await response.json();
        setLoading(false);

        if (!data.success) {
          throw new Error(data.error || 'Failed to generate Cashfree payment.');
        }

        const upiLink = data.upiLink;
        if (!upiLink) {
          throw new Error("No UPI link returned from Cashfree.");
        }

        let qrImage = '';
        try {
          qrImage = await QRCode.toDataURL(upiLink, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
        } catch (qrErr) {
          console.error('Failed to generate local UPI QR from Cashfree link:', qrErr);
          throw qrErr;
        }

        qrPaymentPendingRef.current = true;
        setUpiQrPayment({ orderId, amount, qrImageUrl: qrImage });
        setUpiQrStatus('Waiting for customer payment...');

        if (qrPollIntervalRef.current) {
          if (qrPollIntervalRef.current.unsubscribe) qrPollIntervalRef.current.unsubscribe();
          else clearInterval(qrPollIntervalRef.current);
        }

        const unsubscribe = onSnapshot(docRef, async (snap) => {
          if (snap.exists()) {
            const snapData = snap.data();
            if (snapData.paymentStatus === 'paid') {
              unsubscribe();
              qrPaymentPendingRef.current = false;
              setUpiQrStatus('Payment received! Completing sale...');
              setTimeout(async () => {
                setUpiQrPayment(null);
                setUpiQrStatus('');
                await executeSaleWrite('upi');
              }, 1500);
            }
          }
        }, (error) => {
          console.error("Error listening to Cashfree order status in Firestore:", error);
        });

        qrPollIntervalRef.current = {
          unsubscribe
        };

      } else {
        // Razorpay UPI QR Flow or Static VPA QR Flow
        let qrImage = '';
        let paymentLinkId = null;
        let qrCodeId = null;

        const isAutomatedRazorpay = barSettings?.razorpay_enabled === 1;

        if (isAutomatedRazorpay) {
          const response = await fetch(`${relayUrl}/payment/create-qr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, orderId }),
          });
          const data = await response.json();
          setLoading(false);

          if (!data.success) throw new Error(data.error || 'Unknown error creating Razorpay QR code.');
          qrImage = data.qrImageUrl;
          paymentLinkId = data.paymentLinkId || null;
          qrCodeId = data.qrCodeId || null;
        }

        try {
          if (barSettings && barSettings.upi_vpa) {
            const upiUri = `upi://pay?pa=${encodeURIComponent(barSettings.upi_vpa)}&pn=${encodeURIComponent(
              barSettings.bar_name || ''
            )}&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR&tn=${encodeURIComponent('Order ' + orderId)}`;
            qrImage = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
          } else if (!isAutomatedRazorpay) {
            throw new Error("Automated UPI is disabled and no Merchant UPI VPA is configured.");
          }
        } catch (qrErr) {
          console.error('Failed to generate local UPI QR:', qrErr);
          if (!qrImage) throw qrErr;
        }

        setLoading(false);
        qrPaymentPendingRef.current = true;
        setUpiQrPayment({ orderId, amount, qrImageUrl: qrImage, paymentLinkId, qrCodeId });
        setUpiQrStatus('Waiting for customer payment...');

        if (qrPollIntervalRef.current) {
          if (qrPollIntervalRef.current.unsubscribe) qrPollIntervalRef.current.unsubscribe();
          else clearInterval(qrPollIntervalRef.current);
        }

        if (isAutomatedRazorpay) {
          const intervalId = setInterval(async () => {
            try {
              const statusResponse = await fetch(`${relayUrl}/payment/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  qrCodeId: qrCodeId || null,
                  paymentLinkId: paymentLinkId || null,
                }),
              });

              const statusData = await statusResponse.json();
              if (statusData.success && statusData.paid) {
                qrPaymentPendingRef.current = false;
                clearInterval(intervalId);
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

          qrPollIntervalRef.current = {
            clearInterval: () => clearInterval(intervalId)
          };
        }
      }
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
      if (qrPollIntervalRef.current.unsubscribe) {
        qrPollIntervalRef.current.unsubscribe();
      } else if (qrPollIntervalRef.current.clearInterval) {
        qrPollIntervalRef.current.clearInterval();
      } else {
        clearInterval(qrPollIntervalRef.current);
      }
      qrPollIntervalRef.current = null;
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
          className={`product-panel ${activeTab === 'cart' ? 'mobile-hidden' : ''}`}
          style={{ display: activeTab === 'cart' ? 'none' : 'flex' }}
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
                  onClick={() => addToCart(product)}
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

        <div
          className={`cart-panel cart-panel-minimal ${activeTab === 'menu' ? 'mobile-hidden' : ''}`}
          style={{
            display: activeTab === 'menu' ? 'none' : 'flex',
            maxWidth: activeTab === 'cart' ? 'none' : undefined,
            minWidth: activeTab === 'cart' ? '0' : undefined,
            width: activeTab === 'cart' ? '100%' : undefined,
            flex: activeTab === 'cart' ? 1 : undefined,
            background: activeTab === 'cart' ? '#f6f3ee' : undefined,
            padding: activeTab === 'cart' ? '0' : undefined,
            height: activeTab === 'cart' ? '100%' : undefined,
            overflow: activeTab === 'cart' ? 'hidden' : undefined,
            flexDirection: 'column',
          }}
        >
          {activeTab === 'cart' ? (
            <header
              className="menu-header"
              style={{
                background: '#f6f3ee',
                color: '#221f1a',
                padding: '12px 16px',
                borderBottom: '1px solid #e6ded3',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setActiveTab('menu')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#b6412c',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <ChevronLeft size={18} /> Back
              </button>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#221f1a', margin: 0, marginLeft: '8px' }}>
                Review Order
              </h2>
            </header>
          ) : (
            <div
              className="cart-header-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '8px',
                gap: '8px',
                padding: '16px',
              }}
            >
              <h3 style={{ margin: 0 }}>
                <ShoppingCart
                  size={18}
                  style={{ marginRight: '8px', display: 'inline' }}
                />{' '}
                Current Order ({totalCartItems})
              </h3>
            </div>
          )}

          <div
            className="cart-section"
            style={{ 
              padding: activeTab === 'cart' ? '16px 12px' : '0 16px 16px 16px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >

            {/* 1. Customer Information Card */}
            <div
              className="form-row cart-phone-row"
              style={{
                background: '#ffffff',
                borderRadius: activeTab === 'cart' ? '16px' : '20px',
                padding: activeTab === 'cart' ? '16px' : '20px',
                marginBottom: activeTab === 'cart' ? '16px' : '20px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
              }}
            >
              <h3 style={{ 
                margin: activeTab === 'cart' ? '0 0 12px 0' : '0 0 16px 0', 
                fontSize: '1.05rem', 
                fontWeight: '700', 
                borderBottom: activeTab === 'cart' ? 'none' : '1.5px solid #f6f3ee', 
                paddingBottom: activeTab === 'cart' ? '0' : '10px' 
              }}>
                Customer Information
              </h3>
              <label
                style={{
                  display: 'block',
                  marginBottom: activeTab === 'cart' ? '6px' : '8px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  color: '#7f766a',
                }}
              >
                WhatsApp Mobile Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
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
                style={{ 
                  padding: activeTab === 'cart' ? '10px 12px' : '12px 14px', 
                  fontSize: '0.95rem', 
                  width: '100%', 
                  borderRadius: '12px', 
                  border: '1.5px solid #e6ded3', 
                  outline: 'none' 
                }}
                maxLength="10"
              />
              {phoneError && (
                <div className="cart-phone-error" role="alert" style={{ color: '#b6412c', fontSize: '0.85rem', marginTop: '6px', fontWeight: '600' }}>
                  {phoneError}
                </div>
              )}
            </div>

            {/* 2. Selected Items Card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: activeTab === 'cart' ? '16px' : '20px',
                padding: activeTab === 'cart' ? '16px' : '20px',
                marginBottom: activeTab === 'cart' ? '16px' : '20px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
              }}
            >
              <h3 style={{ 
                margin: activeTab === 'cart' ? '0 0 12px 0' : '0 0 16px 0', 
                fontSize: '1.05rem', 
                fontWeight: '700', 
                borderBottom: activeTab === 'cart' ? 'none' : '1.5px solid #f6f3ee', 
                paddingBottom: activeTab === 'cart' ? '0' : '10px' 
              }}>
                Selected Items ({totalCartItems})
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: activeTab === 'cart' ? '0' : '14px' }}>
                {cart.length === 0 ? (
                  <div className="empty-cart" style={{ padding: '20px 0', textAlign: 'center' }}>
                    <ShoppingCart size={32} color="#ccc" />
                    <p style={{ color: '#6c757d', marginTop: '12px' }}>
                      Cart is empty
                    </p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: activeTab === 'cart' ? '10px 0' : '0 0 12px 0',
                        borderBottom: '1px solid #f6f3ee',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.98rem', display: 'block', color: '#221f1a' }}>
                          {item.name}
                        </span>
                        <span style={{ color: '#b6412c', fontSize: '0.88rem', fontWeight: '600' }}>
                          {formatCurrency(item.price)} each
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: activeTab === 'cart' ? '8px' : '12px' }}>
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
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              width: activeTab === 'cart' ? '24px' : '26px',
                              height: activeTab === 'cart' ? '24px' : '26px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              color: '#b6412c',
                              fontSize: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
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
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              width: activeTab === 'cart' ? '24px' : '26px',
                              height: activeTab === 'cart' ? '24px' : '26px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              color: '#b6412c',
                              fontSize: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
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
                          <Trash2 size={16} />
                        </button>

                        <strong style={{ 
                          fontSize: '0.95rem', 
                          color: '#221f1a', 
                          minWidth: activeTab === 'cart' ? '65px' : '75px', 
                          textAlign: 'right' 
                        }}>
                          {formatCurrency(item.price * item.quantity)}
                        </strong>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Grand Total section at the bottom of Selected Items card */}
              <div style={{ marginTop: activeTab === 'cart' ? '12px' : '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!isKiosk && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ color: '#7f766a', fontSize: '0.95rem', fontWeight: '600' }}>Apply Discount</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #e6ded3',
                          background: showDiscountInput ? '#f2e7db' : 'transparent',
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
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          min="0"
                          className="form-input"
                          placeholder="Amt"
                          style={{
                            width: '60px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            border: '1px solid #e6ded3',
                            borderRadius: '4px',
                            outline: 'none',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
                {!isKiosk && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: '600' }}>
                    <span style={{ color: '#7f766a' }}>Subtotal</span>
                    <span style={{ color: '#221f1a' }}>{formatCurrency(calculateSubtotal())}</span>
                  </div>
                )}
                {!isKiosk && discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: '600', color: '#b6412c' }}>
                    <span>Discount</span>
                    <span>-{formatCurrency(calculateDiscountAmount())}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: activeTab === 'cart' ? '6px' : '8px',
                    paddingTop: activeTab === 'cart' ? '10px' : '12px',
                    borderTop: '1px solid #f6f3ee',
                    fontSize: activeTab === 'cart' ? '1.15rem' : '1.25rem',
                    fontWeight: '700',
                  }}
                >
                  <span style={{ color: '#221f1a' }}>Grand Total</span>
                  <span style={{ color: '#b6412c' }}>{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </div>

            {/* Render Payment Method and Checkout Button inside scrollable area only for activeTab === 'cart' (mobile view) */}
            {activeTab === 'cart' && (
              <>
                {/* 3. Select Payment Method Card */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    padding: '16px',
                    marginBottom: '16px',
                    border: '1.5px solid #e6ded3',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', fontWeight: '700', borderBottom: 'none', paddingBottom: 0 }}>
                    Select Payment Method
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button 
                      type="button" 
                      onClick={() => setPaymentMethod('upi')} 
                      style={{ 
                        padding: '12px 8px', 
                        borderRadius: '12px', 
                        border: paymentMethod === 'upi' ? '2px solid #b6412c' : '1.5px solid #e6ded3', 
                        background: paymentMethod === 'upi' ? '#fbf7f4' : '#ffffff', 
                        color: paymentMethod === 'upi' ? '#b6412c' : '#7f766a', 
                        fontWeight: '700', 
                        cursor: 'pointer', 
                        fontSize: '0.88rem', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: '4px', 
                        transition: 'all 0.2s',
                        outline: 'none'
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>📱</span>
                      <span>Pay Online (UPI)</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setPaymentMethod('cash')} 
                      style={{ 
                        padding: '12px 8px', 
                        borderRadius: '12px', 
                        border: paymentMethod === 'cash' ? '2px solid #b6412c' : '1.5px solid #e6ded3', 
                        background: paymentMethod === 'cash' ? '#fbf7f4' : '#ffffff', 
                        color: paymentMethod === 'cash' ? '#b6412c' : '#7f766a', 
                        fontWeight: '700', 
                        cursor: 'pointer', 
                        fontSize: '0.88rem', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: '4px', 
                        transition: 'all 0.2s',
                        outline: 'none'
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>💵</span>
                      <span>Pay at Counter</span>
                    </button>
                  </div>
                </div>

                {/* 4. Checkout Button */}
                <button 
                  onClick={() => processSale(paymentMethod)} 
                  disabled={cart.length === 0 || loading} 
                  style={{ 
                    width: '100%', 
                    background: '#b6412c', 
                    color: '#ffffff', 
                    border: 'none', 
                    padding: '14px', 
                    borderRadius: '24px', 
                    fontSize: '1rem', 
                    fontWeight: '700', 
                    cursor: cart.length === 0 || loading ? 'not-allowed' : 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '8px', 
                    boxShadow: '0 4px 14px rgba(182,65,44,0.25)', 
                    opacity: cart.length === 0 || loading ? 0.8 : 1, 
                    transition: 'opacity 0.2s',
                    outline: 'none',
                    marginBottom: '40px'
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Processing Payment...
                    </>
                  ) : isKiosk ? (
                    paymentMethod === 'upi' ? 'Pay & Place Order' : 'Place Order (Pay Cash)'
                  ) : (
                    paymentMethod === 'upi' ? 'Pay & Complete Bill' : 'Complete Bill (Cash)'
                  )}
                </button>
              </>
            )}
          </div>

          {/* Render the legacy billing-section ONLY for desktop view (activeTab !== 'cart') */}
          {activeTab !== 'cart' && (
            <div
              className="billing-section payment-checkout-panel"
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                border: '1.5px solid #e6ded3',
                boxShadow: '0 4px 10px rgba(0,0,0,0.01)',
                marginBottom: '20px',
              }}
            >
              {/* Select Payment Method */}
              <div style={{ background: '#ffffff', borderRadius: '16px', padding: '16px', marginBottom: '20px', border: '1.5px solid #f6f3ee' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '700', borderBottom: '1.5px solid #f6f3ee', paddingBottom: '6px' }}>Select Payment Method</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => setPaymentMethod('upi')} 
                    style={{ 
                      padding: '12px 8px', 
                      borderRadius: '12px', 
                      border: paymentMethod === 'upi' ? '2.5px solid #b6412c' : '1.5px solid #e6ded3', 
                      background: paymentMethod === 'upi' ? '#fbf7f4' : '#ffffff', 
                      color: paymentMethod === 'upi' ? '#b6412c' : '#7f766a', 
                      fontWeight: '700', 
                      cursor: 'pointer', 
                      fontSize: '0.85rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: '4px', 
                      transition: 'all 0.2s',
                      outline: 'none'
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>📱</span>
                    <span>Pay Online (UPI)</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPaymentMethod('cash')} 
                    style={{ 
                      padding: '12px 8px', 
                      borderRadius: '12px', 
                      border: paymentMethod === 'cash' ? '2.5px solid #b6412c' : '1.5px solid #e6ded3', 
                      background: paymentMethod === 'cash' ? '#fbf7f4' : '#ffffff', 
                      color: paymentMethod === 'cash' ? '#b6412c' : '#7f766a', 
                      fontWeight: '700', 
                      cursor: 'pointer', 
                      fontSize: '0.85rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: '4px', 
                      transition: 'all 0.2s',
                      outline: 'none'
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>💵</span>
                    <span>Pay at Counter</span>
                  </button>
                </div>
              </div>

              {/* Checkout Button */}
              <button 
                onClick={() => processSale(paymentMethod)} 
                disabled={cart.length === 0 || loading} 
                style={{ 
                  width: '100%', 
                  background: '#b6412c', 
                  color: '#ffffff', 
                  border: 'none', 
                  padding: '14px', 
                  borderRadius: '24px', 
                  fontSize: '1rem', 
                  fontWeight: '700', 
                  cursor: cart.length === 0 || loading ? 'not-allowed' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px', 
                  boxShadow: '0 6px 20px rgba(182,65,44,0.3)', 
                  opacity: cart.length === 0 || loading ? 0.8 : 1, 
                  transition: 'opacity 0.2s',
                  outline: 'none'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Processing Payment...
                  </>
                ) : isKiosk ? (
                  paymentMethod === 'upi' ? 'Pay & Place Order' : 'Place Order (Pay Cash)'
                ) : (
                  paymentMethod === 'upi' ? 'Pay & Complete Bill' : 'Complete Bill (Cash)'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Mobile Navigation */}
      {!isKiosk && (
        <div className="mobile-nav-bar">
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
        </div>
      )}

      {/* Floating Cart Banner for Mobile */}
      {totalCartItems > 0 && activeTab === 'menu' && (
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

      {/* UPI QR Modal */}
      {upiQrPayment && (
        <div
          className="upi-qr-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="UPI QR payment"
        >
          <div className="upi-qr-sheet">
            <div className="upi-qr-header">
              <div className="upi-qr-title-wrap">
                <span className="upi-qr-icon">
                  <QrCode size={20} />
                </span>
                <div>
                  <h3>Scan UPI QR to Pay</h3>
                  <p>Order #{upiQrPayment.orderId}</p>
                </div>
              </div>
              <button
                type="button"
                className="upi-qr-close"
                onClick={closeUpiQrPayment}
                aria-label="Close UPI QR"
              >
                <X size={18} />
              </button>
            </div>

            <div className="upi-qr-body">
              <div className="upi-qr-amount-card">
                <span>Amount to Pay</span>
                <strong>{formatCurrency(upiQrPayment.amount)}</strong>
              </div>

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

              <div className="upi-qr-status">
                <Loader2 size={16} className="spin" />
                <span>{upiQrStatus || 'Waiting for payment...'}</span>
              </div>
            </div>

            <div className="upi-qr-actions">
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
