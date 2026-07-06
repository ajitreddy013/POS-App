const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

initializeApp({ credential: cert(require(path.join(__dirname, 'service-account.json'))) });
const db = getFirestore();

async function main() {
  const counterSnap = await db.collection('settings').doc('order_counters').get();
  console.log('\n=== order_counters ===');
  console.log(counterSnap.data());

  const snap = await db.collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  console.log('\n=== Last 20 orders (with timestamps) ===');
  const seen = {};
  snap.docs.forEach(doc => {
    const d = doc.data();
    const num = d.orderNumber;
    const ts = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : 'no-ts';
    const flag = seen[num] ? '  *** DUPLICATE ***' : '';
    seen[num] = (seen[num] || []);
    seen[num].push(ts);
    console.log(`${num}  [${d.source||'kiosk'}/${d.paymentMethod}]  ${d.paymentStatus}  created=${ts}${flag}`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
