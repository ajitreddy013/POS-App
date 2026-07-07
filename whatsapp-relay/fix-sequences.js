require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  // 1. Fetch the three W-100000 orders, sorted by createdAt to preserve chronological order
  const snap = await db.collection('orders').where('orderNumber', '==', 'W-100000').get();
  const docs = [];
  snap.forEach(d => docs.push(d));
  docs.sort((a, b) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis());

  if (docs.length === 0) {
    console.log("No W-100000 orders found. Maybe already fixed?");
  } else {
    // 2. Assign them W-235, W-236, W-237
    let nextNum = 235;
    for (const doc of docs) {
      const newOrderNum = `W-${nextNum}`;
      console.log(`Updating order ${doc.id} from W-100000 to ${newOrderNum}`);
      await doc.ref.update({
        orderNumber: newOrderNum,
        ticketId: newOrderNum
      });
      nextNum++;
    }
  }

  // 3. Update the counters
  const maxNum = 237; 
  console.log(`Setting order_counters totalOrders to ${maxNum}`);
  await db.collection('settings').doc('order_counters').set({
    totalOrders: maxNum,
    completedWebOrders: maxNum,
    completedAppOrders: maxNum
  }, { merge: true });

  console.log("Done fixing sequences!");
}

run().catch(console.error);
