const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePrintBillItem = (item = {}) => ({
  ...item,
  menuItemId: item.menuItemId || item.productId || item.id || '',
  name: item.name || item.menuItemName || 'Item',
  quantity: toNumber(item.quantity || item.qty || item.currentQty || item.sentQty),
  unitPrice: toNumber(item.unitPrice || item.basePrice || item.rate),
  totalPrice: toNumber(
    item.totalPrice ||
      item.totalAmount ||
      item.lineTotal ||
      item.amount ||
      item.total
  ),
  section: item.section || item.sectionName || item.section_name || '',
  subCategory: item.subCategory || item.sub_category || '',
  reportGroup: item.reportGroup || item.report_group || '',
  isBarItem: Boolean(item.isBarItem || item.is_bar_item),
});

const normalizePrintBillItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((item) => normalizePrintBillItem(item));

module.exports = {
  normalizePrintBillItem,
  normalizePrintBillItems,
};
