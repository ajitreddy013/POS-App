require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snap = await db.collection('orders').get();
  snap.forEach(doc => {
    const data = doc.data();
    if (data.orderNumber && typeof data.orderNumber === 'string' && data.orderNumber.startsWith('W-')) {
      const numPart = data.orderNumber.split('-')[1];
      if (numPart.length >= 4) {
        console.log(`Order: ${data.orderNumber} (Created: ${data.createdAt?.toDate()}) - Source: ${data.source}`);
      }
    }
  });
}
run().catch(console.error);
