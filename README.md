# BillPilot IQ

BillPilot IQ is an iPhone-ready Progressive Web App for tracking subscriptions, bills, recurring payments, budgets, and savings opportunities.

It includes:

- Manual subscription and bill tracker
- Weekly, biweekly, monthly, quarterly, twice-yearly, yearly, and custom-day schedules
- Smart dashboard with due-soon totals, monthly recurring cost, annual cost, and income-left-after-bills
- Category budgets
- Recurring-charge detection from imported or synced transactions
- CSV import for bank/card exports
- JSON backup export/import
- iPhone Calendar `.ics` reminder export
- Offline app shell with a service worker
- Plaid sandbox backend template for bank/card linking

## Important iPhone note

iOS does not let a normal app or web app run unlimited code in the background forever. BillPilot IQ is designed to be available anytime from your Home Screen, work offline after it loads once, and create iPhone Calendar reminders that can alert you even when the app is closed.

For live bank/card updates while the app is closed, run the backend and use Plaid webhooks or scheduled server jobs. The iPhone app can then sync when opened.

## Fastest way to try it on your computer

From this folder:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

If your `python3` command points to a custom virtual environment that hangs, use `/usr/bin/python3 -m http.server 8080` on macOS/Linux.

## Use it on your iPhone

1. Deploy the contents of this folder to an HTTPS host such as Netlify, Vercel, Cloudflare Pages, GitHub Pages, or your own server.
2. Open the HTTPS URL in Safari on your iPhone.
3. Tap Share.
4. Tap **Add to Home Screen**.
5. Open **BillPilot IQ** from your Home Screen.

Service workers and bank connections require HTTPS outside of localhost.

## CSV import format

BillPilot IQ accepts common bank export names. The safest columns are:

```csv
date,description,amount,category,account
2026-04-26,NETFLIX.COM,15.49,Streaming,Apple Card
```

Required columns:

- `date`
- `description`, `name`, `merchant`, or `payee`
- `amount`

Optional columns:

- `category`
- `account` or `card`

A sample is included at `sample-bank-export.csv`.

## Bank/card connection with Plaid sandbox

The frontend never stores Plaid secrets. The `server/` folder contains a small Express backend that creates Plaid Link tokens, exchanges public tokens, and syncs transactions.

### Start the backend

```bash
cd server
npm install
cp .env.example .env
# Edit .env and add your Plaid sandbox keys
npm start
```

The backend runs on:

```text
http://localhost:8787
```

### Connect the iPhone app to the backend

For a physical iPhone, the backend must be reachable over HTTPS. During development you can use a secure tunnel such as Cloudflare Tunnel, ngrok, or a deployed backend URL.

In BillPilot IQ:

1. Open **Settings**.
2. Paste the backend URL in **Backend API base URL**.
3. Tap **Save API URL**.
4. Go to **Bank**.
5. Tap **Connect bank/card**.

Without Plaid keys, the backend runs in mock mode and returns demo transactions so you can test recurring-charge detection.

## Production security checklist

Before using real bank/card data in production:

- Add user authentication.
- Store Plaid access tokens in an encrypted database, not in memory.
- Never put `PLAID_SECRET` in the frontend.
- Restrict CORS to your deployed app domain.
- Use HTTPS everywhere.
- Implement Plaid webhooks and persist `/transactions/sync` cursors.
- Add a privacy policy and deletion/export controls.
- Review Plaid production requirements before requesting production access.

## Files

```text
index.html              iPhone-ready app shell
styles.css              Responsive iPhone-first styling
app.js                  Tracker, budgeting, CSV import, insights, Plaid client hook
sw.js                   Offline service worker
manifest.webmanifest    Home Screen app metadata
assets/                 App icons
sample-bank-export.csv  Import test file
server/                 Plaid sandbox backend
```

## What to build next

Recommended next upgrades:

- Cloud account login so data syncs across devices
- Real push notifications from the backend for due dates
- Receipt/photo attachment support
- Subscription price-change tracking
- Widgets or a native iOS wrapper with Capacitor/SwiftUI
- Shared household budgets
