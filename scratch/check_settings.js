const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'whatsapp-relay', 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.cert(serviceAccount)
  });
} else {
  console.log("No service account found at", serviceAccountPath);
  process.exit(1);
}

const db = admin.firestore();
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
