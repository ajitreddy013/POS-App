require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snap = await db.collection('sales').get();
  
  snap.forEach(doc => {
    const data = doc.data();
    const sn = data.saleNumber || '';
    const on = data.orderNumber || '';
    if (String(sn).includes('10000') || String(on).includes('10000')) {
      console.log("Found in sales - ID:", doc.id, "saleNumber:", sn, "orderNumber:", on, "totalAmount:", data.totalAmount);
    }
  });
}
run().catch(console.error);
