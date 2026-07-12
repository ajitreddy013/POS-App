// One-time backfill: fills total_cost_price/profit onto existing Firestore
// `sales` AND `orders` docs that predate cost-price tracking, using each
// item's CURRENT product cost price (not a historical snapshot — there
// isn't one to recover).
//
// Fixes BOTH collections deliberately, not just `sales`: App.js's sync
// listener re-creates a device's local Dexie sale from the Firestore
// `orders` doc whenever that device's cache doesn't already have it (e.g.
// after a reinstall, or simply never having been open that day). If only
// `sales` is patched, the underlying `orders` doc still has no cost data,
// so the very next re-sync silently overwrites the fix back to zero.
//
// Usage:
//   node backfill-sale-costs.js            # dry run — logs intended changes only
//   node backfill-sale-costs.js --apply    # actually writes the updates
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

function computeCostFields(items, totalAmount, costByProductId) {
  let unmatchedItems = 0;
  const newItems = items.map((item) => {
    const costPrice = costByProductId[Number(item.productId)];
    if (costPrice === undefined) unmatchedItems++;
    return { ...item, costPrice: costPrice || 0 };
  });
  const total_cost_price = newItems.reduce((sum, i) => sum + i.costPrice * i.quantity, 0);
  const profit = (totalAmount || 0) - total_cost_price;
  return { newItems, total_cost_price, profit, unmatchedItems };
}

async function backfillCollection(name, costByProductId) {
  const snap = await db.collection(name).get();
  console.log(`Scanned ${snap.size} ${name}.`);

  let eligible = 0;
  let updated = 0;
  let unmatchedTotal = 0;
  const samples = [];

  for (const docRef of snap.docs) {
    const data = docRef.data();
    if (data.total_cost_price !== undefined && data.total_cost_price > 0) continue;
    if (!Array.isArray(data.items) || data.items.length === 0) continue;

    eligible++;

    const totalAmount = data.totalAmount || data.total_amount || 0;
    const { newItems, total_cost_price, profit, unmatchedItems } = computeCostFields(
      data.items,
      totalAmount,
      costByProductId
    );
    unmatchedTotal += unmatchedItems;

    if (samples.length < 10) {
      samples.push({
        number: data.saleNumber || data.orderNumber || docRef.id,
        before: { total_cost_price: data.total_cost_price || 0, profit: data.profit || 0 },
        after: { total_cost_price, profit },
      });
    }

    if (APPLY) {
      await docRef.ref.update({ items: newItems, total_cost_price, profit });
      updated++;
    }
  }

  console.log(`  Eligible for backfill (missing/zero cost): ${eligible}`);
  console.log(`  Items with no matching product (cost fell back to 0): ${unmatchedTotal}`);
  if (APPLY) console.log(`  Updated: ${updated}`);
  console.log(`  Sample of first 10 affected ${name}:`);
  console.log(JSON.stringify(samples, null, 2));
}

async function run() {
  const productsSnap = await db.collection('products').get();
  const costByProductId = {};
  productsSnap.forEach((doc) => {
    const data = doc.data();
    costByProductId[Number(doc.id)] = Number(data.cost) || 0;
  });
  console.log(`Loaded ${productsSnap.size} products.`);
  console.log(`Mode: ${APPLY ? 'APPLY (writes committed)' : 'DRY RUN (no writes)'}`);
  console.log('');

  console.log('=== orders ===');
  await backfillCollection('orders', costByProductId);
  console.log('');
  console.log('=== sales ===');
  await backfillCollection('sales', costByProductId);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
