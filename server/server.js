import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode
} from 'plaid';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);
const clientOrigin = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin: clientOrigin === '*' ? true : clientOrigin }));
app.use(express.json());

const hasPlaidKeys = Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
const plaidEnv = process.env.PLAID_ENV || 'sandbox';

let plaid = null;
if (hasPlaidKeys) {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[plaidEnv],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET
      }
    }
  });
  plaid = new PlaidApi(configuration);
}

// Demo-only in-memory store. Replace with a real encrypted database before production.
const users = new Map();

function getUser(userId = 'local-iphone-user') {
  if (!users.has(userId)) users.set(userId, { accessToken: null, cursor: null, transactions: new Map() });
  return users.get(userId);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, plaid: hasPlaidKeys ? plaidEnv : 'mock' });
});

app.post('/api/create-link-token', async (req, res) => {
  if (!plaid) {
    res.json({ mock: true, message: 'Plaid keys missing. Add PLAID_CLIENT_ID and PLAID_SECRET to server/.env.' });
    return;
  }

  try {
    const userId = req.body.userId || 'local-iphone-user';
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'BillPilot IQ',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      transactions: { days_requested: 730 }
    });
    res.json(response.data);
  } catch (error) {
    console.error('linkTokenCreate failed', error.response?.data || error.message);
    res.status(500).json({ error: 'Could not create Plaid link token', detail: error.response?.data || error.message });
  }
});

app.post('/api/exchange-public-token', async (req, res) => {
  if (!plaid) {
    res.status(501).json({ mock: true, error: 'Plaid backend is not configured.' });
    return;
  }

  try {
    const { public_token: publicToken, userId = 'local-iphone-user' } = req.body;
    if (!publicToken) {
      res.status(400).json({ error: 'public_token is required' });
      return;
    }
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const user = getUser(userId);
    user.accessToken = exchange.data.access_token;
    user.itemId = exchange.data.item_id;
    user.cursor = null;
    user.transactions.clear();
    res.json({ ok: true, item_id: exchange.data.item_id });
  } catch (error) {
    console.error('public token exchange failed', error.response?.data || error.message);
    res.status(500).json({ error: 'Could not exchange Plaid public token', detail: error.response?.data || error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  const userId = req.query.userId || 'local-iphone-user';
  const user = getUser(userId);

  if (!plaid || !user.accessToken) {
    res.json({ mock: true, transactions: mockTransactions() });
    return;
  }

  try {
    await syncPlaidTransactions(user);
    const transactions = [...user.transactions.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json({ mock: false, cursor: user.cursor, count: transactions.length, transactions });
  } catch (error) {
    console.error('transactions sync failed', error.response?.data || error.message);
    res.status(500).json({ error: 'Could not sync transactions', detail: error.response?.data || error.message });
  }
});

app.post('/api/webhook/plaid', async (req, res) => {
  // In production, validate and route this webhook by item_id, then call /transactions/sync.
  console.log('Plaid webhook received', req.body?.webhook_type, req.body?.webhook_code);
  res.json({ ok: true });
});

async function syncPlaidTransactions(user) {
  let cursor = user.cursor || undefined;
  let hasMore = true;
  let safety = 0;

  while (hasMore && safety < 20) {
    const response = await plaid.transactionsSync({
      access_token: user.accessToken,
      cursor,
      count: 500,
      options: { include_original_description: true }
    });
    const data = response.data;

    for (const txn of data.added || []) user.transactions.set(txn.transaction_id, txn);
    for (const txn of data.modified || []) user.transactions.set(txn.transaction_id, txn);
    for (const removed of data.removed || []) user.transactions.delete(removed.transaction_id);

    cursor = data.next_cursor;
    hasMore = data.has_more;
    safety += 1;
  }

  user.cursor = cursor;
}

function mockTransactions() {
  const today = new Date();
  const makeDate = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };
  return [
    { id: 'mock_1', date: makeDate(3), name: 'NETFLIX.COM', amount: 15.49, category: 'Streaming', account: 'Mock Visa' },
    { id: 'mock_2', date: makeDate(33), name: 'NETFLIX.COM', amount: 15.49, category: 'Streaming', account: 'Mock Visa' },
    { id: 'mock_3', date: makeDate(63), name: 'NETFLIX.COM', amount: 15.49, category: 'Streaming', account: 'Mock Visa' },
    { id: 'mock_4', date: makeDate(5), name: 'SPOTIFY USA', amount: 11.99, category: 'Streaming', account: 'Mock Mastercard' },
    { id: 'mock_5', date: makeDate(35), name: 'SPOTIFY USA', amount: 11.99, category: 'Streaming', account: 'Mock Mastercard' },
    { id: 'mock_6', date: makeDate(65), name: 'SPOTIFY USA', amount: 11.99, category: 'Streaming', account: 'Mock Mastercard' },
    { id: 'mock_7', date: makeDate(8), name: 'VERIZON WIRELESS', amount: 82.10, category: 'Phone/Internet', account: 'Mock Checking' },
    { id: 'mock_8', date: makeDate(38), name: 'VERIZON WIRELESS', amount: 82.10, category: 'Phone/Internet', account: 'Mock Checking' },
    { id: 'mock_9', date: makeDate(68), name: 'VERIZON WIRELESS', amount: 82.10, category: 'Phone/Internet', account: 'Mock Checking' },
    { id: 'mock_10', date: makeDate(2), name: 'GROCERY MARKET', amount: 58.42, category: 'Food', account: 'Mock Checking' }
  ];
}

app.listen(port, () => {
  console.log(`BillPilot IQ backend running on http://localhost:${port}`);
  console.log(hasPlaidKeys ? `Plaid environment: ${plaidEnv}` : 'Plaid keys missing: running in mock mode');
});
