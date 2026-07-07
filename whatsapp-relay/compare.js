require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const targetDateStr = '2026-07-06';
  const startIST = new Date(`${targetDateStr}T00:00:00+05:30`);
  const endIST = new Date(`${targetDateStr}T23:59:59+05:30`);
  
  console.log(`=== Comparing Orders & Sales for ${targetDateStr} ===`);

  // Fetch Orders
  const ordersSnap = await db.collection('orders')
    .where('createdAt', '>=', Timestamp.fromDate(startIST))
    .where('createdAt', '<=', Timestamp.fromDate(endIST))
    .get();
    
  const orders = new Map();
  ordersSnap.forEach(doc => {
    const data = doc.data();
    if (data.orderNumber) {
      orders.set(data.orderNumber, {
        id: doc.id,
        status: data.orderStatus || 'pending',
        amount: Number(data.totalAmount) || 0
      });
    }
  });

  // Fetch Sales
  const startStr = `${targetDateStr} 00:00:00`;
  const endStr = `${targetDateStr} 23:59:59`;
  const salesSnap = await db.collection('sales')
    .where('saleDate', '>=', startStr)
    .where('saleDate', '<=', endStr)
    .get();

  const sales = new Map();
  salesSnap.forEach(doc => {
    const data = doc.data();
    const sn = data.saleNumber || data.orderNumber || doc.id;
    sales.set(sn, {
      id: doc.id,
      amount: Number(data.totalAmount) || 0
    });
  });

  let totalOrdersAmount = 0;
  let totalSalesAmount = 0;
  let matches = 0;
  let mismatches = [];
  let missingSales = [];
  let missingOrders = [];
  let notCompleted = [];

  for (const [orderNum, orderData] of orders) {
    if (orderData.status === 'completed' || orderData.status === 'paid') {
      totalOrdersAmount += orderData.amount;
      if (sales.has(orderNum)) {
        const saleData = sales.get(orderNum);
        if (saleData.amount !== orderData.amount) {
          mismatches.push(`Amount mismatch for ${orderNum}: Order=${orderData.amount}, Sale=${saleData.amount}`);
        } else {
          matches++;
        }
      } else {
        missingSales.push(`Order ${orderNum} is completed but NOT found in sales.`);
      }
    } else {
      // Not completed. But check if it's in sales!
      if (sales.has(orderNum)) {
        notCompleted.push(`Order ${orderNum} is ${orderData.status} but found in sales!`);
      }
    }
  }

  for (const [saleNum, saleData] of sales) {
    totalSalesAmount += saleData.amount;
    if (!orders.has(saleNum)) {
      missingOrders.push(`Sale ${saleNum} found but NO matching order found for today.`);
    }
  }

  console.log(`\nSummary for ${targetDateStr}:`);
  console.log(`Total Orders (Completed): ${orders.size} total orders processed, ${matches} perfect matches with Sales.`);
  console.log(`Total Completed Orders Amount: ${totalOrdersAmount}`);
  console.log(`Total Sales Amount: ${totalSalesAmount}`);

  if (mismatches.length > 0) {
    console.log(`\nMismatches (${mismatches.length}):`);
    mismatches.forEach(m => console.log(m));
  }
  
  if (missingSales.length > 0) {
    console.log(`\nMissing from Sales (${missingSales.length}):`);
    missingSales.forEach(m => console.log(m));
  }

  if (missingOrders.length > 0) {
    console.log(`\nMissing from Orders (${missingOrders.length}):`);
    missingOrders.forEach(m => console.log(m));
  }

  if (notCompleted.length > 0) {
    console.log(`\nIn Sales but NOT marked completed in Orders (${notCompleted.length}):`);
    notCompleted.forEach(m => console.log(m));
  }
  
  if (mismatches.length === 0 && missingSales.length === 0 && missingOrders.length === 0 && notCompleted.length === 0) {
    console.log(`\n✅ EVERYTHING PERFECTLY MATCHES! No inconsistencies found for ${targetDateStr}.`);
  }
}

run().catch(console.error);
