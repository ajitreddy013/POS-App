// One-time backfill: fills total_cost_price/profit onto existing Firestore
// `sales` docs that predate cost-price tracking, using each item's CURRENT
// product cost price (not a historical snapshot — there isn't one to recover).
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

async function run() {
  const productsSnap = await db.collection('products').get();
  const costByProductId = {};
  productsSnap.forEach((doc) => {
    const data = doc.data();
    costByProductId[Number(doc.id)] = Number(data.cost) || 0;
  });
  console.log(`Loaded ${productsSnap.size} products.`);

  const salesSnap = await db.collection('sales').get();
  console.log(`Scanned ${salesSnap.size} sales.`);

  let eligible = 0;
  let updated = 0;
  let unmatchedItems = 0;
  const samples = [];

  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (sale.total_cost_price !== undefined && sale.total_cost_price > 0) continue;
    if (!Array.isArray(sale.items) || sale.items.length === 0) continue;

    eligible++;

    const items = sale.items.map((item) => {
      const costPrice = costByProductId[Number(item.productId)];
      if (costPrice === undefined) unmatchedItems++;
      return { ...item, costPrice: costPrice || 0 };
    });
    const total_cost_price = items.reduce((sum, i) => sum + i.costPrice * i.quantity, 0);
    const totalAmount = sale.totalAmount || sale.total_amount || 0;
    const profit = totalAmount - total_cost_price;

    if (samples.length < 10) {
      samples.push({
        saleNumber: sale.saleNumber || saleDoc.id,
        saleDate: sale.saleDate,
        before: { total_cost_price: sale.total_cost_price || 0, profit: sale.profit || 0 },
        after: { total_cost_price, profit },
      });
    }

    if (APPLY) {
      await saleDoc.ref.update({ items, total_cost_price, profit });
      updated++;
    }
  }

  console.log(`Eligible for backfill (missing/zero cost): ${eligible}`);
  console.log(`Items with no matching product (cost fell back to 0): ${unmatchedItems}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writes committed)' : 'DRY RUN (no writes)'}`);
  if (APPLY) console.log(`Updated: ${updated}`);
  console.log('Sample of first 10 affected sales:');
  console.log(JSON.stringify(samples, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
