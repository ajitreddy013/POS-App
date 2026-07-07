require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');
let serviceAccount = require(serviceAccountPath);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const oldRef = db.collection('sales').doc('W-100000');
  const doc = await oldRef.get();
  
  if (doc.exists) {
    const data = doc.data();
    // Re-assign it to the new number it got in the orders collection (W-235 since it's the 479 amount one)
    const newNumber = 'W-235';
    data.saleNumber = newNumber;
    
    // Write to the new document ID
    const newRef = db.collection('sales').doc(newNumber);
    await newRef.set(data);
    
    // Delete the old one
    await oldRef.delete();
    console.log(`Successfully migrated sale W-100000 to ${newNumber}`);
  } else {
    console.log("No W-100000 sale found in Firestore.");
  }
}
run().catch(console.error);
