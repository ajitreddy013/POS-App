const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Error: service-account.json not found in whatsapp-relay directory.');
  process.exit(1);
}

try {
  const serviceAccount = require(serviceAccountPath);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  
  (async () => {
    console.log('Searching for orders with name "Sanket"...');
    const ordersRef = db.collection('orders');
    
    // Check both customerName and name fields
    const query1 = await ordersRef.where('customerName', '==', 'Sanket').get();
    const query2 = await ordersRef.where('name', '==', 'Sanket').get();
    
    const docsToDelete = [];
    query1.forEach(doc => docsToDelete.push(doc));
    query2.forEach(doc => {
      if (!docsToDelete.some(d => d.id === doc.id)) {
        docsToDelete.push(doc);
      }
    });
    
    if (docsToDelete.length === 0) {
      console.log('No orders found for "Sanket".');
      return;
    }
    
    console.log(`Found ${docsToDelete.length} document(s) to delete:`);
    for (const doc of docsToDelete) {
      console.log(`Deleting doc ID: ${doc.id}, orderNumber: ${doc.data().orderNumber}`);
      await doc.ref.delete();
    }
    console.log('Deletion completed.');

    // Regenerate the list
    console.log('Regenerating customer list...');
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    
    const customerList = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const name = data.customerName || data.name || 'N/A';
      const phone = data.customerPhone || data.phone || 'N/A';
      
      let itemsStr = 'N/A';
      if (Array.isArray(data.items)) {
        itemsStr = data.items.map(item => `${item.quantity || 1}x ${item.name}`).join(', ');
      }
      
      const date = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : new Date(data.createdAt).toLocaleString()) : 'N/A';
      
      customerList.push({
        name,
        phone,
        items: itemsStr,
        date
      });
    });
    
    // Save to markdown file
    const outputPath = path.join(__dirname, 'customer_orders_list.md');
    let mdContent = '# Customer Orders List\n\n';
    mdContent += '| Name | Phone Number | Items Ordered | Date |\n';
    mdContent += '| --- | --- | --- | --- |\n';
    customerList.forEach(c => {
      mdContent += `| ${c.name} | ${c.phone} | ${c.items} | ${c.date} |\n`;
    });
    
    fs.writeFileSync(outputPath, mdContent);
    console.log(`Saved regenerated list to: ${outputPath}`);
  })();
} catch (err) {
  console.error('Failed to run script:', err);
}
