/**
 * Returns true if the 1+1 offer is enabled AND today (IST) is one of the selected offer dates.
 */
export function isOfferActiveToday(barSettings) {
  if (!barSettings?.offer_enabled) return false;
  const dates = barSettings.offer_dates || [];
  if (dates.length === 0) return false;
  // Convert current UTC time to IST (UTC+5:30)
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const today = istDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  return dates.includes(today);
}

/**
 * Given an array of cart items [{ name, price, quantity }], calculates the 1+1 offer discount.
 * Rule: sort all units by price descending; the cheapest floor(n/2) units are free.
 * Returns { discountAmount: number, freeItems: [{ name, price }] }
 */
export function calculateOfferDiscount(cartItems) {
  const flat = [];
  cartItems.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) {
      flat.push({ name: item.name, price: Number(item.price) });
    }
  });
  flat.sort((a, b) => b.price - a.price);
  const freeCount = Math.floor(flat.length / 2);
  if (freeCount === 0) return { discountAmount: 0, freeItems: [] };
  const freeItems = flat.slice(flat.length - freeCount);
  const discountAmount = freeItems.reduce((sum, item) => sum + item.price, 0);
  return { discountAmount, freeItems };
}
