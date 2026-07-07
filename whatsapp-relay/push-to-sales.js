require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function formatDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function run() {
  const orderNums = ['W-236', 'W-237'];
  
  for (const num of orderNums) {
    const snap = await db.collection('orders').where('orderNumber', '==', num).get();
    if (snap.empty) {
      console.log(`Order ${num} not found in orders collection.`);
      continue;
    }
    
    const orderDoc = snap.docs[0];
    const orderData = orderDoc.data();
    
    // Check if it already exists in sales
    const saleDoc = await db.collection('sales').doc(num).get();
    if (saleDoc.exists) {
      console.log(`Sale ${num} already exists in sales collection.`);
      continue;
    }
    
    // Create the sale object
    const saleDate = orderData.createdAt ? formatDate(orderData.createdAt.toDate()) : formatDate(new Date());
    
    const saleData = {
      saleNumber: num,
      saleDate: saleDate,
      saleType: orderData.orderType || 'dine_in',
      tableNumber: orderData.tableNumber || 'Website',
      customerName: orderData.customerName || '',
      customerPhone: orderData.customerPhone || '',
      subtotal: orderData.subtotal || 0,
      taxAmount: orderData.taxAmount || 0,
      discountAmount: orderData.discountAmount || 0,
      totalAmount: orderData.totalAmount || 0,
      paymentMethod: orderData.paymentMethod || 'cash',
      items: orderData.items || []
    };
    
    // Add to sales collection
    await db.collection('sales').doc(num).set(saleData);
    console.log(`Added ${num} to sales collection.`);
    
    // Update order status to completed
    await orderDoc.ref.update({
      orderStatus: 'completed',
      paymentStatus: 'paid'
    });
    console.log(`Marked order ${num} as completed and paid.`);
  }
}
run().catch(console.error);
