# Code Documentation - Malabar Waffle POS & Customer Website

## Overview
This is a modern, real-time Point of Sale (POS) and Online Ordering system built specifically for Malabar Waffle. The system consists of an Android POS application (for in-store management) and a Customer Web Application (for online ordering). Both applications are synchronized in real-time via Firebase Firestore.

## Architecture & Technology Stack

### 1. Admin POS Application
- **Frontend**: React 18
- **Mobile Wrapper**: Capacitor 8 (compiles to native Android)
- **Local Storage**: Dexie.js (IndexedDB) for robust offline-first functionality
- **Real-time Sync**: Firebase Firestore for live order synchronization
- **Routing**: React Router
- **UI Icons**: Lucide React

### 2. Customer Web Application (`/customer-website`)
- **Frontend**: React 19 & Vite
- **Database**: Firebase Firestore
- **Payments**: Cashfree Payment Gateway integration
- **Routing**: React Router (Browser based)

### 3. Backend Relay (`/whatsapp-relay`)
- **Note on Naming:** This directory was formerly used for WhatsApp receipt sending, but the messaging component has been fully removed. The folder name remains `whatsapp-relay` strictly to maintain compatibility with existing deployment configurations on Render.
- **Function**: A Node.js / Express service that handles:
  1. Cashfree Payment Gateway order creation and verification.
  2. Firebase Admin SDK operations (e.g., granting staff claims).
  3. FCM (Firebase Cloud Messaging) push notification dispatching to the POS devices when new online orders arrive.

## Core Features & Data Flow

### Offline-First POS (Dexie + Firebase)
The POS is designed to function smoothly even during intermittent internet connectivity:
- The catalog (Products/Menu) is managed locally via Dexie.
- Online orders arrive via Firebase Firestore snapshot listeners (`LiveOrdersScreen.js`).
- In-store orders are created locally, and the unified view allows staff to see Dine-in, Pickup, and Delivery orders in one place.

### The Order Lifecycle (Customer Website -> POS)
1. Customer visits the Vite web app and builds a cart.
2. Customer selects Checkout.
3. The web app calls the backend relay to generate a Cashfree session.
4. Customer completes payment via Cashfree drop-in checkout.
5. Upon success, the backend relay securely records the order into Firestore.
6. The POS application's Firestore snapshot listener instantly detects the new document and sounds an alert/push notification.
7. Kitchen staff fulfills the order from the Live Orders screen.

## Database Design

### Local Database (Dexie IndexedDB)
- **Products**: The main catalog of waffles, beverages, and add-ons.
- **Categories**: Organization of products.
- **Sales**: Locally recorded transactions (Cash/UPI).
- **Spendings**: Business expenses.

### Cloud Database (Firebase Firestore)
- **`live_orders` collection**: Where the customer website pushes paid orders, and where the POS app listens for them.
- **`users` collection**: For staff authentication and device tokens.

## Development Guidelines

### Building the Android POS
The POS application relies on Capacitor to bridge web tech to native Android.
```bash
# 1. Build the React web assets
npm run build

# 2. Sync web assets into the Android native project
npx cap sync

# 3. Open Android Studio to compile the APK
npx cap open android
```

### Developing the Customer Website
The Vite development server provides HMR (Hot Module Replacement):
```bash
cd customer-website
npm run dev
```

### Security & Deployment
- The backend relay relies on a `service-account.json` to securely communicate with Firebase Admin.
- The POS device authenticates via a pre-shared `REACT_APP_POS_DEVICE_KEY` that matches the backend relay to prevent unauthorized devices from listening to orders.
- Firestore Rules (`firestore.rules`) strictly enforce that only authenticated users (or the backend Admin) can write verified orders.
