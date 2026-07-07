require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  // Use IST timezone for "today"
  const todayStr = '2026-07-06';
  
  const todayIST = new Date(`${todayStr}T00:00:00+05:30`);
  const tomorrowIST = new Date(`${todayStr}T00:00:00+05:30`);
  tomorrowIST.setDate(tomorrowIST.getDate() + 1);
  
  let deletedOrders = 0;
  try {
    const ordersQuery = db.collection('orders')
      .where('createdAt', '>=', Timestamp.fromDate(todayIST))
      .where('createdAt', '<', Timestamp.fromDate(tomorrowIST));
      
    const ordersSnap = await ordersQuery.get();
    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      const amount = Number(data.totalAmount) || 0;
      if (amount < 5) {
        await doc.ref.delete();
        deletedOrders++;
      }
    }
    console.log(`Deleted ${deletedOrders} test orders from ${todayStr} (amount < 5 Rs).`);
  } catch(e) {
    console.error("Error deleting orders:", e.message);
  }

  let deletedSales = 0;
  try {
    const startStr = `${todayStr} 00:00:00`;
    const endStr = `${todayStr} 23:59:59`;
    
    const salesQuery = db.collection('sales')
      .where('saleDate', '>=', startStr)
      .where('saleDate', '<=', endStr);
      
    const salesSnap = await salesQuery.get();
    for (const doc of salesSnap.docs) {
      const data = doc.data();
      const amount = Number(data.totalAmount) || 0;
      if (amount < 5) {
        await doc.ref.delete();
        deletedSales++;
      }
    }
    console.log(`Deleted ${deletedSales} test sales from ${todayStr} (amount < 5 Rs).`);
  } catch(e) {
    console.error("Error deleting sales:", e.message);
  }
}

run().catch(console.error);
