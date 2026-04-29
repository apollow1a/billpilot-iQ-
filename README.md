# BillPilot IQ Advanced

BillPilot IQ Advanced is an iPhone-ready Progressive Web App for tracking subscriptions, bills, recurring payments, budgets, CSV/bank transactions, reminders, and savings opportunities.

This version adds the new **AI Coach / Autopilot** area so the app feels more like a smart money command center instead of a simple bill list.

## Advanced features added

- Autopilot health score
- Autopilot Brain preview on the Home screen
- 60-day cash-pressure forecast
- Paycheck forecasting based on pay frequency and next payday
- Cash buffer and comfort-cushion settings
- Smart savings missions ranked by estimated monthly impact and confidence
- What-if lab to test canceling, pausing, or negotiating bills
- Subscription and category pile-up scanner
- Trial/cancel-by date tracking
- Contract or promo-end tracking
- Cancellation/manage URL storage
- Price-change anomaly detection from imported transactions
- Spend-pulse comparison from CSV/bank data
- Hidden recurring-charge detector
- Manual-payment risk alerts
- Category budgets and over-budget alerts
- JSON backup export/import
- iPhone Calendar `.ics` reminder export
- Offline app shell with service worker
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

## Update your GitHub Pages app

You already have GitHub Pages working. To upgrade:

1. Unzip this new ZIP.
2. Open the `billpilot-iq` folder.
3. Upload/replace these files in your existing GitHub repo:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `sw.js`
   - `manifest.webmanifest`
   - `sample-bank-export.csv`
   - `README.md`
   - `assets/`
   - `server/`
4. Commit changes.
5. Wait 2-5 minutes for GitHub Pages to rebuild.
6. Open your app link and refresh.

Because the service worker cache was updated to version 2, the app should refresh after GitHub Pages deploys. If your iPhone still shows the old version, close the app, reopen Safari, refresh the GitHub Pages URL, then open from the Home Screen again.

## Use it on your iPhone

1. Deploy the contents of this folder to an HTTPS host such as GitHub Pages, Netlify, Vercel, Cloudflare Pages, or your own server.
2. Open the HTTPS URL in Safari on your iPhone.
3. Tap Share.
4. Tap **Add to Home Screen**.
5. Open **BillPilot IQ** from your Home Screen.

Service workers and bank connections require HTTPS outside of localhost.

## Best free setup

To keep the app free:

- Use **+ Add** for your real bills and subscriptions.
- Use **Budget** for income and category limits.
- Use **Settings -> Smart profile** for cash buffer, savings goal, pay frequency, and next payday.
- Use **Bank -> Import CSV** for transaction intelligence.
- Use **AI Coach** for the advanced features.
- Ignore **Connect bank/card** unless you are ready to run a backend.

Do not upload real bank CSV files to GitHub. Import CSV files only inside the app.

## CSV import format

BillPilot IQ accepts common bank export names. The safest columns are:

```csv
date,description,amount,category,account
2026-04-26,NETFLIX.COM,17.99,Streaming,Apple Card
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
index.html              iPhone-ready app shell and AI Coach screens
styles.css              Responsive iPhone-first advanced styling
app.js                  Tracker, budgeting, CSV import, insights, Autopilot, Plaid client hook
sw.js                   Offline service worker
manifest.webmanifest    Home Screen app metadata
assets/                 App icons
sample-bank-export.csv  Import test file
server/                 Plaid sandbox backend
```


## Apollo personal-only advanced build

This version is set up as a private local-only build by default:

- New installs start empty instead of using demo bills.
- Your screenshots are included under Settings → Your build images.
- Manual bills, imported CSV transactions, app lock settings, and profile settings stay in this browser/device through localStorage.
- Bank/Plaid buttons are disabled while Local-only mode is on. Use CSV import for the free setup.
- Settings → Data cleanup can remove starter/demo bills if an older version already seeded them.
- Settings → App lock lets you set a local PIN for this device.
- Settings → Export private report creates a JSON report only when you choose to export it.

Important: if you upload this package to a public GitHub repository, the app files and embedded screenshots are public. Your entered bills/transactions are still not uploaded to GitHub because they are stored locally in the browser.
