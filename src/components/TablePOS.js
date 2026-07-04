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
import { playSuccessFeedback, playErrorFeedback } from '../utils/feedbackUtils';

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const TablePOS = ({ table, onBack, onTableUpdate }) => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [tax, setTax] = useState(0);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const searchInputRef = useRef(null);
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

      // Clear cart and customer info
      setCart([]);
      setCustomerName('');
      setDiscount(0);
      setTax(0);
      setActiveTab('menu');

      await loadProducts();
      onTableUpdate({ ...table, status: 'available', current_bill_amount: 0 });

      // Trigger dashboard refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent('saleCompleted'));
      playSuccessFeedback();
      showNotice('success', 'Order placed!');
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

    if (!customerName.trim()) {
      alert('Please enter customer name!');
      return;
    }
    // Check if payment method is UPI and direct VPA configured
    const isUpiEnabled = barSettings && !!barSettings.upi_vpa;
    if (paymentMethod === 'upi' && isUpiEnabled) {
      startUpiPayment();
      return;
    }

    executeSaleWrite();
  };

  const startUpiPayment = async () => {
    setPaymentModalOpen(true);
    setPaymentStatus('pending');
    setPaymentQrUrl('');

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();

      if (barSettings && barSettings.upi_vpa) {
        const upiUri = `upi://pay?pa=${encodeURIComponent(barSettings.upi_vpa)}&pn=${encodeURIComponent(
          barSettings.bar_name || ''
        )}&am=${encodeURIComponent(Number(amount).toFixed(2))}&cu=INR&tn=${encodeURIComponent('Order ' + orderId)}`;
        const qrImage = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
        setPaymentQrUrl(qrImage);
      } else {
        throw new Error("No Merchant UPI VPA is configured.");
      }
    } catch (err) {
      setPaymentStatus('error');
      showNotice(
        'error',
        `Failed to generate local QR: ${err.message}`,
        6000
      );
    }
  };

  const cancelUpiPayment = () => {
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

              <div
                className="bill-summary payment-total-card cart-summary-card"
                style={{ borderTop: '1px solid #e6ded3', paddingTop: '12px' }}
              >
                <div
                  className="summary-line cart-summary-row"
                  style={{ fontSize: '12px', marginBottom: '4px' }}
                >
                  <span style={{ color: '#7f766a' }}>Subtotal:</span>
                  <span style={{ color: '#221f1a', fontWeight: '500' }}>
                    {formatCurrency(calculateSubtotal())}
                  </span>
                </div>
                {discount > 0 && (
                  <div
                    className="summary-line discount cart-summary-row"
                    style={{
                      fontSize: '12px',
                      marginBottom: '4px',
                      color: '#b6412c',
                    }}
                  >
                    <span>Discount ({discount}%):</span>
                    <span>-{formatCurrency(calculateDiscountAmount())}</span>
                  </div>
                )}
                {tax > 0 && (
                  <div
                    className="summary-line tax cart-summary-row"
                    style={{
                      fontSize: '12px',
                      marginBottom: '4px',
                      color: '#7c3aed',
                    }}
                  >
                    <span>Tax ({tax}%):</span>
                    <span>{formatCurrency(calculateTaxAmount())}</span>
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
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px', padding: '0 10px' }}
              >
                {[
                  { id: 'cash', label: 'Cash', icon: '💵' },
                  { id: 'card', label: 'Card', icon: '💳' },
                  { id: 'upi', label: 'UPI', icon: '📱' },
                  { id: 'cheque', label: 'Cheque', icon: '✓' }
                ].map(method => (
                  <button
                    key={method.id}
                    className={`payment-method-chip ${paymentMethod === method.id ? 'active' : ''}`}
                    onClick={() => setPaymentMethod(method.id)}
                    style={{
                      padding: '8px 4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      borderRadius: '8px',
                      border: '1px solid #e6ded3',
                      background: paymentMethod === method.id ? '#f2e7db' : '#ffffff',
                      color: paymentMethod === method.id ? '#b6412c' : '#7f766a',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{method.icon}</span>
                    {method.label}
                  </button>
                ))}
              </div>

              <div
                className="action-buttons"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '8px',
                  padding: '10px',
                  marginTop: '10px',
                  borderTop: '1px solid #e6ded3',
                  background: '#fffdf8',
                }}
              >
                <button
                  onClick={saveTableOrder}
                  disabled={cart.length === 0}
                  className="btn btn-secondary"
                  style={{
                    padding: '10px 8px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Save size={14} />
                  Save
                </button>

                <button
                  onClick={savePendingBill}
                  disabled={cart.length === 0 || loading}
                  className="btn"
                  style={{
                    padding: '10px 8px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    background: cart.length === 0 || loading ? '#fef3c7' : '#fef08a',
                    color: cart.length === 0 ? '#b45309' : '#92400e',
                    border: '1px solid #fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Clock size={14} />
                  {loading ? 'Saving...' : 'Pending'}
                </button>

                <button
                  onClick={processSale}
                  disabled={cart.length === 0 || loading}
                  className="btn btn-primary"
                  style={{
                    padding: '10px 8px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Calculator size={14} />
                  {loading ? 'Processing...' : 'Complete'}
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
                    alt="UPI QR"
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
                      onClick={() => startUpiPayment()}
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
                  onClick={cancelUpiPayment}
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
