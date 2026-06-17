import { dbService } from "../services/dbService";
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Package, Plus, Edit, Trash2, Search } from 'lucide-react';

const ProductManagement = () => {
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
      image: product?.image || ''
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

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
          category: product?.category || '',
          barcode: product?.barcode || '',
          description: product?.description || '',
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

    return (
      <div className="modal-overlay">
        <div className="modal">
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
            <div className="modal-content">
              {errors.submit && (
                <div className="form-error" style={{ marginBottom: '20px', padding: '12px', background: '#fee', borderRadius: '8px' }}>
                  {errors.submit}
                </div>
              )}
              
              <div className="form-section">
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label className="required">Product Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder="Enter product name"
                    required
                  />
                  {errors.name && <div className="form-error">{errors.name}</div>}
                </div>
                
                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label className="required">Selling Price (₹)</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', parseFloat(e.target.value) || '')}
                    className={`form-input ${errors.price ? 'error' : ''}`}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                  {errors.price && <div className="form-error">{errors.price}</div>}
                </div>

                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Product Image (Photo)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                    {formData.image ? (
                      <img 
                        src={formData.image} 
                        alt="Preview" 
                        style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #ddd' }} 
                      />
                    ) : (
                      <div style={{ width: '60px', height: '60px', borderRadius: '6px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', border: '1px solid #ddd' }}>
                        No Image
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        style={{ fontSize: '0.85rem' }}
                      />
                      {formData.image && (
                        <button 
                          type="button" 
                          onClick={() => handleInputChange('image', '')}
                          className="btn btn-sm btn-danger"
                          style={{ padding: '2px 8px', width: 'fit-content', fontSize: '0.8rem' }}
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button 
                type="submit" 
                className={`btn btn-primary ${isSubmitting ? 'loading' : ''}`}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : (product ? 'Update Product' : 'Add Product')}
              </button>
              <button type="button" onClick={onClose} className="btn btn-secondary">
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
      <div className="page-header">
        <h1><Package size={24} /> Product Management</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
        >
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Total Products Count */}
      <div style={{ marginBottom: '16px', fontSize: '1rem', color: '#555', fontWeight: '500' }}>
        Total Products: <strong style={{ color: '#2c3e50', fontSize: '1.1rem' }}>{products.length}</strong>
      </div>

      {/* Search */}
      <div className="search-section">
        <div className="search-input-container">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search products by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Selling Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
                  {searchTerm ? 'No products found matching your search' : 'No products added yet'}
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => {
                const price = product.price || 0;
                
                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {product.image ? (
                          <img 
                            src={product.image} 
                            alt={product.name} 
                            style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #ddd' }} 
                          />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', border: '1px solid #ddd' }}>
                            <Package size={20} />
                          </div>
                        )}
                        <div>
                          <strong>{product.name}</strong>
                          {product.description && (
                            <>
                              <br />
                              <small style={{ color: '#7f8c8d' }}>
                                {product.description.length > 50 
                                  ? product.description.substring(0, 50) + '...' 
                                  : product.description}
                              </small>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>₹{price.toFixed(2)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setShowModal(true);
                          }}
                          className="btn btn-sm btn-secondary"
                          title="Edit Product"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="btn btn-sm btn-danger"
                          title="Delete Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
