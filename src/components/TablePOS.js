import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import PropTypes from 'prop-types';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  Calculator,
  ArrowLeft,
  Clock,
  Save,
  Package,
  ArrowRight,
} from 'lucide-react';
import { getLocalDateTimeString } from '../utils/dateUtils';
import { dbService } from '../services/dbService';
import { whatsappService } from '../services/whatsappService';
import { APP_CONFIG } from '../config';
import { playSuccessFeedback, playErrorFeedback } from '../utils/feedbackUtils';

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const TablePOS = ({ table, onBack, onTableUpdate }) => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [tax, setTax] = useState(0);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const searchInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('menu'); // 'menu' or 'cart' for mobile view
  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const noticeTimeoutRef = useRef(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState('');
  const [activeQrId, setActiveQrId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('creating');
  const pollingIntervalRef = useRef(null);

  const loadTableOrder = useCallback(async () => {
    try {
      const tableOrder = await dbService.getTableOrder(table.id);
      if (tableOrder) {
        setCart(tableOrder.items || []);
        setCustomerName(tableOrder.customer_name || '');
        setCustomerPhone(tableOrder.customer_phone || '');
        setDiscount(tableOrder.discount || 0);
        setTax(tableOrder.tax || 0);
      }
    } catch (error) {
      // Failed to load table order
      setCart([]);
    }
  }, [table.id]);

  useEffect(() => {
    loadProducts();
    loadTableOrder();
    loadBarSettings();
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }

    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [loadTableOrder]);

  const loadBarSettings = async () => {
    try {
      const settings = await dbService.getBarSettings();
      // No setSendWhatsapp state exists, so we just set settings
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
            12000
          );
        }
      } catch (waErr) {
        showNotice(
          'warning',
          'Warning: Could not connect to WhatsApp relay. Please check your settings.',
          12000
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

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.sku || '').toLowerCase().includes(term) ||
        (product.barcode && product.barcode.includes(term))
    );
  }, [products, searchTerm]);

  const addToCart = async (product) => {
    const existingItem = cart.find((item) => item.id === product.id);
    let newCart;

    if (existingItem) {
      newCart = cart.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      setCart(newCart);
    } else {
      newCart = [
        ...cart,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          maxStock: product.counter_stock,
        },
      ];
      setCart(newCart);
    }

    // Auto-save the order after adding product
    await autoSaveOrder(newCart);

    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const autoSaveOrder = async (currentCart) => {
    setAutoSaving(true);
    try {
      const subtotal = currentCart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const taxAmount = (subtotal * tax) / 100;
      const discountAmount = (subtotal * discount) / 100;
      const total = subtotal + taxAmount - discountAmount;

      const orderData = {
        table_id: table.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        items: currentCart,
        discount,
        tax,
        notes: '',
        subtotal,
        total,
        kot_printed: false,
      };

      await dbService.saveTableOrder(orderData);

      // Update table status
      const tableUpdate = {
        status: currentCart.length > 0 ? 'occupied' : 'available',
        current_bill_amount: total,
      };

      await dbService.updateTable(table.id, tableUpdate);
      onTableUpdate({ ...table, ...tableUpdate });
    } catch (error) {
      // Failed to auto-save order
    } finally {
      setAutoSaving(false);
    }
  };

  const updateQuantity = async (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const newCart = cart.map((item) =>
      item.id === productId ? { ...item, quantity: newQuantity } : item
    );
    setCart(newCart);

    // Auto-save the order after updating quantity
    await autoSaveOrder(newCart);
  };

  const removeFromCart = async (productId) => {
    const newCart = cart.filter((item) => item.id !== productId);
    setCart(newCart);

    // Auto-save the order after removing item
    await autoSaveOrder(newCart);
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const calculateTaxAmount = () => {
    return (calculateSubtotal() * tax) / 100;
  };

  const calculateDiscountAmount = () => {
    return (calculateSubtotal() * discount) / 100;
  };

  const calculateTotal = () => {
    return (
      calculateSubtotal() + calculateTaxAmount() - calculateDiscountAmount()
    );
  };

  const generateSaleNumber = async () => {
    // Generate a sequential order number based on total sales
    const allSales = (await dbService.getSales()) || [];
    return (allSales.length + 1).toString();
  };

  const savePendingBill = async () => {
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    // Validate required fields for pending bills
    const errors = [];

    if (!customerName || customerName.trim() === '') {
      errors.push('Customer name');
    }

    if (!customerPhone || customerPhone.trim() === '') {
      errors.push('Customer phone number');
    } else if (
      customerPhone.trim().length !== 10 ||
      !/^\d{10}$/.test(customerPhone.trim())
    ) {
      alert('Phone number must be exactly 10 digits!');
      return;
    }

    if (errors.length > 0) {
      alert(
        `${errors.join(' and ')} ${errors.length > 1 ? 'are' : 'is'} mandatory for pending bills!`
      );
      return;
    }

    setLoading(true);
    try {
      const billData = {
        billNumber: await generateSaleNumber(),
        saleType: 'table',
        tableNumber: table.name,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: cart.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        subtotal: calculateSubtotal(),
        taxAmount: calculateTaxAmount(),
        discountAmount: calculateDiscountAmount(),
        totalAmount: calculateTotal(),
        paymentMethod,
        notes: '',
      };

      await dbService.addPendingBill(billData);
      alert('Bill saved as pending!');

      // Clear cart and customer info
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscount(0);
      setTax(0);
      setActiveTab('menu');

      // Clear table order
      await dbService.clearTableOrder(table.id);

      // Update table status
      await dbService.updateTable(table.id, {
        status: 'available',
        current_bill_amount: 0,
      });

      onTableUpdate({ ...table, status: 'available', current_bill_amount: 0 });
    } catch (error) {
      // Failed to save pending bill
      alert('Failed to save pending bill. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const saveTableOrder = async () => {
    try {
      const orderData = {
        table_id: table.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        items: cart,
        discount,
        tax,
        notes: '',
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        kot_printed: false,
      };

      await dbService.saveTableOrder(orderData);

      // Update table status
      const tableUpdate = {
        status: cart.length > 0 ? 'occupied' : 'available',
        current_bill_amount: calculateTotal(),
      };

      await dbService.updateTable(table.id, tableUpdate);
      onTableUpdate({ ...table, ...tableUpdate });

      alert('Order saved successfully!');
    } catch (error) {
      // Failed to save table order
      alert('Failed to save order. Please try again.');
    }
  };

  const executeSaleWrite = async () => {
    setLoading(true);
    try {
      const saleData = {
        saleNumber: await generateSaleNumber(),
        tableId: table.id,
        tableName: table.name,
        customerName: customerName || 'Table Customer',
        customerPhone,
        items: cart.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
        })),
        subtotal: calculateSubtotal(),
        taxAmount: calculateTaxAmount(),
        discountAmount: calculateDiscountAmount(),
        totalAmount: calculateTotal(),
        paymentMethod,
        notes: '',
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      await dbService.createSale(saleData);

      // Clear table order
      await dbService.clearTableOrder(table.id);

      // Update table status
      await dbService.updateTable(table.id, {
        status: 'available',
        current_bill_amount: 0,
      });

      // Auto-print bill to default printer if enabled
      if (barSettings && barSettings.printing_enabled === 1) {
        await printBill(saleData);
      }

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
      setDiscount(0);
      setTax(0);
      setActiveTab('menu');

      await loadProducts();
      onTableUpdate({ ...table, status: 'available', current_bill_amount: 0 });

      // Trigger dashboard refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent('saleCompleted'));
      playSuccessFeedback();
      showNotice('success', 'Order Placed! Check WhatsApp for receipt.');
    } catch (error) {
      // Failed to process sale
      console.error('Table POS sale write error:', error);
      playErrorFeedback();
      showNotice('error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const processSale = async () => {
    if (cart.length === 0) {
      alert('Cart is empty!');
      return;
    }

    // Check if payment method is UPI and automated Razorpay checkout is enabled
    const isRazorpayEnabled = barSettings && barSettings.razorpay_enabled === 1;
    if (paymentMethod === 'upi' && isRazorpayEnabled) {
      const cleanedPhone = customerPhone.replace(/\D/g, '');
      if (!cleanedPhone || cleanedPhone.length !== 10) {
        showNotice(
          'error',
          'Please enter a valid 10-digit phone number for UPI payment.',
          6000
        );
        if (phoneInputRef.current) {
          phoneInputRef.current.focus();
        }
        return;
      }
      startRazorpayPayment();
      return;
    }

    executeSaleWrite();
  };

  const startRazorpayPayment = async () => {
    setPaymentModalOpen(true);
    setPaymentStatus('creating');
    setPaymentQrUrl('');
    setActiveQrId('');

    const relayUrl =
      barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();

      // Call relay to create QR code
      const response = await fetch(`${relayUrl}/payment/create-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          orderId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPaymentQrUrl(data.qrImageUrl);
        setActiveQrId(data.qrCodeId);
        setPaymentStatus('pending');

        // Start polling for payment status
        startPollingPayment(data.qrCodeId, relayUrl);
      } else {
        setPaymentStatus('error');
        showNotice(
          'error',
          `Failed to create Razorpay QR: ${data.error}`,
          6000
        );
      }
    } catch (err) {
      setPaymentStatus('error');
      showNotice(
        'error',
        `Error connecting to payment relay: ${err.message}`,
        6000
      );
    }
  };

  const startPollingPayment = (qrCodeId, relayUrl) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${relayUrl}/payment/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qrCodeId,
          }),
        });

        const data = await response.json();
        if (data.success && data.paid) {
          clearInterval(pollingIntervalRef.current);
          setPaymentStatus('success');

          // Wait 1 second to show success state, then complete checkout
          setTimeout(() => {
            setPaymentModalOpen(false);
            executeSaleWrite();
          }, 1000);
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 2000);
  };

  const cancelRazorpayPayment = () => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    setPaymentModalOpen(false);
  };

  const printBill = async (billData) => {
    try {
      const result = await dbService.printBill(billData);
      if (result.success) {
        alert('Bill printed successfully!');
      } else {
        alert(`Print failed: ${result.error}`);
      }
    } catch (error) {
      // Print error
      alert('Failed to print bill');
    }
  };

  const exportPDF = async (billData) => {
    try {
      const result = await dbService.exportPDF(billData);
      if (result.success) {
        alert(`PDF saved to: ${result.filePath}`);
      } else {
        alert(`PDF export failed: ${result.error}`);
      }
    } catch (error) {
      // PDF export error
      alert('Failed to export PDF');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
    }
  };

  return (
    <div className="table-pos">
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
                  {notice.type === 'success' ? 'Success' : 'Error'}
                </strong>
                <span>{notice.message}</span>
              </>
            )}
          </div>
        </div>
      )}
      <div
        className="kiosk-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '16px 14px 12px',
          background: '#f6f3ee',
          borderBottom: '1px solid #e6ded3',
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
          <button
            onClick={onBack}
            style={{
              background: '#ffffff',
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
              transition: 'all 0.2s ease',
            }}
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>

          <div
            style={{
              height: '36px',
              width: '36px',
              borderRadius: '50%',
              flexShrink: 0,
              overflow: 'hidden',
              background: '#ffffff',
              border: '1.5px solid #e6ded3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#b6412c',
            }}
          >
            <ShoppingCart size={18} />
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
              {table.name}
            </span>
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
              {table.area === 'restaurant' ? 'Restaurant' : 'Bar'}{' '}
              {barSettings?.bar_name && `- ${barSettings.bar_name}`}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <span
              className={`status-badge ${table.status}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: '700',
                background:
                  table.status === 'occupied'
                    ? '#fef2f2'
                    : table.status === 'reserved'
                      ? '#fef3c7'
                      : '#f0fdf4',
                color:
                  table.status === 'occupied'
                    ? '#dc2626'
                    : table.status === 'reserved'
                      ? '#d97706'
                      : '#16a34a',
                textTransform: 'capitalize',
              }}
            >
              {table.status}
            </span>
            {autoSaving && (
              <div
                className="auto-save-indicator"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#059669',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                }}
              >
                <Save
                  size={16}
                  className="spinning"
                  style={{ animation: 'spin 1s linear infinite' }}
                />
                <span>Saving</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pos-layout">
        {/* Left Panel - Product Search and Selection */}
        <div
          className={`product-panel ${activeTab === 'cart' ? 'mobile-hidden' : ''}`}
        >
          <div
            className="pos-header-minimal"
            style={{ padding: '12px 14px 8px' }}
          >
            <div
              className="search-input-container"
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
                onKeyPress={handleKeyPress}
                className="search-input"
                style={{
                  background: 'transparent',
                  border: 'none',
                  width: '100%',
                  outline: 'none',
                  fontSize: '0.95rem',
                  color: '#221f1a',
                }}
              />
            </div>
          </div>
          <div className="products-grid">
            {filteredProducts.slice(0, 12).map((product) => (
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
                    <div className="minimal-card-placeholder">
                      <Package size={32} />
                    </div>
                  )}
                </div>
                <div className="minimal-card-info">
                  <h4 className="minimal-card-name" title={product.name}>
                    {product.name}
                  </h4>
                  <p className="minimal-card-price">
                    ₹{product.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Cart and Billing */}
        <div
          className={`cart-panel cart-panel-minimal ${activeTab === 'menu' ? 'mobile-hidden' : ''}`}
        >
          <div className="cart-section" style={{ paddingTop: '16px' }}>
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
                Order ({cart.length} items)
              </h3>
            </div>

            <div
              className="form-row"
              style={{ marginTop: '16px', marginBottom: '16px' }}
            >
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={customerPhone}
                ref={phoneInputRef}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  if (value.length <= 10) {
                    setCustomerPhone(value);
                  }
                }}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                maxLength="10"
              />
            </div>

            <div className="cart-section">
              <div className="cart-items">
                {cart.length === 0 ? (
                  <div className="empty-cart" style={{ padding: '40px 0' }}>
                    <ShoppingCart size={32} color="#adb5bd" />
                    <p style={{ color: '#6c757d', marginTop: '12px' }}>
                      Cart is empty
                    </p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="cart-item-minimal">
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <h4
                            style={{
                              margin: 0,
                              flex: 1,
                              fontSize: '14px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.name}
                          </h4>
                          <div
                            className="quantity-controls"
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
                            <span
                              style={{ margin: '0 8px', fontWeight: 'bold' }}
                            >
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
                          <div
                            className="item-total"
                            style={{
                              minWidth: '60px',
                              textAlign: 'right',
                              fontWeight: 'bold',
                            }}
                          >
                            {formatCurrency(item.price * item.quantity)}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <p
                            className="cart-item-minimal-unit-price"
                            style={{
                              margin: 0,
                              fontSize: '11px',
                              color: '#6c757d',
                            }}
                          >
                            {formatCurrency(item.price)} each
                          </p>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="remove-btn"
                            style={{
                              padding: '0',
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div
              className="billing-section"
              style={{
                background: '#fff',
                borderRadius: '16px',
                border: '1px solid #e6ded3',
                overflow: 'hidden',
              }}
            >
              <div
                className="billing-controls"
                style={{
                  padding: '16px 12px',
                  borderTop: '2px solid #e5e7eb',
                  background: '#f9fafb',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        fontSize: '0.95rem',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        background: showDiscountInput ? '#ef4444' : '#f3f4f6',
                        color: showDiscountInput ? 'white' : '#344054',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
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
                        placeholder="0%"
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          fontSize: '0.95rem',
                          borderRadius: '8px',
                          border: '2px solid #ef4444',
                          fontWeight: '600',
                          textAlign: 'center',
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <label
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        color: '#344054',
                        margin: 0,
                      }}
                    >
                      Payment:
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        borderRadius: '8px',
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23344054' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 10px center',
                        paddingRight: '32px',
                      }}
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="card">💳 Card</option>
                      <option value="upi">📱 UPI</option>
                      <option value="cheque">✓ Cheque</option>
                    </select>
                  </div>
                </div>
              </div>

              <div
                className="bill-summary"
                style={{
                  padding: '16px 12px',
                  background: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  margin: '12px 0',
                }}
              >
                <div
                  className="summary-line"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid #f3f4f6',
                    fontSize: '1rem',
                  }}
                >
                  <span style={{ color: '#64748b', fontWeight: '500' }}>
                    Subtotal:
                  </span>
                  <span
                    style={{
                      fontWeight: '700',
                      color: '#111827',
                      fontSize: '1.1rem',
                    }}
                  >
                    ₹{calculateSubtotal().toFixed(2)}
                  </span>
                </div>
                {discount > 0 && (
                  <div
                    className="summary-line discount"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: '1px solid #f3f4f6',
                      fontSize: '1rem',
                      color: '#059669',
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>
                      Discount ({discount}%):
                    </span>
                    <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                      -₹{calculateDiscountAmount().toFixed(2)}
                    </span>
                  </div>
                )}
                {tax > 0 && (
                  <div
                    className="summary-line tax"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: '1px solid #f3f4f6',
                      fontSize: '1rem',
                      color: '#7c3aed',
                    }}
                  >
                    <span style={{ fontWeight: '600' }}>Tax ({tax}%):</span>
                    <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                      ₹{calculateTaxAmount().toFixed(2)}
                    </span>
                  </div>
                )}
                <div
                  className="summary-line total"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 0',
                    marginTop: '6px',
                    fontSize: '1.4rem',
                    fontWeight: '800',
                    color: '#ef4444',
                    borderTop: '2px solid #ef4444',
                  }}
                >
                  <span>TOTAL:</span>
                  <span>₹{calculateTotal().toFixed(2)}</span>
                </div>
              </div>

              <div
                className="action-buttons"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <button
                  onClick={saveTableOrder}
                  disabled={cart.length === 0}
                  style={{
                    padding: '14px 16px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: cart.length === 0 ? '#e5e7eb' : '#f3f4f6',
                    color: cart.length === 0 ? '#9ca3af' : '#344054',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (cart.length > 0) {
                      e.currentTarget.style.background = '#e5e7eb';
                      e.currentTarget.style.borderColor = '#9ca3af';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (cart.length > 0) {
                      e.currentTarget.style.background = '#f3f4f6';
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }
                  }}
                >
                  <Save size={20} />
                  Save
                </button>

                <button
                  onClick={savePendingBill}
                  disabled={cart.length === 0 || loading}
                  style={{
                    padding: '14px 16px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: '1px solid #fbbf24',
                    background:
                      cart.length === 0 || loading ? '#fef3c7' : '#fef08a',
                    color: cart.length === 0 ? '#b45309' : '#92400e',
                    cursor:
                      cart.length === 0 || loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    opacity: loading ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (cart.length > 0 && !loading) {
                      e.currentTarget.style.background = '#fcd34d';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (cart.length > 0 && !loading) {
                      e.currentTarget.style.background = '#fef08a';
                    }
                  }}
                >
                  <Clock size={20} />
                  {loading ? 'Saving...' : 'Pending'}
                </button>

                <button
                  onClick={processSale}
                  disabled={cart.length === 0 || loading}
                  style={{
                    padding: '14px 16px',
                    fontSize: '1rem',
                    fontWeight: '700',
                    borderRadius: '8px',
                    border: 'none',
                    background: cart.length === 0 ? '#fca5a5' : '#ef4444',
                    color: 'white',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow:
                      cart.length === 0
                        ? 'none'
                        : '0 4px 12px rgba(239, 68, 68, 0.3)',
                    opacity: loading ? 0.8 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (cart.length > 0 && !loading) {
                      e.currentTarget.style.background = '#dc2626';
                      e.currentTarget.style.boxShadow =
                        '0 6px 16px rgba(239, 68, 68, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (cart.length > 0 && !loading) {
                      e.currentTarget.style.background = '#ef4444';
                      e.currentTarget.style.boxShadow =
                        '0 4px 12px rgba(239, 68, 68, 0.3)';
                    }
                  }}
                >
                  <Calculator size={20} />
                  {loading ? 'Processing...' : 'Process Sale'}
                </button>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Mobile Navigation */}
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

          {/* Floating Cart Banner for Mobile */}
          {totalCartItems > 0 && activeTab === 'menu' && (
            <div
              className="mobile-cart-floating-bar"
              onClick={() => setActiveTab('cart')}
            >
              <div className="bar-info">
                <ShoppingCart size={20} />
                <span>
                  {totalCartItems} {totalCartItems === 1 ? 'item' : 'items'} |{' '}
                  {formatCurrency(calculateTotal())}
                </span>
              </div>
              <div className="bar-action">
                <span>View Cart</span>
                <ArrowRight size={18} />
              </div>
            </div>
          )}
        </div>

        {paymentModalOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
              padding: '20px',
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '30px',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%',
              }}
            >
              <h3
                style={{
                  margin: '0 0 15px 0',
                  fontSize: '1.3rem',
                  color: '#333',
                }}
              >
                UPI Payment Verification
              </h3>
              <p
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  margin: '0 0 20px 0',
                  color: '#333',
                }}
              >
                Amount: ₹{calculateTotal().toFixed(2)}
              </p>

              {paymentStatus === 'creating' && (
                <div style={{ padding: '40px 0' }}>
                  <div
                    className="spinning"
                    style={{
                      border: '4px solid #f3f3f3',
                      borderTop: '4px solid #3498db',
                      borderRadius: '50%',
                      width: '40px',
                      height: '40px',
                      margin: '0 auto 15px auto',
                    }}
                  ></div>
                  <p style={{ margin: 0, color: '#666' }}>
                    Generating dynamic UPI QR code...
                  </p>
                </div>
              )}

              {paymentStatus === 'pending' && paymentQrUrl && (
                <div>
                  <p
                    style={{
                      fontSize: '0.9rem',
                      color: '#666',
                      margin: '0 0 15px 0',
                    }}
                  >
                    Scan this QR code using GPay, PhonePe, Paytm, or any UPI
                    app:
                  </p>
                  <img
                    src={paymentQrUrl}
                    alt="Razorpay UPI QR"
                    style={{
                      width: '200px',
                      height: '200px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      margin: '0 auto 15px auto',
                      display: 'block',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#f57c00',
                      fontWeight: 'bold',
                    }}
                  >
                    <div
                      className="spinning"
                      style={{
                        border: '2px solid #f3f3f3',
                        borderTop: '2px solid #f57c00',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                      }}
                    ></div>
                    Waiting for customer payment...
                  </div>
                </div>
              )}

              {paymentStatus === 'success' && (
                <div style={{ padding: '40px 0', color: '#2e7d32' }}>
                  <div style={{ fontSize: '3rem', margin: '0 0 15px 0' }}>
                    ✓
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 'bold',
                      fontSize: '1.2rem',
                    }}
                  >
                    Payment Successful!
                  </p>
                  <p style={{ margin: '5px 0 0 0', color: '#666' }}>
                    Completing checkout...
                  </p>
                </div>
              )}

              {paymentStatus === 'error' && (
                <div style={{ padding: '40px 0', color: '#d32f2f' }}>
                  <div style={{ fontSize: '3rem', margin: '0 0 15px 0' }}>
                    ✗
                  </div>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>
                    Payment Failed
                  </p>
                  <p style={{ margin: '10px 0 0 0' }}>
                    <button
                      onClick={() => startRazorpayPayment()}
                      className="btn btn-secondary"
                      style={{ padding: '8px 15px' }}
                    >
                      Retry QR Code
                    </button>
                  </p>
                </div>
              )}

              <div
                style={{
                  marginTop: '25px',
                  borderTop: '1px solid #eee',
                  paddingTop: '20px',
                }}
              >
                <button
                  onClick={cancelRazorpayPayment}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderColor: '#d32f2f',
                    color: '#d32f2f',
                  }}
                >
                  Cancel Checkout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

TablePOS.propTypes = {
  table: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    area: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
  }).isRequired,
  onBack: PropTypes.func.isRequired,
  onTableUpdate: PropTypes.func.isRequired,
};

export default TablePOS;
