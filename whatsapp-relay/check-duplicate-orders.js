require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount;

if (fs.existsSync(serviceAccountPath)) {
  serviceAccount = require(serviceAccountPath);
} else {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env or service-account.json");
    process.exit(1);
  }
  serviceAccount = JSON.parse(
    Buffer.from(serviceAccountKey, 'base64').toString('utf8')
  );
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function run() {
  console.log("Fetching all orders...");
  const snapshot = await db.collection('orders').get();
  
  const ordersByNumber = {};
  let totalDocs = 0;
  let duplicateCount = 0;

  snapshot.forEach(doc => {
    totalDocs++;
    const data = doc.data();
    const orderNumber = data.orderNumber;
    
    if (!orderNumber) return;

    if (!ordersByNumber[orderNumber]) {
        ordersByNumber[orderNumber] = [];
    }
    ordersByNumber[orderNumber].push({ id: doc.id, data });
  });

  console.log(`Total order docs: ${totalDocs}`);

  for (const [orderNumber, docs] of Object.entries(ordersByNumber)) {
      if (docs.length > 1) {
          console.log(`Duplicate found for orderNumber ${orderNumber}: ${docs.length} copies.`);
          duplicateCount++;
          
          // Delete extras
          // Keep the first one, delete the rest
          for (let i = 1; i < docs.length; i++) {
              console.log(`  Deleting duplicate order doc ID: ${docs[i].id}`);
              await db.collection('orders').doc(docs[i].id).delete();
          }
      }
  }

  console.log(`Found ${duplicateCount} order numbers with duplicates and deleted the extras.`);
}

run().catch(console.error);
