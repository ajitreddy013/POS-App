import React, { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
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
} from "lucide-react";
import { getLocalDateTimeString } from "../utils/dateUtils";
import { dbService } from "../services/dbService";
import { whatsappService } from "../services/whatsappService";
import { APP_CONFIG } from "../config";

const TablePOS = ({ table, onBack, onTableUpdate }) => {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [loading, setLoading] = useState(false);
  const [barSettings, setBarSettings] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const searchInputRef = useRef(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [activeQrId, setActiveQrId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("creating");
  const pollingIntervalRef = useRef(null);

  const loadTableOrder = useCallback(async () => {
    try {
      const tableOrder = await dbService.getTableOrder(table.id);
      if (tableOrder) {
        setCart(tableOrder.items || []);
        setCustomerName(tableOrder.customer_name || "");
        setCustomerPhone(tableOrder.customer_phone || "");
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
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [loadTableOrder]);

  const loadBarSettings = async () => {
    try {
      const settings = await dbService.getBarSettings();
      setBarSettings(settings);
      if (settings && settings.whatsapp_enabled === 1) {
        setSendWhatsapp(true);
      }
    } catch (error) {
      // Failed to load bar settings
      setBarSettings(null);
    }
  };

  const loadProducts = async () => {
    try {
      const productList = await dbService.getProducts();
      setProducts(productList.filter((p) => p.counter_stock > 0));
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

  const addToCart = async (product) => {
    const existingItem = cart.find((item) => item.id === product.id);
    let newCart;

    if (existingItem) {
      if (existingItem.quantity < product.counter_stock) {
        newCart = cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
        setCart(newCart);
      } else {
        alert("Insufficient stock!");
        return;
      }
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

    setSearchTerm("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const autoSaveOrder = async (currentCart) => {
    setAutoSaving(true);
    try {
      const subtotal = currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
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
        notes: "",
        subtotal,
        total,
        kot_printed: false,
      };

      await dbService.saveTableOrder(orderData);

      // Update table status
      const tableUpdate = {
        status: currentCart.length > 0 ? "occupied" : "available",
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

    const product = cart.find((item) => item.id === productId);
    if (newQuantity > product.maxStock) {
      alert("Insufficient stock!");
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
    const now = new Date();
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear().toString().slice(-2);

    // Generate a random 3-digit number
    const randomNum = Math.floor(Math.random() * 900) + 100; // 100-999

    return `${day}${month}${year}${randomNum}`;
  };

  const savePendingBill = async () => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }

    // Validate required fields for pending bills
    const errors = [];
    
    if (!customerName || customerName.trim() === "") {
      errors.push("Customer name");
    }

    if (!customerPhone || customerPhone.trim() === "") {
      errors.push("Customer phone number");
    } else if (customerPhone.trim().length !== 10 || !/^\d{10}$/.test(customerPhone.trim())) {
      alert("Phone number must be exactly 10 digits!");
      return;
    }

    if (errors.length > 0) {
      alert(`${errors.join(" and ")} ${errors.length > 1 ? 'are' : 'is'} mandatory for pending bills!`);
      return;
    }

    setLoading(true);
    try {
      const billData = {
        billNumber: await generateSaleNumber(),
        saleType: "table",
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
        notes: "",
      };

      await dbService.addPendingBill(billData);
      alert("Bill saved as pending!");

      // Clear cart and customer info
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount(0);
      setTax(0);
      
      // Clear table order
      await dbService.clearTableOrder(table.id);
      
      // Update table status
      await dbService.updateTable(table.id, {
        status: "available",
        current_bill_amount: 0,
      });
      
      onTableUpdate({ ...table, status: "available", current_bill_amount: 0 });
    } catch (error) {
      // Failed to save pending bill
      alert("Failed to save pending bill. Please try again.");
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
        notes: "",
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        kot_printed: false,
      };

      await dbService.saveTableOrder(orderData);

      // Update table status
      const tableUpdate = {
        status: cart.length > 0 ? "occupied" : "available",
        current_bill_amount: calculateTotal(),
      };

      await dbService.updateTable(table.id, tableUpdate);
      onTableUpdate({ ...table, ...tableUpdate });

      alert("Order saved successfully!");
    } catch (error) {
      // Failed to save table order
      alert("Failed to save order. Please try again.");
    }
  };


  const executeSaleWrite = async () => {
    setLoading(true);
    try {
      const saleData = {
        saleNumber: await generateSaleNumber(),
        tableId: table.id,
        tableName: table.name,
        customerName: customerName || "Table Customer",
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
        notes: "",
        saleDate: getLocalDateTimeString(),
        barSettings,
      };

      await dbService.createSale(saleData);

      // Clear table order
      await dbService.clearTableOrder(table.id);

      // Update table status
      await dbService.updateTable(table.id, {
        status: "available",
        current_bill_amount: 0,
      });

      // Auto-print bill to default printer if enabled
      if (barSettings && barSettings.printing_enabled === 1) {
        await printBill(saleData);
      }

      // Auto-send WhatsApp receipt if enabled and number exists
      if (sendWhatsapp && customerPhone && barSettings && barSettings.whatsapp_enabled === 1) {
        try {
          const waResult = await whatsappService.sendBill(APP_CONFIG.whatsappRelayUrl, barSettings, saleData);
          if (waResult.success) {
            console.log("WhatsApp receipt sent!");
          } else {
            alert(`WhatsApp Receipt Send Failed: ${waResult.error}`);
          }
        } catch (waErr) {
          console.error("WhatsApp error:", waErr);
        }
      }

      // Clear cart and customer info
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount(0);
      setTax(0);

      await loadProducts();
      onTableUpdate({ ...table, status: "available", current_bill_amount: 0 });

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

    // Check if payment method is UPI and Razorpay is configured
    if (paymentMethod === "upi" && barSettings && barSettings.razorpay_key_id && barSettings.razorpay_key_secret) {
      startRazorpayPayment();
      return;
    }

    executeSaleWrite();
  };

  const startRazorpayPayment = async () => {
    setPaymentModalOpen(true);
    setPaymentStatus("creating");
    setPaymentQrUrl("");
    setActiveQrId("");
    
    try {
      const orderId = await generateSaleNumber();
      const amount = calculateTotal();
      const relayUrl = APP_CONFIG.whatsappRelayUrl;

      // Call relay to create QR code
      const response = await fetch(`${relayUrl}/payment/create-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          orderId,
          keyId: barSettings.razorpay_key_id,
          keySecret: barSettings.razorpay_key_secret
        })
      });

      const data = await response.json();
      if (data.success) {
        setPaymentQrUrl(data.qrImageUrl);
        setActiveQrId(data.qrCodeId);
        setPaymentStatus("pending");
        
        // Start polling for payment status
        startPollingPayment(data.qrCodeId, relayUrl);
      } else {
        setPaymentStatus("error");
        alert(`Failed to create Razorpay QR: ${data.error}`);
      }
    } catch (err) {
      setPaymentStatus("error");
      alert(`Error connecting to payment relay: ${err.message}`);
    }
  };

  const startPollingPayment = (qrCodeId, relayUrl) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${relayUrl}/payment/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrCodeId,
            keyId: barSettings.razorpay_key_id,
            keySecret: barSettings.razorpay_key_secret
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
      alert("Failed to export PDF");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && filteredProducts.length > 0) {
      addToCart(filteredProducts[0]);
    }
  };

  return (
    <div className="table-pos">
      <div className="pos-header">
        <div className="header-left">
          <button className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={20} />
            Back to Tables
          </button>
          <h1>
            <ShoppingCart size={24} />
            {table.name} - {table.area === "restaurant" ? "Restaurant" : "Bar"}
          </h1>
        </div>
        <div className="header-right">
          <div className="table-status">
            Status:{" "}
            <span className={`status-badge ${table.status}`}>
              {table.status}
            </span>
          </div>
          {autoSaving && (
            <div className="auto-save-indicator">
              <Save size={16} className="spinning" />
              <span>Auto-saving...</span>
            </div>
          )}
        </div>
      </div>

      <div className="pos-layout">
        {/* Left Panel - Product Search and Selection */}
        <div className="product-panel">
          <div className="search-section">
            <div className="search-input-container">
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
                    <span className="product-stock">Stock: {product.counter_stock}</span>
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
            {barSettings && barSettings.whatsapp_enabled === 1 && (
              <div className="whatsapp-checkbox-row" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="sendWhatsappCheckbox"
                  checked={sendWhatsapp}
                  onChange={(e) => setSendWhatsapp(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="sendWhatsappCheckbox" style={{ fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-color, inherit)' }}>
                  Send via WhatsApp
                </label>
              </div>
            )}
          </div>

          <div className="cart-section">
            <h3>
              <ShoppingCart size={20} /> Order ({cart.length} items)
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
                        max={item.maxStock}
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
                <label>
                  Discount (%)
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) =>
                      setDiscount(parseFloat(e.target.value) || 0)
                    }
                    min="0"
                    max="100"
                    className="form-input small"
                  />
                </label>
                <label>
                  Tax (%)
                  <input
                    type="number"
                    value={tax}
                    onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    className="form-input small"
                  />
                </label>
              </div>

              <label>
                Payment Method
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="form-input"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                </select>
              </label>
            </div>

            <div className="bill-summary">
              <div className="summary-line">
                <span>Subtotal:</span>
                <span>₹{calculateSubtotal().toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-line discount">
                  <span>Discount ({discount}%):</span>
                  <span>-₹{calculateDiscountAmount().toFixed(2)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="summary-line tax">
                  <span>Tax ({tax}%):</span>
                  <span>₹{calculateTaxAmount().toFixed(2)}</span>
                </div>
              )}
              <div className="summary-line total">
                <span>Total:</span>
                <span>₹{calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            <div className="action-buttons">
              <button
                onClick={saveTableOrder}
                disabled={cart.length === 0}
                className="btn btn-secondary"
              >
                <Save size={20} />
                Save Order
              </button>

              <button
                onClick={savePendingBill}
                disabled={cart.length === 0 || loading}
                className="btn btn-secondary save-pending-btn"
              >
                {loading ? (
                  "Saving..."
                ) : (
                  <>
                    <Clock size={20} />
                    Save as Pending
                  </>
                )}
              </button>

              <button
                onClick={processSale}
                disabled={cart.length === 0 || loading}
                className="btn btn-primary process-sale-btn"
              >
                {loading ? (
                  "Processing..."
                ) : (
                  <>
                    <Calculator size={20} />
                    Process Sale
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
                  <button onClick={startRazorpayPayment} className="btn btn-secondary" style={{ padding: "8px 15px" }}>Retry QR Code</button>
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
