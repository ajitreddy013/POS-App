require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const targetDateStr = '2026-07-06';
  const startStr = `${targetDateStr} 00:00:00`;
  const endStr = `${targetDateStr} 23:59:59`;
  
  // Fetch Sales
  const salesSnap = await db.collection('sales')
    .where('saleDate', '>=', startStr)
    .where('saleDate', '<=', endStr)
    .get();

  const saleNums = new Set();
  salesSnap.forEach(doc => {
    const data = doc.data();
    saleNums.add(data.saleNumber || data.orderNumber || doc.id);
  });

  // Fetch Orders
  const ordersSnap = await db.collection('orders').get();
  
  let fixedCount = 0;
  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    if (data.orderNumber && saleNums.has(data.orderNumber)) {
      if (data.orderStatus !== 'completed') {
        console.log(`Fixing order ${data.orderNumber} (currently ${data.orderStatus}) -> completed`);
        await doc.ref.update({
          orderStatus: 'completed',
          paymentStatus: 'paid'
        });
        fixedCount++;
      }
    }
  }
  
  console.log(`Fixed ${fixedCount} orders.`);
}

run().catch(console.error);
