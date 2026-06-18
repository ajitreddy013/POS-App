import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Calculator,
  Lock,
  ArrowRight,
  Package,
} from "lucide-react";
import { getLocalDateTimeString } from "../utils/dateUtils";
import { dbService } from "../services/dbService";
import { whatsappService } from "../services/whatsappService";
import { APP_CONFIG } from "../config";
import { playSuccessFeedback, playErrorFeedback } from "../utils/feedbackUtils";

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const POSSystem = ({ isKiosk, onOpenUnlockModal }) => {
  const [products, setProducts] = useState([]);
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimerRef = useRef(null);

  const startLongPress = () => {
    setLongPressActive(true);
    longPressTimerRef.current = setTimeout(() => {
      if (onOpenUnlockModal) onOpenUnlockModal();
      setLongPressActive(false);
    }, 3000); // 3 seconds
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    setLongPressActive(false);
  };
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [discount, setDiscount] = useState(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState("menu"); // 'menu' or 'cart' for mobile view
  const searchInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [activeQrId, setActiveQrId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("creating");
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    loadProducts();
    loadBarSettings();

    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
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
      const settings = await dbService.getBarSettings();
      setBarSettings(settings);
      
      // Check if WhatsApp is linked and active
      try {
        const relayUrl = settings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
        const data = await whatsappService.getStatus(relayUrl);
        if (data && data.status !== "CONNECTED") {
          showNotice("warning", "Warning: WhatsApp is not linked. Please link your device in Settings to send receipts.", 12000);
        }
      } catch (waErr) {
        showNotice("warning", "Warning: Could not connect to WhatsApp relay. Please check your settings.", 12000);
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

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.sku || "").toLowerCase().includes(term) ||
        (product.barcode && product.barcode.includes(term))
    );
  }, [products, searchTerm]);

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
          image: product.image || "",
          quantity: 1,
          maxStock: product.counter_stock,
        },
      ]);
    }

    // Clear search
    setSearchTerm("");
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
    // Generate a sequential order number based on total sales
    const allSales = await dbService.getSales() || [];
    return (allSales.length + 1).toString();
  };


  const executeSaleWrite = async (selectedMethod) => {
    setLoading(true);
    try {
      const saleData = {
        saleNumber: await generateSaleNumber(),
        saleType: "parcel",
        tableNumber: null,
        customerName: isKiosk ? "Kiosk Customer" : (customerName || "Walk-in Customer"),
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

      // Save sale to database
      await dbService.createSale(saleData);

      // Auto-send WhatsApp receipt silently if customer phone is available
      if (customerPhone && customerPhone.trim() !== "") {
        try {
          const relayUrl = APP_CONFIG.whatsappRelayUrl;
          await whatsappService.sendBill(relayUrl, barSettings || {}, saleData);
        } catch (waErr) {
          // Silent fail — WhatsApp is optional
        }
      }

      // Clear cart and customer info
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount(0);
      setShowDiscountInput(false);
      setActiveTab("menu");

      // Reload products to update stock
      await loadProducts();

      // Trigger dashboard refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent("saleCompleted"));
      playSuccessFeedback();
      showNotice("success", "Order Placed! Check WhatsApp for receipt.");
    } catch (error) {
      // Failed to process sale
      console.error("Sale write error:", error);
      playErrorFeedback();
      showNotice("error", "error");
    } finally {
      setLoading(false);
    }
  };

  const processSale = async (method) => {
    if (cart.length === 0) {
      showNotice("error", "Cart is empty.", 4000);
      return;
    }

    const cleanedPhone = customerPhone.replace(/\D/g, "");
    if (!cleanedPhone || cleanedPhone.length !== 10) {
      showNotice("error", "Please enter a valid 10-digit phone number to complete your order.", 6000);
      if (phoneInputRef.current) {
        phoneInputRef.current.focus();
      }
      return;
    }

    const selectedMethod = method || paymentMethod;
    if (method) {
      setPaymentMethod(method);
    }

    // Check if payment method is UPI and automated Razorpay checkout is enabled
    const isRazorpayEnabled = barSettings && barSettings.razorpay_enabled === 1;
    if (selectedMethod === "upi" && isRazorpayEnabled) {
      startRazorpayPayment(selectedMethod);
      return;
    }

    executeSaleWrite(selectedMethod);
  };

  const startRazorpayPayment = async (selectedMethod) => {
    setPaymentModalOpen(true);
    setPaymentStatus("creating");
    setPaymentQrUrl("");
    setActiveQrId("");
    
    const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();

      const response = await fetch(`${relayUrl}/payment/create-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          orderId,
          keyId: barSettings?.razorpay_key_id,
          keySecret: barSettings?.razorpay_key_secret
        })
      });

      const data = await response.json();
      if (data.success) {
        setPaymentQrUrl(data.qrImageUrl);
        setActiveQrId(data.qrCodeId);
        setPaymentStatus("pending");
        
        startPollingPayment(data.qrCodeId, relayUrl, selectedMethod);
      } else {
        setPaymentStatus("error");
        showNotice("error", `Failed to create UPI QR: ${data.error}`, 6000);
      }
    } catch (err) {
      setPaymentStatus("error");
      showNotice("error", `Error connecting to payment relay: ${err.message}`, 6000);
    }
  };

  const startPollingPayment = (qrCodeId, relayUrl, selectedMethod) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${relayUrl}/payment/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrCodeId,
            keyId: barSettings?.razorpay_key_id,
            keySecret: barSettings?.razorpay_key_secret
          })
        });

        const data = await response.json();
        if (data.success && data.paid) {
          clearInterval(pollingIntervalRef.current);
          setPaymentStatus("success");
          
          setTimeout(() => {
            setPaymentModalOpen(false);
            executeSaleWrite(selectedMethod);
          }, 1000);
        }
      } catch (err) {
        console.error("Error polling payment status:", err);
      }
    }, 2000);
  };

  const cancelRazorpayPayment = () => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    setPaymentModalOpen(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
    }
  };

  return (
    <div className="pos-system" style={{ position: 'relative' }}>
      {isKiosk && (
        <button
          onMouseDown={startLongPress}
          onMouseUp={cancelLongPress}
          onMouseLeave={cancelLongPress}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: longPressActive ? '#ef4444' : '#f8f9fa',
            color: longPressActive ? 'white' : '#7f8c8d',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'all 0.2s',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          title="Hold for 3 seconds to unlock Admin mode"
        >
          <Lock size={18} />
        </button>
      )}
      {notice && (
        <div className={`pos-notice pos-notice-${notice.type}`}>
          <div className="pos-notice-bar" />
          <div className="pos-notice-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 16px' }}>
            {notice.message === "success" || notice.message === "error" ? (
              <strong style={{ fontSize: '15px', color: notice.type === "success" ? "#166534" : "#b91c1c", textTransform: 'uppercase', margin: 0 }}>
                {notice.message}
              </strong>
            ) : (
              <>
                <strong>{notice.type === "success" ? "Success" : "Error"}</strong>
                <span>{notice.message}</span>
              </>
            )}
          </div>
        </div>
      )}
      <div className="pos-layout">
        <div className={`product-panel ${activeTab === 'cart' ? 'mobile-hidden' : ''}`}>
          <div className="pos-header-minimal">
            <h1>POS System</h1>
            <div className="search-input-container">
              <Search size={16} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyPress}
                className="search-input"
              />
            </div>
          </div>

          <div className="products-grid pos-products-grid">
            {filteredProducts.length === 0 ? (
              <div className="pos-empty-products">
                <h3>No matching items</h3>
                <p>Try another product name, SKU, or barcode.</p>
              </div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="minimal-product-card"
                  onClick={() => addToCart(product)}
                >
                  <div className="minimal-card-image-wrapper">
                    {product.image ? (
                      <img src={product.image} alt={product.name} loading="lazy" />
                    ) : (
                      <div className="minimal-card-placeholder" />
                    )}
                  </div>
                  <div className="minimal-card-info">
                    <h4 className="minimal-card-name" title={product.name}>{product.name}</h4>
                    <p className="minimal-card-price">{formatCurrency(product.price)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`cart-panel cart-panel-minimal ${activeTab === 'menu' ? 'mobile-hidden' : ''}`}>
          <div className="cart-section" style={{ paddingTop: '16px' }}>
            <div className="cart-header-row" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
              <button 
                type="button" 
                className="mobile-back-btn" 
                onClick={() => setActiveTab("menu")}
              >
                ← Menu
              </button>
              <h3 style={{ margin: 0 }}><ShoppingCart size={18} style={{ marginRight: '8px', display: 'inline' }} /> Current Order ({totalCartItems})</h3>
            </div>
            
            <div className="form-row" style={{ marginTop: '16px', marginBottom: '16px' }}>
              {!isKiosk && (
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                />
              )}
              <input
                type="tel"
                placeholder={isKiosk ? "Enter 10-digit Phone Number (Mandatory)" : "Phone Number"}
                value={customerPhone}
                ref={phoneInputRef}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  if (value.length <= 10) {
                    setCustomerPhone(value);
                  }
                }}
                className="form-input"
                style={{ 
                  padding: '8px 12px', 
                  fontSize: '13px', 
                  width: isKiosk ? '100%' : 'auto' 
                }}
                maxLength="10"
              />
            </div>
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="empty-cart" style={{ padding: '40px 0' }}>
                  <ShoppingCart size={32} />
                  <p style={{ color: '#6c757d', marginTop: '12px' }}>Cart is empty</p>
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
                        <h4 className="cart-item-minimal-name" title={item.name}>{item.name}</h4>
                      </div>
                      <div className="quantity-controls cart-item-minimal-qty" style={{ transform: 'scale(0.8)', transformOrigin: 'center' }}>
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="qty-btn"><Minus size={14} /></button>
                        <span className="cart-item-qty-value">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="qty-btn"><Plus size={14} /></button>
                      </div>
                      <div className="cart-item-minimal-price-block">
                        <div className="item-total cart-item-minimal-total">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                        <p className="cart-item-minimal-unit-price">{formatCurrency(item.price)} each</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="billing-section">
            {!isKiosk && (
              <div className="billing-controls" style={{ padding: '12px 10px', borderTop: '1px solid #f1f3f5' }}>
                <div className="payment-method-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e9ecef', background: showDiscountInput ? '#f8f9fa' : 'transparent' }}
                      onClick={() => setShowDiscountInput((prev) => !prev)}
                    >
                      % Disc
                    </button>
                    {showDiscountInput && (
                      <input
                        type="number"
                        value={discount === 0 ? "" : discount}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        min="0"
                        className="form-input"
                        placeholder="Amt"
                        style={{ width: '60px', padding: '4px 8px', fontSize: '11px' }}
                      />
                    )}
                  </div>
                  <div className="payment-method-grid" style={{ flex: 1, display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {['upi', 'cash'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`payment-method-chip ${
                          paymentMethod === method ? "active" : ""
                        }`}
                        style={{ padding: '8px 16px', fontSize: '13px', minWidth: '76px', height: '40px' }}
                      >
                        {method === 'upi' ? 'UPI' : 'Cash'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bill-summary" style={{ borderTop: isKiosk ? '1px solid #f1f3f5' : 'none', paddingTop: isKiosk ? '12px' : '0' }}>
              {!isKiosk && (
                <div className="summary-line">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(calculateSubtotal())}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="summary-line discount">
                  <span>Discount:</span>
                  <span>-{formatCurrency(calculateDiscountAmount())}</span>
                </div>
              )}
              <div className="summary-line total">
                <span>Total:</span>
                <span>{formatCurrency(calculateTotal())}</span>
              </div>
            </div>

            <div className="action-buttons" style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              {isKiosk ? (
                <>
                  <button
                    onClick={() => processSale('upi')}
                    disabled={cart.length === 0 || loading}
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
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (cart.length > 0 && !loading) {
                        e.currentTarget.style.borderColor = '#ef4444';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(239, 68, 68, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <img 
                      src="upi-logo.png" 
                      alt="UPI Payment" 
                      style={{ height: '40px', maxWidth: '100%', objectFit: 'contain', opacity: cart.length === 0 || loading ? 0.5 : 1 }} 
                    />
                    <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: '600', opacity: cart.length === 0 || loading ? 0.6 : 1 }}>Scan & Pay</span>
                  </button>
                  <button
                    onClick={() => processSale('cash')}
                    disabled={cart.length === 0 || loading}
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
                      outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (cart.length > 0 && !loading) {
                        e.currentTarget.style.borderColor = '#16a34a';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(22, 163, 74, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <img 
                      src="cash-logo.png" 
                      alt="Cash Payment" 
                      style={{ height: '40px', maxWidth: '100%', objectFit: 'contain', opacity: cart.length === 0 || loading ? 0.5 : 1 }} 
                    />
                    <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: '600', opacity: cart.length === 0 || loading ? 0.6 : 1 }}>Pay at Counter</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => processSale()}
                  disabled={cart.length === 0 || loading}
                  className="btn btn-primary process-sale-btn"
                  style={{ width: "100%" }}
                >
                  {loading ? (
                    "Processing..."
                  ) : (
                    <>
                      <Calculator size={20} />
                      Process Bill
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Mobile Navigation */}
      <div className="mobile-nav-bar">
        <button 
          className={activeTab === "menu" ? "active" : ""} 
          onClick={() => setActiveTab("menu")}
        >
          <Package size={20} />
          <span>Menu</span>
        </button>
        <button 
          className={activeTab === "cart" ? "active" : ""} 
          onClick={() => setActiveTab("cart")}
        >
          <ShoppingCart size={20} />
          <span>Cart ({totalCartItems})</span>
        </button>
      </div>

      {/* Floating Cart Banner for Mobile */}
      {totalCartItems > 0 && activeTab === "menu" && (
        <div className="mobile-cart-floating-bar" onClick={() => setActiveTab("cart")}>
          <div className="bar-info">
            <ShoppingCart size={20} />
            <span>{totalCartItems} {totalCartItems === 1 ? 'item' : 'items'} | {formatCurrency(calculateTotal())}</span>
          </div>
          <div className="bar-action">
            <span>View Cart</span>
            <ArrowRight size={18} />
          </div>
        </div>
      )}
      {paymentModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "20px"
        }}>
          <div style={{
            background: "white",
            padding: "30px",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            textAlign: "center",
            maxWidth: "400px",
            width: "100%"
          }}>
            <h3 style={{ margin: "0 0 15px 0", fontSize: "1.3rem", color: "#333" }}>UPI Payment Verification</h3>
            <p style={{ fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 20px 0", color: "#333" }}>
              Amount: ₹{calculateTotal().toFixed(2)}
            </p>
            
            {paymentStatus === "creating" && (
              <div style={{ padding: "40px 0" }}>
                <div className="spinning" style={{ border: "4px solid #f3f3f3", borderTop: "4px solid #3498db", borderRadius: "50%", width: "40px", height: "40px", margin: "0 auto 15px auto" }}></div>
                <p style={{ margin: 0, color: "#666" }}>Generating dynamic UPI QR code...</p>
              </div>
            )}

            {paymentStatus === "pending" && paymentQrUrl && (
              <div>
                <p style={{ fontSize: "0.9rem", color: "#666", margin: "0 0 15px 0" }}>
                  Scan this QR code using GPay, PhonePe, Paytm, or any UPI app:
                </p>
                <img src={paymentQrUrl} alt="Razorpay UPI QR" style={{ width: "200px", height: "200px", border: "1px solid #ddd", borderRadius: "6px", margin: "0 auto 15px auto", display: "block" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#f57c00", fontWeight: "bold" }}>
                  <div className="spinning" style={{ border: "2px solid #f3f3f3", borderTop: "2px solid #f57c00", borderRadius: "50%", width: "16px", height: "16px" }}></div>
                  Waiting for customer payment...
                </div>
              </div>
            )}

            {paymentStatus === "success" && (
              <div style={{ padding: "40px 0", color: "#2e7d32" }}>
                <div style={{ fontSize: "3rem", margin: "0 0 15px 0" }}>✓</div>
                <p style={{ margin: 0, fontWeight: "bold", fontSize: "1.2rem" }}>Payment Successful!</p>
                <p style={{ margin: "5px 0 0 0", color: "#666" }}>Completing checkout...</p>
              </div>
            )}

            {paymentStatus === "error" && (
              <div style={{ padding: "40px 0", color: "#d32f2f" }}>
                <div style={{ fontSize: "3rem", margin: "0 0 15px 0" }}>✗</div>
                <p style={{ margin: 0, fontWeight: "bold" }}>Payment Failed</p>
                <p style={{ margin: "10px 0 0 0" }}>
                  <button onClick={() => startRazorpayPayment(paymentMethod)} className="btn btn-secondary" style={{ padding: "8px 15px" }}>Retry QR Code</button>
                </p>
              </div>
            )}

            <div style={{ marginTop: "25px", borderTop: "1px solid #eee", paddingTop: "20px" }}>
              <button 
                onClick={cancelRazorpayPayment} 
                className="btn btn-secondary" 
                style={{ width: "100%", padding: "10px", borderColor: "#d32f2f", color: "#d32f2f" }}
              >
                Cancel Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSSystem;
