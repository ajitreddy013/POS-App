require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snap = await db.collection('admin_devices').get();
  console.log(`Found ${snap.size} admin devices.`);
  snap.forEach(doc => {
    console.log(doc.id, doc.data().updatedAt?.toDate());
  });
}
run().catch(console.error);
