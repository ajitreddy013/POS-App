import { dbService } from "../services/dbService";
import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Package, Plus, Edit, Trash2, Search } from 'lucide-react';
import useBarSettings from "../utils/useBarSettings";

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

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const ProductModal = ({ product, onClose, onSave }) => {
    const [formData, setFormData] = useState({
      name: product?.name || '',
      price: product?.price || '',
      image: product?.image || '',
      category: product?.category || '',
      description: product?.description || '',
      dietary_type: product?.dietary_type || 'veg'
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
      if (!formData.price || formData.price <= 0) newErrors.price = 'Valid selling price is required';
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
          counter_stock: product?.counter_stock || 0
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
      setFormData(prev => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }));
      }
    };

    const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))];

    return (
      <div className="modal-overlay">
        <div className="modal product-form-modal" style={{ maxWidth: '440px', width: '90%' }}>
          <div className="modal-header">
            <h3>
              <Package size={24} />
              {product ? 'Edit Product' : 'Add New Product'}
            </h3>
            <button onClick={onClose} className="close-btn" type="button">
              ×
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-content product-form-modal-content" style={{ padding: '24px' }}>
              {errors.submit && (
                <div className="form-error" style={{ marginBottom: '20px', padding: '12px', background: '#fee', borderRadius: '8px' }}>
                  {errors.submit}
                </div>
              )}
              
              <div className="form-section">
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="required" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder="e.g. Cold Coffee"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem'
                    }}
                    required
                  />
                  {errors.name && <div className="form-error" style={{ color: '#d32f2f', fontSize: '0.8rem', marginTop: '4px' }}>{errors.name}</div>}
                </div>
                
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="required" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
                    Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || '')}
                    className={`form-input ${errors.price ? 'error' : ''}`}
                    min="0"
                    step="0.01"
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem'
                    }}
                    required
                  />
                  {errors.price && <div className="form-error" style={{ color: '#d32f2f', fontSize: '0.8rem', marginTop: '4px' }}>{errors.price}</div>}
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className="form-input"
                    placeholder="e.g. Delicious cold coffee with ice cream"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem',
                      resize: 'vertical',
                      minHeight: '60px'
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
                    Type
                  </label>
                  <select
                    value={formData.dietary_type}
                    onChange={(e) => handleInputChange('dietary_type', e.target.value)}
                    className="form-input"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="veg">Veg</option>
                    <option value="non-veg">Non-Veg</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
                    Category
                  </label>
                  <input
                    type="text"
                    list="categories-list"
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    className="form-input"
                    placeholder="Search or type new category..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #d0d5dd',
                      fontSize: '0.95rem'
                    }}
                  />
                  <datalist id="categories-list">
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem', color: '#344054' }}>
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
                      padding: '24px 16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: '#fcfcfc',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
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
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <img 
                          src={formData.image} 
                          alt="Preview" 
                          style={{ width: '100px', height: '100px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #eaecf0' }} 
                        />
                        <button 
                          type="button" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInputChange('image', '');
                          }}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '22px',
                            height: '22px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '12px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                          title="Remove Image"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: '#fff5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ef4444'
                        }}>
                          <Package size={20} />
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475467' }}>
                          <span style={{ color: '#ef4444', fontWeight: '600' }}>Click to upload</span> or drag and drop
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#667085' }}>
                          PNG or JPG (max. 5MB)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions product-form-actions" style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                type="submit" 
                className={`btn btn-primary`}
                disabled={isSubmitting}
                style={{ order: 2 }}
              >
                {isSubmitting ? 'Saving...' : (product ? 'Update Product' : 'Add Product')}
              </button>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ order: 1 }}>
                Cancel
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
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Package size={24} /> 
            {barSettings?.bar_name || 'Product Management'}
            <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 'normal', marginLeft: '10px' }}>
              ({products.length} total)
            </span>
          </h1>
          {barSettings?.bar_name && (
            <p className="page-subtitle" style={{ margin: "4px 0 0 32px", fontSize: "0.85rem", opacity: 0.8 }}>
              Products catalog for {barSettings.bar_name} {barSettings.address && `| 📍 ${barSettings.address}`}
            </p>
          )}
        </div>

        <div className="search-input-container" style={{ flex: 1, minWidth: '200px', maxWidth: '400px', margin: '0 auto' }}>
          <Search size={20} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <button 
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
          style={{ whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Products Grid / Cards */}
      <div className="product-management-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', paddingBottom: '20px' }}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d', gridColumn: '1 / -1', background: 'white', borderRadius: '12px', border: '1px solid #eaecf0' }}>
            {searchTerm ? 'No products found matching your search' : 'No products added yet'}
          </div>
        ) : (
          filteredProducts.map(product => {
            const price = product.price || 0;
            
            return (
              <div key={product.id} className="product-management-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', background: 'white', borderRadius: '12px', border: '1px solid #eaecf0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div className="product-management-card-main" style={{ display: 'flex', gap: '12px' }}>
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #eee' }} 
                    />
                  ) : (
                    <div style={{ width: '64px', height: '64px', borderRadius: '8px', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a0aec0', border: '1px solid #eee' }}>
                      <Package size={24} />
                    </div>
                  )}
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: '1.05rem', color: '#111827', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {product.name}
                      </strong>
                      <span style={{ fontSize: '1.05rem', fontWeight: '700', color: '#059669', marginLeft: '8px' }}>
                        ₹{price.toFixed(2)}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      {product.dietary_type && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '16px',
                          height: '16px',
                          border: `1.5px solid ${product.dietary_type === 'veg' ? '#059669' : '#dc2626'}`,
                          borderRadius: '2px',
                          padding: '2px',
                          flexShrink: 0
                        }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: product.dietary_type === 'veg' ? '#059669' : '#dc2626' }} />
                        </span>
                      )}
                      
                      {product.category && (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: '#f3f4f6',
                          color: '#4b5563',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px'
                        }}>
                          {product.category}
                        </span>
                      )}
                    </div>
                    
                    {product.description && (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                  <button
                    className="product-management-card-action"
                    onClick={() => {
                      setEditingProduct(product);
                      setShowModal(true);
                    }}
                    style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', color: '#374151', fontSize: '0.85rem', fontWeight: '500', cursor: 'pointer' }}
                  >
                    <Edit size={14} /> Edit
                  </button>
                  <button
                    className="product-management-card-action danger"
                    onClick={() => handleDeleteProduct(product.id)}
                    style={{ flex: 1, padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '0.85rem', fontWeight: '500', cursor: 'pointer' }}
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
