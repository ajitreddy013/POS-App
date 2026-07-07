# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo actually contains **three separate deployable projects**, plus an Android wrapper:

| Project | Path | What it is |
|---|---|---|
| POS app | `src/` (root `package.json`) | React 18 app, wrapped by Capacitor into an Android app. Runs on the shop's tablet/phone. |
| Android shell | `android/` | Capacitor-generated native project. Rebuilt via `npx cap sync`, don't hand-edit generated files. |
| Customer website | `customer-website/` (own `package.json`) | Separate Vite + React 19 app, public-facing menu/ordering site deployed to Firebase Hosting. Has its own `node_modules`, `.env`, ESLint config. |
| Relay backend | `whatsapp-relay/` (own `package.json`) | Node/Express service deployed to Render (`render.yaml`, service name `pos-app-nqsm`). Despite the directory name, WhatsApp messaging has been removed — it now handles staff auth, Cashfree payments, and admin push notifications via Firebase Admin. Has its own `.env`, `node_modules`. |

When working on one project, `cd` into it — each has independent dependencies and its own lint/build scripts.

## Commands

### POS app (root)
```bash
npm start              # React dev server
npm run build           # production build to build/
npm run lint            # eslint src/**/*.js
npm run lint:fix
npm run format           # prettier --write src/**/*.{js,jsx,css,md}
npm test                 # react-scripts test (CRA/Jest)
npm run android:sync     # npx cap sync — copy web build + plugins into android/
npm run android:open     # open the Android project in Android Studio
```
Run a single test file the CRA way: `npm test -- ProductManagement` (matches by filename, watch mode by default).

Building/running on a device (see `README.md` for full detail):
```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home  # JDK 17/21 only, not 26+
npx cap run android --list
npx cap run android --target=<device-id>
```
Signed release APK: `./build-release-apk.sh` (requires `android/keystore.properties` filled in) — builds, syncs, `gradlew assembleRelease`, copies output to `MalabarWaffle-release.apk`.

### Customer website (`customer-website/`)
```bash
npm run dev       # vite dev server
npm run build     # vite build -> dist/
npm run lint      # eslint .
npm run preview
```

### Relay backend (`whatsapp-relay/`)
```bash
npm start   # node index.js
```
Deploys to Render on push (see [[feedback_git_push_before_render]] memory — Render only sees pushed commits). Needs `service-account.json` or `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` env vars for Firebase Admin, plus Cashfree secrets in `.env` (see `.env.example`).

## Architecture

### Storage model: Dexie is the source of truth, Firestore is the sync/relay layer
The POS app's primary datastore is **Dexie (IndexedDB)**, defined in [src/services/dbService.js](src/services/dbService.js). All product, sales, inventory, spendings, and table data live here and the app is fully usable offline. `dbService` is the single access layer other components call — don't reach into Dexie directly from a component.

Firestore is used selectively, *within* `dbService` methods, for the pieces that need to cross devices:
- **Products/settings**: pushed to Firestore so the public customer website can read the menu/offers.
- **Sales**: written to both Dexie and Firestore (Firestore copy carries a `localId` back-reference).
- **Orders**: customer website writes orders directly to Firestore (`orders` collection) with no login; the POS app's `LiveOrdersScreen` subscribes via `onSnapshot` for the kitchen/live-orders view.

`CODE_DOCUMENTATION.md` at the repo root describes an **older Electron + SQLite3 architecture that no longer exists** — the app was migrated to Capacitor + Dexie in 2026 (see `README.md`'s "Recent Updates"). Don't trust that file for current architecture; treat the README and this file as current.

### Staff auth (why writes need `ensureStaffAuth()`)
`firestore.rules` gates all staff-only writes (products, settings, sales, spendings, order status updates) behind a custom `staff` auth claim. The POS app is the only client that can obtain this claim:
1. POS signs in anonymously to Firebase.
2. It calls `ensureStaffAuth()` ([src/firebase.js](src/firebase.js)), which POSTs its `REACT_APP_POS_DEVICE_KEY` to the relay's `/auth/grant-staff` endpoint.
3. The relay verifies the device key and grants the custom claim; the POS app force-refreshes its ID token to pick it up.

The public customer website never gets this claim — it can only `create` orders and `read` public collections (see `firestore.rules`). If you add a new Firestore-backed feature, decide up front whether it needs staff auth and update `firestore.rules` accordingly (the relay's rules comments explain the reasoning per collection).

### The relay (`whatsapp-relay/`) is a shared backend, not messaging
The directory is a naming relic — WhatsApp (Baileys) messaging was removed entirely (it was unreliable on Render's free tier, which has no persistent disk, so the linked session was lost on every restart/redeploy, forcing a fresh QR scan each time). `whatsapp-relay/index.js` is still the one persistent Node service both the POS app and customer website depend on:
- `/auth/grant-staff` — staff claim issuance (above).
- `/payment/cashfree/*` — Cashfree order creation, kiosk orders, order-status polling, UPI QR, and the payment webhook.
- `/order/reserve-number`, `/order/delete`, device verification.
- An FCM watcher polls Firestore for newly-completed orders and pushes admin push notifications (`sendFCMToAdmins` / `startAdminNotificationWatcher`) — this replaced the old WhatsApp receipt watcher.

It's a single long-running Express process on Render's free tier (`--max-old-space-size=150`), console-log output is buffered in-memory and exposed at `GET /logs` for remote debugging since there's no persistent disk/log aggregation.

### POS app structure
- `src/App.js` — hash-based routing (`HashRouter`, for Capacitor/file:// compatibility), sidebar nav, admin-unlock modal, registers the service worker, and calls `ensureStaffAuth()` on mount.
- `src/components/` — one file per screen (`POSSystem.js`, `ProductManagement.js`, `SalesReports.js`, `TableManagement.js`, `TablePOS.js`, `Settings.js`, `Spendings.js`, `Dashboard.js`, `CustomerMenu.js`, `LiveOrdersScreen.js`, `LandingPage.js`). These are large (many 1000+ lines) — grep/read the specific function you need rather than the whole file.
- `src/services/dbService.js` — the unified Dexie + Firestore access layer described above.
- `src/utils/` — `dateUtils.js` (local-date helpers — prefer these over `new Date().toISOString()` for anything user-facing, since sale/report dates need shop-local time), `feedbackUtils.js` (audio feedback tones), `offerUtils.js`, `printBillPayload.js`, `useBarSettings.js` (hook wrapping `bar_settings`).
- Dual stock system: every product has `godown_stock` (supplier/backroom inventory) and `counter_stock` (sellable stock); "Daily Transfer" moves stock between the two and every movement is auditable.
- Sale types: table service (`saleType: "table"`, tied to a table via `TablePOS.js`/`TableManagement.js`) vs. parcel/takeaway, plus a configurable Parcel Charge.
- Thermal printing (ESC/POS via `escpos`/`escpos-network`/`escpos-serial`/`escpos-usb`) and PDF generation (`jspdf` + `jspdf-autotable`) are used for bills/reports; printer connection type (USB/network/serial) is configured per-shop in `bar_settings`.

### Customer website structure
Vite React 19 app under `customer-website/src/`: `CustomerMenu.jsx` (menu browsing/ordering, reads products/settings from Firestore, writes orders), `CashfreeCheckoutRedirect.jsx` (payment redirect handling), `hooks/useBarSettings.js`. Talks to Firestore directly (client SDK) and to the relay for payment endpoints — never to the POS app's Dexie DB.

## Notable conventions
- Env vars for the POS app must be prefixed `REACT_APP_` (CRA requirement) and are baked in at build time — changing `.env` requires a rebuild, not just a restart.
- `REACT_APP_POS_DEVICE_KEY` (POS app) must match `POS_DEVICE_KEY` in `whatsapp-relay/.env` — they're the shared secret for staff-claim issuance.
- `src/config.js` holds the deployed relay URL (`APP_CONFIG.relayUrl`); the relay must actually be deployed there for staff auth and payments to work end-to-end.
