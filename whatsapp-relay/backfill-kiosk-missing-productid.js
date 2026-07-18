// One-off: backfills cost/profit + productId for orders and sales whose items
// were written by the Cashfree-kiosk order path before productId was added to
// its item mapping (src/components/POSSystem.js). Matches items to products
// by NAME (the only reliable key available on these docs) since productId is
// NaN/null/missing on them. Scoped to the exact 10 known-affected order
// numbers identified via manual inspection (see conversation) — not a blanket
// pass over all historical zero-cost docs, which include pre-cost-tracking
// records (before 2026-07-07) that have no recoverable cost data at all.
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'service-account.json'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function normName(n) { return String(n || '').trim().toLowerCase(); }
function isMissingPid(pid) {
  return pid === undefined || pid === null || (typeof pid === 'number' && Number.isNaN(pid));
}

const TARGETS = [
  { orderNumber: 'A-349', orderDocId: 'AYCtJRmlo2GWMpUzfIfP' },
  { orderNumber: 'A-412', orderDocId: 'BCaS5EAmCgOskoIyThwV' },
  { orderNumber: 'A-413', orderDocId: '8J65VrUY70ALcInXJisY' },
  { orderNumber: 'A-414', orderDocId: 'O8ylyuZk6Kp4S6GP2QLc' },
  { orderNumber: 'A-415', orderDocId: '8Ug7BjM7zW7TQrEDxVkG' },
  { orderNumber: 'A-416', orderDocId: 'bxwmr2lkJ5nm2gI5UP9o' },
  { orderNumber: 'A-417', orderDocId: '11oL1RHoI7IzVTroFxcg' },
  { orderNumber: 'A-418', orderDocId: '2Om2ykLmTQi0hi63WhNy' },
  { orderNumber: 'A-88',  orderDocId: 'XGQ8NOLsQICwbzTdhKdV' },
  { orderNumber: 'A-90',  orderDocId: 'bfwEG0g3fP08XQUt5JGM' },
];

async function run() {
  const productsSnap = await db.collection('products').get();
  const costByName = {};
  const idByName = {};
  productsSnap.forEach((d) => {
    const data = d.data();
    const key = normName(data.name);
    costByName[key] = Number(data.cost) || 0;
    idByName[key] = d.id;
  });

  const batch = db.batch();
  let updated = 0;

  for (const { orderNumber, orderDocId } of TARGETS) {
    for (const [coll, docId] of [['orders', orderDocId], ['sales', orderNumber]]) {
      const ref = db.collection(coll).doc(docId);
      const snap = await ref.get();
      if (!snap.exists) {
        console.log(`SKIP (not found): ${coll}/${docId}`);
        continue;
      }
      const d = snap.data();
      if (d.total_cost_price) {
        console.log(`SKIP (already has cost data): ${coll}/${docId}`);
        continue;
      }
      let allMatched = true;
      let totalCost = 0;
      const newItems = d.items.map((it) => {
        const key = normName(it.name);
        const cost = costByName[key];
        if (cost === undefined) allMatched = false;
        const c = cost || 0;
        totalCost += c * (it.quantity || 1);
        return { ...it, costPrice: c, productId: idByName[key] ?? it.productId };
      });
      if (!allMatched) {
        console.log(`SKIP (unmatched item name): ${coll}/${docId} (${orderNumber})`);
        continue;
      }
      const totalAmount = d.totalAmount ?? d.total_amount ?? 0;
      const profit = totalAmount - totalCost;
      console.log(
        `Updating ${coll}/${docId} (${orderNumber}): total_cost_price 0 -> ${totalCost}, profit ${d.profit} -> ${profit}`
      );
      batch.update(ref, { items: newItems, total_cost_price: totalCost, profit });
      updated++;
    }
  }

  await batch.commit();
  console.log(`\nUpdated ${updated} documents.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
