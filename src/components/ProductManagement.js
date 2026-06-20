import { dbService } from '../services/dbService';
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Package, Plus, Edit, Trash2, Search } from 'lucide-react';
import useBarSettings from '../utils/useBarSettings';

const ProductManagement = () => {
  const { barSettings } = useBarSettings();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

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
      image: product?.image || '',
      category: product?.category || '',
      description: product?.description || '',
      dietary_type: product?.dietary_type || 'veg',
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);

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
          cost: product?.cost !== undefined ? product.cost : 0,
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
      <div className="modal-overlay">
        <div
          className="modal product-form-modal"
          style={{
            maxWidth: '500px',
            width: '95%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <div
            className="modal-header"
            style={{
              background: '#f8fafc',
              padding: '20px 24px',
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
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#111827',
              }}
            >
              <Package size={24} style={{ color: '#ef4444' }} />
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
              style={{ padding: '24px' }}
            >
              {errors.submit && (
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '12px 16px',
                    background: '#fee',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '0.9rem',
                    border: '1px solid #fecaca',
                  }}
                >
                  {errors.submit}
                </div>
              )}

              {/* Image Upload Section */}
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
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
                    border: '2px dashed #d0d5dd',
                    borderRadius: '12px',
                    padding: '20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#fcfcfc',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '120px',
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
                      style={{ position: 'relative', display: 'inline-block' }}
                    >
                      <img
                        src={formData.image}
                        alt="Preview"
                        style={{
                          width: '100px',
                          height: '100px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: '2px solid #eaecf0',
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
                          top: '-10px',
                          right: '-10px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '26px',
                          height: '26px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}
                        title="Remove Image"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: '#fff5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ef4444',
                        }}
                      >
                        <Package size={24} />
                      </div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: '#475467',
                          fontWeight: '500',
                        }}
                      >
                        <span style={{ color: '#ef4444', fontWeight: '600' }}>
                          Click to upload
                        </span>{' '}
                        image
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#667085' }}>
                        PNG, JPG up to 5MB
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Product Name */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label
                  className="required"
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
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
                    padding: '10px 14px',
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

              {/* Price and Type Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div className="form-group">
                  <label
                    className="required"
                    style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: '600',
                      fontSize: '0.9rem',
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
                      padding: '10px 14px',
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
                      marginBottom: '6px',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      color: '#344054',
                    }}
                  >
                    Type
                  </label>
                  <select
                    value={formData.dietary_type}
                    onChange={(e) =>
                      handleInputChange('dietary_type', e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '10px 14px',
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
                    <option value="veg">🟢 Veg</option>
                    <option value="non-veg">🔴 Non-Veg</option>
                  </select>
                </div>
              </div>

              {/* Category - Proper Dropdown */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    color: '#344054',
                  }}
                >
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    handleInputChange('category', e.target.value)
                  }
                  style={{
                    width: '100%',
                    padding: '10px 14px',
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
                  <option value="">Select or add category...</option>
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="" disabled style={{ background: '#f3f4f6' }}>
                    ─ Add New Category Below ─
                  </option>
                </select>
              </div>

              {/* Custom Category Input */}
              {formData.category &&
                !existingCategories.includes(formData.category) && (
                  <div
                    className="form-group"
                    style={{
                      marginBottom: '16px',
                      padding: '12px',
                      background: '#f0fdf4',
                      borderRadius: '8px',
                      border: '1px solid #86efac',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#166534',
                        fontWeight: '500',
                      }}
                    >
                      ✓ New category: <strong>{formData.category}</strong>
                    </div>
                  </div>
                )}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    handleInputChange('category', e.target.value)
                  }
                  placeholder="Or type new category name..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d0d5dd',
                    fontSize: '0.9rem',
                    background: 'white',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>

              {/* Description */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: '600',
                    fontSize: '0.9rem',
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
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d0d5dd',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    minHeight: '70px',
                    fontFamily: 'inherit',
                    background: 'white',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>
            </div>

            <div
              className="modal-actions product-form-actions"
              style={{
                padding: '16px 24px',
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
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #d0d5dd',
                  background: 'white',
                  color: '#344054',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
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
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: '#ef4444',
                  color: 'white',
                  fontWeight: '600',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem',
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          padding: '24px 30px',
          background: '#ffffff',
          borderBottom: '2px solid #f3f4f6',
          minHeight: '100px',
        }}
      >
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
          style={{
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 24px',
            fontSize: '1.1rem',
            fontWeight: '600',
            borderRadius: '10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#dc2626';
            e.currentTarget.style.boxShadow =
              '0 6px 16px rgba(239, 68, 68, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ef4444';
            e.currentTarget.style.boxShadow =
              '0 4px 12px rgba(239, 68, 68, 0.3)';
          }}
        >
          <Plus size={28} />
          Add Product
        </button>

        <div
          className="search-input-container"
          style={{
            flex: 1,
            minWidth: '250px',
            maxWidth: '600px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#f8fafc',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '2px solid #e2e8f0',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#ef4444';
            e.currentTarget.style.background = '#fff5f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.background = '#f8fafc';
          }}
        >
          <Search size={24} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '1.05rem',
              padding: '8px 0',
              outline: 'none',
              color: '#1f2937',
            }}
          />
        </div>
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
                  background: 'white',
                  borderRadius: '12px',
                  border: '1px solid #eaecf0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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
                      <strong
                        style={{
                          fontSize: '1.05rem',
                          color: '#111827',
                          margin: '0 0 4px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {product.name}
                      </strong>
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
                    className="product-management-card-action danger"
                    onClick={() => handleDeleteProduct(product.id)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      color: '#dc2626',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} /> Delete
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
