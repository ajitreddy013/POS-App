require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snap = await db.collection('orders').where('orderNumber', '==', 'W-100000').get();
  if (snap.empty) {
    console.log("No W-100000 orders found right now.");
  } else {
    snap.forEach(doc => {
      console.log(`Found NEW W-100000: ${doc.id} created at ${doc.data().createdAt?.toDate()}`);
    });
  }
}
run().catch(console.error);
