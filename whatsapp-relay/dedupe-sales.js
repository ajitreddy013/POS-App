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
  console.log("Fetching all sales...");
  const snapshot = await db.collection('sales').get();
  
  const salesByNumber = {};
  let totalDocs = 0;
  let deletedCount = 0;

  snapshot.forEach(doc => {
    totalDocs++;
    const data = doc.data();
    const saleNumber = data.saleNumber;
    
    if (!saleNumber) {
        return;
    }

    if (!salesByNumber[saleNumber]) {
        salesByNumber[saleNumber] = [];
    }
    salesByNumber[saleNumber].push({ id: doc.id, data });
  });

  console.log(`Total sales docs: ${totalDocs}`);

  for (const [saleNumber, docs] of Object.entries(salesByNumber)) {
      if (docs.length > 1) {
          console.log(`Duplicate found for saleNumber ${saleNumber}: ${docs.length} copies.`);
          const bestDoc = docs[0]; 
          
          const newDocRef = db.collection('sales').doc(String(saleNumber));
          await newDocRef.set(bestDoc.data);
          
          for (const d of docs) {
              if (d.id !== String(saleNumber)) {
                  console.log(`  Deleting duplicate doc ID: ${d.id}`);
                  await db.collection('sales').doc(d.id).delete();
                  deletedCount++;
              }
          }
      } else if (docs.length === 1) {
          const d = docs[0];
          if (d.id !== String(saleNumber)) {
              console.log(`Migrating sale ${saleNumber} from ID ${d.id} to new ID format`);
              await db.collection('sales').doc(String(saleNumber)).set(d.data);
              await db.collection('sales').doc(d.id).delete();
          }
      }
  }

  console.log(`Finished deduplication. Deleted ${deletedCount} duplicate docs.`);
}

run().catch(console.error);
