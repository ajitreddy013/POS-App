import { dbService } from '../services/dbService';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Package, Plus, Edit, Trash2, Search, CloudLightning } from 'lucide-react';
import useBarSettings from '../utils/useBarSettings';
import { getFirebaseDb } from '../firebase';
import { doc, writeBatch, getDocs, collection, updateDoc } from 'firebase/firestore';

const ProductManagement = () => {
  const { barSettings } = useBarSettings();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [syncingMenu, setSyncingMenu] = useState(false);

  const syncMenuToCloud = async () => {
    try {
      setSyncingMenu(true);
      const db = getFirebaseDb();
      if (!db) {
        alert("Firebase is not configured! Please configure your credentials inside settings first.");
        return;
      }

      const productsList = await dbService.getProducts();
      if (!productsList || productsList.length === 0) {
        alert("No products found in local database to sync.");
        return;
      }

      // 1. Fetch all existing products from Firestore to handle clean up
      const existingDocIds = [];
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        querySnapshot.forEach((doc) => {
          existingDocIds.push(doc.id);
        });
      } catch (err) {
        console.warn("Failed to fetch existing Firestore products for cleanup:", err);
      }

      // 2. Identify products in Firestore that do not exist locally
      const localIds = productsList.map((p) => String(p.id));
      const idsToDelete = existingDocIds.filter((id) => !localIds.includes(id));

      const batch = writeBatch(db);

      // 3. Upload/Update current local products
      productsList.forEach((p) => {
        const docRef = doc(db, "products", String(p.id));
        batch.set(docRef, {
          id: String(p.id),
          name: p.name,
          price: Number(p.price) || 0,
          category: p.category || "General",
          image: p.image || "",
          description: p.description || "",
          dietary_type: p.dietary_type || "veg",
          available: true,
          out_of_stock: p.out_of_stock || false,
          cost: Number(p.cost) || 0,
        });
      });

      // 4. Delete old products no longer present in local database
      idsToDelete.forEach((id) => {
        const docRef = doc(db, "products", id);
        batch.delete(docRef);
      });

      await batch.commit();
      alert(`Menu synchronized successfully! ${productsList.length} products updated, and ${idsToDelete.length} obsolete products deleted from the cloud.`);
    } catch (err) {
      console.error("Failed to sync menu:", err);
      alert(`Sync failed: ${err.message || err}`);
    } finally {
      setSyncingMenu(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const productList = await dbService.getProducts();
      setProducts(productList);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load products:', error);
    }
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category &&
        product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const ProductModal = ({ product, onClose, onSave }) => {
    const [formData, setFormData] = useState({
      name: product?.name || '',
      price: product?.price || '',
      cost: product?.cost ?? '',
      image: product?.image || '',
      category: product?.category || '',
      description: product?.description || '',
      dietary_type: product?.dietary_type || 'veg',
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    const catContainerRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (catContainerRef.current && !catContainerRef.current.contains(event.target)) {
          setShowCatDropdown(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, []);

    const handleImageChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          handleInputChange('image', reader.result);
        };
        reader.readAsDataURL(file);
      }
    };

    const validateForm = () => {
      const newErrors = {};
      if (!formData.name.trim()) newErrors.name = 'Product name is required';
      if (!formData.price || formData.price <= 0)
        newErrors.price = 'Valid selling price is required';
      return newErrors;
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      const validationErrors = validateForm();

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      setIsSubmitting(true);
      setErrors({});

      try {
        const productData = {
          ...formData,
          sku: product?.sku || `PROD-${Date.now()}`,
          cost: parseFloat(formData.cost) >= 0 ? parseFloat(formData.cost) : 0,
          unit: product?.unit || 'pcs',
          variant: product?.variant || '',
          category: formData.category || 'General',
          barcode: product?.barcode || '',
          description: formData.description || '',
          dietary_type: formData.dietary_type || 'veg',
          godown_stock: product?.godown_stock || 0,
          counter_stock: product?.counter_stock || 0,
        };
        await onSave(productData);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save product:', error);
        setErrors({ submit: 'Failed to save product. Please try again.' });
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleInputChange = (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
    };

    const existingCategories = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ];

    return (
      <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '20px' }}>
        <div
          className="modal product-form-modal"
          style={{
            maxWidth: '500px',
            width: '95%',
            maxHeight: '92vh',
            overflowY: 'auto',
          }}
        >
          <div
            className="modal-header"
            style={{
              background: '#f8fafc',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <h3
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '1.15rem',
                fontWeight: '700',
                color: '#111827',
              }}
            >
              <Package size={22} style={{ color: '#ef4444' }} />
              {product ? 'Edit Product' : 'Add New Product'}
            </h3>
            <button
              onClick={onClose}
              className="close-btn"
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#64748b',
                padding: 0,
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div
              className="modal-content product-form-modal-content"
              style={{ padding: '16px 20px' }}
            >
              {errors.submit && (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '10px 14px',
                    background: '#fee',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    border: '1px solid #fecaca',
                  }}
                >
                  {errors.submit}
                </div>
              )}

              {/* 1. Product Name */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label
                  className="required"
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#344054',
                  }}
                >
                  Product Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  placeholder="e.g. Iced Latte"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${errors.name ? '#f87171' : '#d0d5dd'}`,
                    fontSize: '0.95rem',
                    background: 'white',
                    transition: 'border-color 0.2s',
                  }}
                  required
                />
                {errors.name && (
                  <div
                    style={{
                      color: '#dc2626',
                      fontSize: '0.75rem',
                      marginTop: '4px',
                      fontWeight: '500',
                    }}
                  >
                    ✗ {errors.name}
                  </div>
                )}
              </div>

              {/* 2. Category - Single Custom Autocomplete Combobox */}
              <div 
                className="form-group" 
                ref={catContainerRef} 
                style={{ marginBottom: '12px', position: 'relative' }}
              >
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#344054',
                  }}
                >
                  Category
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => {
                      handleInputChange('category', e.target.value);
                      setShowCatDropdown(true);
                    }}
                    onFocus={() => setShowCatDropdown(true)}
                    placeholder="Type or select category..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem',
                      background: 'white',
                      transition: 'border-color 0.2s',
                      paddingRight: '32px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCatDropdown(!showCatDropdown)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ▼
                  </button>
                </div>

                {/* Floating Dropdown List */}
                {showCatDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      background: 'white',
                      border: '1px solid #d0d5dd',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      marginTop: '4px',
                    }}
                  >
                    {existingCategories
                      .filter((cat) =>
                        cat.toLowerCase().includes((formData.category || '').toLowerCase())
                      )
                      .map((cat) => (
                        <div
                          key={cat}
                          onClick={() => {
                            handleInputChange('category', cat);
                            setShowCatDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            color: '#1f2937',
                            borderBottom: '1px solid #f3f4f6',
                            textAlign: 'left',
                            background: formData.category === cat ? '#fff5f5' : 'white',
                            fontWeight: formData.category === cat ? '600' : 'normal',
                          }}
                          onMouseEnter={(e) => {
                            if (formData.category !== cat) {
                              e.currentTarget.style.backgroundColor = '#f8fafc';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (formData.category !== cat) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          {cat}
                        </div>
                      ))}
                    {existingCategories.filter((cat) =>
                      cat.toLowerCase().includes((formData.category || '').toLowerCase())
                    ).length === 0 && (
                      <div
                        style={{
                          padding: '8px 12px',
                          fontSize: '0.8rem',
                          color: '#64748b',
                          fontStyle: 'italic',
                          textAlign: 'left',
                          background: '#f8fafc',
                        }}
                      >
                        New Category: &quot;{formData.category || 'General'}&quot; will be added
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Price and Type Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div className="form-group">
                  <label
                    className="required"
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      color: '#344054',
                    }}
                  >
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      handleInputChange(
                        'price',
                        parseFloat(e.target.value) || ''
                      )
                    }
                    className={`form-input ${errors.price ? 'error' : ''}`}
                    min="0"
                    step="0.01"
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${errors.price ? '#f87171' : '#d0d5dd'}`,
                      fontSize: '0.95rem',
                      background: 'white',
                      transition: 'border-color 0.2s',
                    }}
                    required
                  />
                  {errors.price && (
                    <div
                      style={{
                        color: '#dc2626',
                        fontSize: '0.75rem',
                        marginTop: '4px',
                        fontWeight: '500',
                      }}
                    >
                      ✗ {errors.price}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      color: '#344054',
                    }}
                  >
                    Type
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={formData.dietary_type}
                      onChange={(e) =>
                        handleInputChange('dietary_type', e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #d0d5dd',
                        fontSize: '0.95rem',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23344054' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 10px center',
                        paddingRight: '32px',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <option value="veg">Veg</option>
                      <option value="non-veg">Non-Veg</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 4. Cost Price */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#344054',
                  }}
                >
                  Cost Price (₹)
                </label>
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => handleInputChange('cost', e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="0 — leave blank if unknown"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d0d5dd',
                    fontSize: '0.95rem',
                    background: 'white',
                    transition: 'border-color 0.2s',
                  }}
                />
                <div style={{ fontSize: '0.73rem', color: '#94837a', marginTop: '3px' }}>
                  Used for profit calculations in Reports. Not shown to customers.
                </div>
              </div>

              {/* 5. Description */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#344054',
                  }}
                >
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange('description', e.target.value)
                  }
                  placeholder="Add product details (optional)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d0d5dd',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    minHeight: '55px',
                    fontFamily: 'inherit',
                    background: 'white',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>

              {/* 5. Compact Photo Upload section (Photo in the last) */}
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#344054',
                  }}
                >
                  Product Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                <div
                  className="product-image-upload"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '1.5px dashed #d0d5dd',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: '#fcfcfc',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minHeight: '60px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.backgroundColor = '#fff5f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d0d5dd';
                    e.currentTarget.style.backgroundColor = '#fcfcfc';
                  }}
                >
                  {formData.image ? (
                    <div
                      style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                    >
                      <img
                        src={formData.image}
                        alt="Preview"
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '6px',
                          objectFit: 'cover',
                          border: '1px solid #eaecf0',
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInputChange('image', '');
                        }}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                        title="Remove Image"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: '#fff5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ef4444',
                        flexShrink: 0,
                      }}
                    >
                      <Package size={20} />
                    </div>
                  )}
                  <div style={{ textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: '#475467',
                        fontWeight: '600',
                      }}
                    >
                      {formData.image ? 'Change Photo' : 'Upload Photo'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#667085' }}>
                      Click to browse image
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="modal-actions product-form-actions"
              style={{
                padding: '12px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d0d5dd',
                  background: 'white',
                  color: '#344054',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#ef4444',
                  color: 'white',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  border: 'none',
                  transition: 'all 0.2s',
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting
                  ? 'Saving...'
                  : product
                    ? 'Update Product'
                    : 'Add Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  ProductModal.propTypes = {
    product: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
  };

  const handleSaveProduct = async (productData) => {
    try {
      if (editingProduct) {
        await dbService.updateProduct(editingProduct.id, productData);
      } else {
        await dbService.addProduct(productData);
      }
      await loadProducts();
      setShowModal(false);
      setEditingProduct(null);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    }
  };

  const handleToggleOutOfStock = async (product) => {
    const newValue = !product.out_of_stock;
    try {
      await dbService.updateProduct(product.id, { out_of_stock: newValue });
      const firestoreDb = getFirebaseDb();
      if (firestoreDb) {
        await updateDoc(doc(firestoreDb, 'products', String(product.id)), { out_of_stock: newValue });
      }
      await loadProducts();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle out-of-stock:', error);
      alert('Failed to update product availability');
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await dbService.deleteProduct(productId);
        await loadProducts();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete product:', error);
        alert('Failed to delete product');
      }
    }
  };

  return (
    <div className="product-management">
      <div
        className="page-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '16px 20px',
          background: '#ffffff',
          borderBottom: '2px solid #f3f4f6',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              fontSize: '1rem',
              fontWeight: '600',
              borderRadius: '10px',
              background: showSearch ? '#ef4444' : '#fffdf8',
              color: showSearch ? 'white' : '#221f1a',
              border: '1px solid #e6ded3',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Search size={20} />
            Search
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              fontSize: '1rem',
              fontWeight: '600',
              borderRadius: '10px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
              transition: 'all 0.2s ease',
            }}
          >
            <Plus size={20} />
            Add Product
          </button>

          <button
            onClick={syncMenuToCloud}
            disabled={syncingMenu}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              borderRadius: '10px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              cursor: syncingMenu ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
              transition: 'all 0.2s ease',
              width: '48px',
              height: '48px',
              flexShrink: 0,
            }}
            title="Sync Menu to Cloud"
          >
            <CloudLightning
              size={20}
              style={{
                animation: syncingMenu ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </button>
        </div>

        {/* Expandable Search Input Row */}
        {showSearch && (
          <div
            className="search-input-container"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#f8fafc',
              padding: '10px 16px',
              borderRadius: '10px',
              border: '2px solid #ef4444',
              transition: 'all 0.2s ease',
              width: '100%',
            }}
          >
            <Search size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                fontSize: '1rem',
                padding: '6px 0',
                outline: 'none',
                color: '#1f2937',
              }}
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Products Grid / Cards */}
      <div
        className="product-management-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          paddingBottom: '20px',
        }}
      >
        {filteredProducts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#7f8c8d',
              gridColumn: '1 / -1',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #eaecf0',
            }}
          >
            {searchTerm
              ? 'No products found matching your search'
              : 'No products added yet'}
          </div>
        ) : (
          filteredProducts.map((product) => {
            const price = product.price || 0;

            return (
              <div
                key={product.id}
                className="product-management-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px',
                  background: product.out_of_stock ? '#fafafa' : 'white',
                  borderRadius: '12px',
                  border: `1px solid ${product.out_of_stock ? '#fca5a5' : '#eaecf0'}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  opacity: product.out_of_stock ? 0.75 : 1,
                }}
              >
                <div
                  className="product-management-card-main"
                  style={{ display: 'flex', gap: '12px' }}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        objectFit: 'cover',
                        border: '1px solid #eee',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        background: '#f8f9fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#a0aec0',
                        border: '1px solid #eee',
                      }}
                    >
                      <Package size={24} />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <strong
                          style={{
                            fontSize: '1.05rem',
                            color: '#111827',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {product.name}
                        </strong>
                        {product.out_of_stock && (
                          <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '0.65rem', fontWeight: '700', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase', flexShrink: 0 }}>
                            Out of Stock
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: '700',
                          color: '#059669',
                          marginLeft: '8px',
                        }}
                      >
                        ₹{price.toFixed(2)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '6px',
                      }}
                    >
                      {product.dietary_type && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            border: `1.5px solid ${product.dietary_type === 'veg' ? '#059669' : '#dc2626'}`,
                            borderRadius: '2px',
                            padding: '2px',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor:
                                product.dietary_type === 'veg'
                                  ? '#059669'
                                  : '#dc2626',
                            }}
                          />
                        </span>
                      )}

                      {product.category && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: '600',
                            background: '#f3f4f6',
                            color: '#4b5563',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                          }}
                        >
                          {product.category}
                        </span>
                      )}
                    </div>

                    {product.description && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.85rem',
                          color: '#6b7280',
                          lineHeight: '1.4',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid #f3f4f6',
                  }}
                >
                  <button
                    className="product-management-card-action"
                    onClick={() => {
                      setEditingProduct(product);
                      setShowModal(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: 'white',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      color: '#374151',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    <Edit size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleToggleOutOfStock(product)}
                    title={product.out_of_stock ? 'Mark as Available' : 'Mark as Out of Stock'}
                    style={{
                      flex: 1,
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: product.out_of_stock ? '#dcfce7' : '#fff7ed',
                      border: `1px solid ${product.out_of_stock ? '#86efac' : '#fdba74'}`,
                      borderRadius: '6px',
                      color: product.out_of_stock ? '#15803d' : '#c2410c',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {product.out_of_stock ? '✓ In Stock' : '✕ Out of Stock'}
                  </button>
                  <button
                    className="product-management-card-action danger"
                    onClick={() => handleDeleteProduct(product.id)}
                    style={{
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      color: '#dc2626',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Product Modal */}
      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowModal(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
};

export default ProductManagement;
