require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  console.log("=== Checking Orders 235, 236, 237 ===");
  const orderNums = ['W-235', 'W-236', 'W-237'];
  for (const num of orderNums) {
    const snap = await db.collection('orders').where('orderNumber', '==', num).get();
    if (snap.empty) {
      console.log(`Order ${num} NOT FOUND`);
    } else {
      snap.forEach(doc => console.log(`Order ${num} exists: ${doc.data().totalAmount} Rs (Status: ${doc.data().orderStatus})`));
    }
  }

  console.log("\n=== Checking Sales 235, 236, 237 ===");
  for (const num of orderNums) {
    const doc = await db.collection('sales').doc(num).get();
    if (!doc.exists) {
      const snap = await db.collection('sales').where('saleNumber', '==', num).get();
      if (snap.empty) {
        console.log(`Sale ${num} NOT FOUND`);
      } else {
        snap.forEach(d => console.log(`Sale ${num} exists (as field): ${d.data().totalAmount} Rs`));
      }
    } else {
      console.log(`Sale ${num} exists (as Doc ID): ${doc.data().totalAmount} Rs`);
    }
  }
}
run().catch(console.error);
