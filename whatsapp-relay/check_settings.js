const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({
    credential: cert(serviceAccount)
  });
} else {
  console.log("No service account found at", serviceAccountPath);
  process.exit(1);
}

const db = getFirestore();
db.collection('settings').doc('bar_settings').get()
  .then(doc => {
    if (doc.exists) {
      console.log("Firestore Settings:", doc.data());
    } else {
      console.log("No bar_settings document found!");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("Error reading Firestore:", err);
    process.exit(1);
  });
