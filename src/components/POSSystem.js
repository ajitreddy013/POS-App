import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  User,
  Calculator,
  Package,
} from "lucide-react";
import { getLocalDateTimeString } from "../utils/dateUtils";
import { dbService } from "../services/dbService";
import { whatsappService } from "../services/whatsappService";
import { APP_CONFIG } from "../config";

const POSSystem = () => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const searchInputRef = useRef(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState("");
  const [activeLinkId, setActiveLinkId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("creating");
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    loadProducts();
    loadBarSettings();
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const loadBarSettings = async () => {
    try {
      const settings = await dbService.getBarSettings();
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

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcode && product.barcode.includes(searchTerm))
  );

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

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const calculateDiscountAmount = () => {
    // Discount is a flat ₹ amount, capped at subtotal
    return Math.min(discount, calculateSubtotal());
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - calculateDiscountAmount());
  };

  const generateSaleNumber = async () => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear().toString().slice(-2);

    // Generate a random 3-digit number
    const randomNum = Math.floor(Math.random() * 900) + 100; // 100-999

    return `${day}${month}${year}${randomNum}`;
  };


  const executeSaleWrite = async () => {
    setLoading(true);
    try {
      const saleData = {
        saleNumber: await generateSaleNumber(),
        saleType: "parcel",
        tableNumber: null,
        customerName: customerName || "Walk-in Customer",
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
        paymentMethod,
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      // Save sale to database
      await dbService.createSale(saleData);

      // Auto-send WhatsApp receipt silently if customer phone is available
      if (customerPhone && customerPhone.trim() !== "") {
        try {
          const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;
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

      // Reload products to update stock
      await loadProducts();

      // Trigger dashboard refresh by dispatching a custom event
      window.dispatchEvent(new CustomEvent("saleCompleted"));
    } catch (error) {
      // Failed to process sale
      alert("Failed to process sale. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const processSale = async () => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }

    // Enforce 10-digit mobile number for UPI payments
    if (paymentMethod === "upi") {
      const cleanPhone = customerPhone.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        alert("Please enter a valid 10-digit mobile number to proceed with UPI checkout.");
        return;
      }
    }

    // Check if payment method is UPI and automated Razorpay checkout is enabled
    const isRazorpayEnabled = barSettings && barSettings.razorpay_enabled === 1;
    if (paymentMethod === "upi" && isRazorpayEnabled) {
      startRazorpayPayment();
      return;
    }

    executeSaleWrite();
  };

  const startRazorpayPayment = async () => {
    setPaymentModalOpen(true);
    setPaymentStatus("creating");
    setPaymentLinkUrl("");
    setActiveLinkId("");
    
    const relayUrl = barSettings?.whatsapp_relay_url || APP_CONFIG.whatsappRelayUrl;

    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();

      // Call relay to create Payment Link (relies on server-side Render environment variables)
      const response = await fetch(`${relayUrl}/payment/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          orderId,
          customerName: customerName.trim() || "Walk-in Customer",
          customerPhone: customerPhone.trim() || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        setPaymentLinkUrl(data.shortUrl);
        setActiveLinkId(data.paymentLinkId);
        setPaymentStatus("pending");
        
        // Open the link in a new tab/system browser
        const target = (typeof window !== "undefined" && window.Capacitor) ? "_system" : "_blank";
        window.open(data.shortUrl, target);
        
        // Start polling for payment link status
        startPollingPaymentLink(data.paymentLinkId, relayUrl);
      } else {
        setPaymentStatus("error");
        alert(`Failed to create Payment Link: ${data.error}`);
      }
    } catch (err) {
      setPaymentStatus("error");
      alert(`Cannot reach relay server at:\n${relayUrl}\n\nMake sure the relay server is running on your Mac and the Relay URL in Settings points to your Mac's IP (e.g. http://10.109.19.56:8080).\n\nError: ${err.message}`);
    }
  };

  const startPollingPaymentLink = (paymentLinkId, relayUrl) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${relayUrl}/payment/link-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentLinkId
          })
        });

        const data = await response.json();
        if (data.success && data.paid) {
          clearInterval(pollingIntervalRef.current);
          setPaymentStatus("success");
          
          // Wait 1 second to show success state, then complete checkout
          setTimeout(() => {
            setPaymentModalOpen(false);
            executeSaleWrite();
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

  const printBill = async (billData) => {
    try {
      const result = await dbService.printBill(billData);
      if (result.success) {
        alert("Bill printed successfully!");
      } else {
        alert(`Print failed: ${result.error}`);
      }
    } catch (error) {
      // Print error
      alert("Failed to print bill");
    }
  };

  // Export PDF function - not currently used but available for future use
  // const exportPDF = async (billData) => {
  //   try {
  //     const result = await window.electronAPI.exportPDF(billData);
  //     if (result.success) {
  //       alert(`PDF saved to: ${result.filePath}`);
  //     } else {
  //       alert(`PDF export failed: ${result.error}`);
  //     }
  //   } catch (error) {
  //     // PDF export error
  //     alert("Failed to export PDF");
  //   }
  // };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
    }
  };

  return (
    <div className="pos-system">
      <div className="pos-header">
        <h1>
          <ShoppingCart size={24} /> POS System
        </h1>
        <div className="search-input-container" style={{ flex: 1, maxWidth: '480px', margin: '0 20px' }}>
          <Search size={20} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search products by name, SKU, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="search-input"
          />
        </div>
      </div>

      <div className="pos-layout">
        {/* Left Panel - Product Cards */}
        <div className="product-panel">
          <div className="products-grid">
            {filteredProducts.slice(0, 12).map((product) => (
              <div
                key={product.id}
                className="product-card"
                onClick={() => addToCart(product)}
              >
                <div className="product-card-image-container">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="product-card-image" />
                  ) : (
                    <div className="product-card-placeholder">
                      <Package size={36} />
                    </div>
                  )}
                </div>
                <div className="product-info">
                  <h3>{product.name}</h3>
                  {product.variant && (
                    <p className="product-variant">{product.variant}</p>
                  )}
                  <p className="product-sku">{product.sku}</p>
                  <div className="product-card-footer">
                    <span className="product-price">₹{product.price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Cart and Billing */}
        <div className="cart-panel">
          <div className="customer-section">
            <h3>
              <User size={20} /> Customer Information
            </h3>
            <div className="form-row">
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="form-input"
              />
              <input
                type="tel"
                placeholder="Phone Number (10 digits)"
                value={customerPhone}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                  if (value.length <= 10) {
                    setCustomerPhone(value);
                  }
                }}
                className="form-input"
                maxLength="10"
              />
            </div>

          </div>

          <div className="cart-section">
            <h3>
              <ShoppingCart size={20} /> Cart ({cart.length} items)
            </h3>

            <div className="cart-items">
              {cart.length === 0 ? (
                <p className="empty-cart">Cart is empty</p>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="cart-item">
                    <div className="item-info">
                      <h4>{item.name}</h4>
                      <p>₹{item.price.toFixed(2)} each</p>
                    </div>
                    <div className="quantity-controls">
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        className="qty-btn"
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(item.id, parseInt(e.target.value) || 0)
                        }
                        className="qty-input"
                        min="1"
                      />
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        className="qty-btn"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="item-total">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="remove-btn"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="billing-section">
            <div className="billing-controls">
              <div className="form-row">
                <label style={{ gridColumn: '1 / -1' }}>
                  Discount (₹)
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) =>
                      setDiscount(parseFloat(e.target.value) || 0)
                    }
                    min="0"
                    className="form-input"
                    placeholder="0"
                  />
                </label>
              </div>

              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#2c3e50', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Payment Method</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['upi', 'cash'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      style={{
                        flex: 1,
                        padding: '10px',
                        border: `2px solid ${paymentMethod === method ? '#667eea' : '#e1e8ed'}`,
                        borderRadius: '10px',
                        background: paymentMethod === method ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                        color: paymentMethod === method ? 'white' : '#495057',
                        fontWeight: '600',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {method === 'upi' ? 'UPI' : 'Cash'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bill-summary">
              <div className="summary-line">
                <span>Subtotal:</span>
                <span>₹{calculateSubtotal().toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-line discount">
                  <span>Discount:</span>
                  <span>-₹{calculateDiscountAmount().toFixed(2)}</span>
                </div>
              )}
              <div className="summary-line total">
                <span>Total:</span>
                <span>₹{calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            <div className="action-buttons">
              <button
                onClick={processSale}
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
            </div>
          </div>
        </div>
      </div>

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
          zIndex: 1000,
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

            {paymentStatus === "pending" && paymentLinkUrl && (
              <div>
                <p style={{ fontSize: "0.95rem", color: "#444", margin: "0 0 10px 0", lineHeight: "1.4" }}>
                  Scan the QR code below or click the button to complete the payment:
                </p>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentLinkUrl)}`} 
                  alt="Razorpay Payment QR Code" 
                  style={{ width: "200px", height: "200px", margin: "0 auto 15px auto", display: "block", border: "1px solid #ddd", borderRadius: "8px", padding: "5px", backgroundColor: "#fff" }} 
                />
                <button 
                  onClick={() => window.open(paymentLinkUrl, "_blank")} 
                  className="btn btn-primary"
                  style={{ 
                    display: "inline-flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px", 
                    padding: "12px 24px", 
                    fontSize: "1rem", 
                    fontWeight: "bold",
                    backgroundColor: "#3399cc",
                    borderColor: "#3399cc",
                    color: "#fff",
                    borderRadius: "8px",
                    cursor: "pointer",
                    margin: "0 auto 20px auto",
                    boxShadow: "0 2px 8px rgba(51,153,204,0.3)"
                  }}
                >
                  Open Razorpay Payment Page
                </button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "#f57c00", fontWeight: "bold", marginTop: "10px" }}>
                  <div className="spinning" style={{ border: "2px solid #f3f3f3", borderTop: "2px solid #f57c00", borderRadius: "50%", width: "16px", height: "16px" }}></div>
                  Waiting for payment confirmation...
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
                  <button onClick={startRazorpayPayment} className="btn btn-secondary" style={{ padding: "8px 15px" }}>Retry Payment</button>
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
