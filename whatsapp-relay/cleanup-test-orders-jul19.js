// One-off cleanup: removes 6 test orders (all totalAmount: 1, item "Test")
// placed back-to-back on 2026-07-19 right after real order A-420, and rolls
// the shared order_counters sequence back to 420 so real orders don't skip
// ahead. Doc IDs identified via direct Firestore inspection beforehand.
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const ORDER_DOC_IDS = [
  'DsIY0AodJ2FB1iBhNIun', // W-421
  '3pNKwQubuLyKumUdpj7o', // W-422
  '6GyUUzq1aFXZiJJwihqE', // A-423
  'gxwYBqy0Upz2GLbhqS3y', // A-424
  'vy7dHp7L6dvu03sE1O1N', // A-425
  'Oz7GRvYpvLdRWSbTVCFq', // A-426
];

const SALE_DOC_IDS = ['W-421', 'W-422', 'A-423', 'A-424', 'A-425', 'A-426'];

const ROLLBACK_NUMBER = 420;

async function run() {
  const batch = db.batch();
  let count = 0;

  for (const id of ORDER_DOC_IDS) {
    const ref = db.collection('orders').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`SKIP (not found): orders/${id}`);
      continue;
    }
    const d = snap.data();
    if (d.totalAmount !== 1) {
      console.log(`SKIP (totalAmount=${d.totalAmount}, expected 1): orders/${id}`);
      continue;
    }
    console.log(`Deleting orders/${id} (${d.orderNumber}, amt=${d.totalAmount})`);
    batch.delete(ref);
    count++;
  }

  for (const id of SALE_DOC_IDS) {
    const ref = db.collection('sales').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`SKIP (not found): sales/${id}`);
      continue;
    }
    const d = snap.data();
    if (d.totalAmount !== 1) {
      console.log(`SKIP (totalAmount=${d.totalAmount}, expected 1): sales/${id}`);
      continue;
    }
    console.log(`Deleting sales/${id} (${d.saleNumber}, amt=${d.totalAmount})`);
    batch.delete(ref);
    count++;
  }

  if (count !== 12) {
    console.error(`Expected to delete 12 docs, matched ${count}. Aborting without committing.`);
    process.exit(1);
  }

  await batch.commit();
  console.log(`Deleted ${count} documents.`);

  console.log(`Resetting order_counters to ${ROLLBACK_NUMBER}...`);
  await db.collection('settings').doc('order_counters').set(
    {
      totalOrders: ROLLBACK_NUMBER,
      completedAppOrders: ROLLBACK_NUMBER,
      completedWebOrders: ROLLBACK_NUMBER,
    },
    { merge: true }
  );
  console.log('Counters reset.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
