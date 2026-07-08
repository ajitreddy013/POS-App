require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const startOfJuly7IST = new Date('2026-07-06T18:30:00Z');
  
  console.log("=== TODAY'S ORDERS ===");
  const ordersSnap = await db.collection('orders')
    .where('createdAt', '>=', startOfJuly7IST)
    .get();
    
  ordersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Order: ${data.orderNumber} | Amount: ${data.totalAmount} | ID: ${doc.id}`);
  });
  
  console.log("\n=== TODAY'S SALES ===");
  const salesSnap = await db.collection('sales').get();
  salesSnap.forEach(doc => {
    const data = doc.data();
    const dateStr = data.sale_date || data.saleDate || '';
    if (dateStr.includes('2026-07-07')) {
      console.log(`Sale: ${data.saleNumber || data.sale_number} | Amount: ${data.totalAmount || data.total_amount} | ID: ${doc.id}`);
    }
  });
}
run().catch(console.error);
