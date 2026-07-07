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
  
  let recent = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.orderNumber && (d.orderNumber.includes('23') || d.orderNumber.includes('22'))) {
      recent.push({ id: doc.id, orderNumber: d.orderNumber, date: d.createdAt?.toDate() });
    }
  });

  recent.sort((a,b) => (a.orderNumber > b.orderNumber ? 1 : -1));
  console.log("Recent Orders:");
  console.log(recent);
}
run().catch(console.error);
