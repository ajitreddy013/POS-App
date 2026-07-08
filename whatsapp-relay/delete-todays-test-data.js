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
  
  console.log("Fetching orders from July 7th onwards...");
  const ordersSnap = await db.collection('orders')
    .where('createdAt', '>=', startOfJuly7IST)
    .get();
    
  let batch = db.batch();
  let count = 0;
  
  ordersSnap.forEach(doc => {
    const data = doc.data();
    if (data.totalAmount < 5) {
      console.log(`Deleting order: ${doc.id} (Number: ${data.orderNumber}, Amount: ${data.totalAmount})`);
      batch.delete(doc.ref);
      count++;
    }
  });
  
  console.log("Fetching sales from July 7th...");
  const salesSnap = await db.collection('sales').get();
  
  salesSnap.forEach(doc => {
    const data = doc.data();
    const dateStr = data.sale_date || data.saleDate || '';
    if (dateStr.includes('2026-07-07')) {
      const amt = data.totalAmount || data.total_amount || 0;
      if (amt < 5) {
        console.log(`Deleting sale: ${doc.id} (Number: ${data.saleNumber || data.sale_number}, Amount: ${amt})`);
        batch.delete(doc.ref);
        count++;
      }
    }
  });
  
  if (count > 0) {
    console.log(`Committing deletion of ${count} documents...`);
    await batch.commit();
    console.log("Deletion complete.");
  } else {
    console.log("No documents found with amount < 5 Rs today.");
  }
}

run().catch(console.error);
