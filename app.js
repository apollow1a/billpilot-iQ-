const STORAGE_KEY = 'billpilot-iq:v1';
const API_BASE_KEY = 'billpilot-iq:api-base';

const CATEGORIES = [
  'Housing', 'Utilities', 'Insurance', 'Phone/Internet', 'Streaming', 'Software',
  'Food', 'Transportation', 'Debt', 'Health', 'Kids/Pets', 'Savings', 'Other'
];

const CATEGORY_COLORS = {
  Housing: '#2563eb', Utilities: '#0f766e', Insurance: '#7c3aed', 'Phone/Internet': '#0891b2',
  Streaming: '#db2777', Software: '#4f46e5', Food: '#ea580c', Transportation: '#65a30d',
  Debt: '#be123c', Health: '#059669', 'Kids/Pets': '#ca8a04', Savings: '#16a34a', Other: '#64748b'
};

const FREQ = {
  weekly: { label: 'Weekly', perYear: 52, months: 0, days: 7, rrule: 'FREQ=WEEKLY;INTERVAL=1' },
  biweekly: { label: 'Biweekly', perYear: 26, months: 0, days: 14, rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  monthly: { label: 'Monthly', perYear: 12, months: 1, days: 0, rrule: 'FREQ=MONTHLY;INTERVAL=1' },
  quarterly: { label: 'Quarterly', perYear: 4, months: 3, days: 0, rrule: 'FREQ=MONTHLY;INTERVAL=3' },
  twiceYearly: { label: 'Twice a year', perYear: 2, months: 6, days: 0, rrule: 'FREQ=MONTHLY;INTERVAL=6' },
  yearly: { label: 'Yearly', perYear: 1, months: 12, days: 0, rrule: 'FREQ=YEARLY;INTERVAL=1' },
  customDays: { label: 'Custom days', perYear: null, months: 0, days: null, rrule: null }
};

const defaultBudgets = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));

let state = loadState();
let activeTab = 'dashboard';
let currentEditId = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function todayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value) {
  if (!value) return todayLocal();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(a, b) {
  const start = todayish(a).getTime();
  const end = todayish(b).getTime();
  return Math.round((end - start) / 86400000);
}

function todayish(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function money(value, options = {}) {
  const currency = state.settings.currency || 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: options.noCents ? 0 : 2
  }).format(Number(value || 0));
}

function id(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    }
  } catch (error) {
    console.warn('Could not load saved state', error);
  }
  return normalizeState(seedState());
}

function normalizeState(input) {
  return {
    bills: Array.isArray(input.bills) ? input.bills.map(normalizeBill) : [],
    transactions: Array.isArray(input.transactions) ? input.transactions.map(normalizeTransaction) : [],
    settings: {
      income: Number(input.settings?.income || 0),
      currency: input.settings?.currency || 'USD',
      alertDays: Number(input.settings?.alertDays ?? 3),
      budgets: { ...defaultBudgets, ...(input.settings?.budgets || {}) },
      bankConnected: Boolean(input.settings?.bankConnected),
      lastNotificationDate: input.settings?.lastNotificationDate || null
    }
  };
}

function normalizeBill(bill) {
  return {
    id: bill.id || id('bill'),
    name: bill.name || 'Untitled',
    type: bill.type === 'bill' ? 'bill' : 'subscription',
    amount: Number(bill.amount || 0),
    frequency: FREQ[bill.frequency] ? bill.frequency : 'monthly',
    customDays: Number(bill.customDays || 30),
    dueDate: bill.dueDate || isoDate(todayLocal()),
    category: CATEGORIES.includes(bill.category) ? bill.category : 'Other',
    paymentMethod: bill.paymentMethod || '',
    autopay: Boolean(bill.autopay),
    active: bill.active !== false,
    priority: bill.priority || 'useful',
    notes: bill.notes || '',
    lastPaid: bill.lastPaid || null,
    createdAt: bill.createdAt || new Date().toISOString(),
    updatedAt: bill.updatedAt || new Date().toISOString()
  };
}

function normalizeTransaction(txn) {
  return {
    id: txn.id || id('txn'),
    date: txn.date || isoDate(todayLocal()),
    name: txn.name || txn.merchant || 'Unknown transaction',
    amount: Number(txn.amount || 0),
    category: txn.category || 'Other',
    account: txn.account || '',
    source: txn.source || 'manual',
    raw: txn.raw || null
  };
}

function seedState() {
  const today = todayLocal();
  return {
    bills: [
      normalizeBill({ name: 'Rent', type: 'bill', amount: 1450, frequency: 'monthly', dueDate: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), category: 'Housing', paymentMethod: 'Bank account', autopay: true, priority: 'essential' }),
      normalizeBill({ name: 'Netflix', type: 'subscription', amount: 15.49, frequency: 'monthly', dueDate: isoDate(new Date(today.getFullYear(), today.getMonth(), 18)), category: 'Streaming', paymentMethod: 'Credit card', autopay: true, priority: 'nice-to-have' }),
      normalizeBill({ name: 'Car insurance', type: 'bill', amount: 118, frequency: 'monthly', dueDate: isoDate(new Date(today.getFullYear(), today.getMonth(), 22)), category: 'Insurance', paymentMethod: 'Debit card', autopay: true, priority: 'essential' }),
      normalizeBill({ name: 'iCloud storage', type: 'subscription', amount: 2.99, frequency: 'monthly', dueDate: isoDate(new Date(today.getFullYear(), today.getMonth(), 9)), category: 'Software', paymentMethod: 'Apple Card', autopay: true, priority: 'useful' })
    ],
    transactions: [],
    settings: {
      income: 4200,
      currency: 'USD',
      alertDays: 3,
      budgets: { ...defaultBudgets, Housing: 1600, Streaming: 60, Software: 80, Insurance: 180, Utilities: 250, 'Phone/Internet': 180, Transportation: 350, Food: 650 },
      bankConnected: false
    }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeBills() {
  return state.bills.filter((bill) => bill.active !== false);
}

function annualCost(bill) {
  const amount = Number(bill.amount || 0);
  if (bill.frequency === 'customDays') {
    const days = Math.max(1, Number(bill.customDays || 30));
    return amount * (365 / days);
  }
  return amount * (FREQ[bill.frequency]?.perYear || 12);
}

function monthlyCost(bill) {
  return annualCost(bill) / 12;
}

function advanceDate(date, bill) {
  const d = new Date(date);
  const freq = FREQ[bill.frequency] || FREQ.monthly;
  if (bill.frequency === 'customDays') {
    d.setDate(d.getDate() + Math.max(1, Number(bill.customDays || 30)));
    return d;
  }
  if (freq.days) {
    d.setDate(d.getDate() + freq.days);
    return d;
  }
  if (freq.months) {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + freq.months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d;
  }
  d.setMonth(d.getMonth() + 1);
  return d;
}

function nextDueDate(bill, from = todayLocal()) {
  let due = parseDate(bill.dueDate);
  const guardLimit = 1000;
  let loops = 0;
  while (due < todayish(from) && loops < guardLimit) {
    due = advanceDate(due, bill);
    loops += 1;
  }
  return due;
}

function upcomingOccurrences(days = 90) {
  const start = todayLocal();
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const items = [];

  activeBills().forEach((bill) => {
    let due = nextDueDate(bill, start);
    let guard = 0;
    while (due <= end && guard < 60) {
      items.push({ bill, due: new Date(due), days: daysBetween(start, due) });
      due = advanceDate(due, bill);
      guard += 1;
    }
  });

  return items.sort((a, b) => a.due - b.due || a.bill.name.localeCompare(b.bill.name));
}

function dueAmountWithin(days) {
  return upcomingOccurrences(days).reduce((sum, occurrence) => sum + Number(occurrence.bill.amount || 0), 0);
}

function categoryMonthlySpend() {
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  activeBills().forEach((bill) => {
    totals[bill.category] = (totals[bill.category] || 0) + monthlyCost(bill);
  });
  return totals;
}

function render() {
  renderMetrics();
  renderBills();
  renderUpcoming();
  renderCalendar();
  renderBudget();
  renderTransactions();
  renderDetectedCharges();
  renderInsights();
  renderSettings();
  updateBankStatus();
}

function renderMetrics() {
  const monthly = activeBills().reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const annual = activeBills().reduce((sum, bill) => sum + annualCost(bill), 0);
  const due7Total = dueAmountWithin(7);
  const due30Total = dueAmountWithin(30);
  const income = Number(state.settings.income || 0);

  $('#monthlyRecurring').textContent = money(monthly);
  $('#monthlyRecurringSub').textContent = `${money(annual, { noCents: true })} per year`;
  $('#due7').textContent = money(due7Total);
  $('#due7Sub').textContent = due7Total > 0 ? `${upcomingOccurrences(7).length} due soon` : 'No urgent bills';
  $('#due30').textContent = money(due30Total);
  $('#due30Sub').textContent = `${upcomingOccurrences(30).length} upcoming items`;
  $('#leftAfterBills').textContent = money(income - monthly);
  $('#leftAfterBillsSub').textContent = income ? `${Math.max(0, Math.round((monthly / income) * 100))}% of income committed` : 'Add income in Budget';
}

function renderBills() {
  const query = ($('#searchInput')?.value || '').trim().toLowerCase();
  const category = $('#categoryFilter')?.value || 'all';
  const type = $('#typeFilter')?.value || 'all';
  const list = $('#billList');
  if (!list) return;

  const bills = state.bills
    .filter((bill) => !query || `${bill.name} ${bill.category} ${bill.paymentMethod}`.toLowerCase().includes(query))
    .filter((bill) => category === 'all' || bill.category === category)
    .filter((bill) => type === 'all' || bill.type === type)
    .sort((a, b) => nextDueDate(a) - nextDueDate(b));

  if (!bills.length) {
    list.innerHTML = `<div class="empty-state card">No bills match that filter. Tap New to add one.</div>`;
    return;
  }

  list.innerHTML = bills.map((bill) => {
    const next = nextDueDate(bill);
    const diff = daysBetween(todayLocal(), next);
    const status = diff < 0 ? 'overdue' : diff <= state.settings.alertDays ? 'soon' : 'ok';
    const statusPill = status === 'overdue'
      ? `<span class="pill danger">Overdue</span>`
      : status === 'soon'
        ? `<span class="pill warn">Due in ${diff}d</span>`
        : `<span class="pill good">Due in ${diff}d</span>`;
    const inactive = bill.active ? '' : `<span class="pill">Paused</span>`;
    return `
      <article class="bill-row ${status === 'overdue' ? 'overdue' : ''}">
        <div class="bill-main">
          <span class="category-dot" style="background:${CATEGORY_COLORS[bill.category] || CATEGORY_COLORS.Other}"></span>
          <div>
            <h3 class="bill-title">${escapeHtml(bill.name)}</h3>
            <p class="bill-meta">${escapeHtml(bill.category)} · ${FREQ[bill.frequency]?.label || 'Monthly'} · next due ${formatDate(next)}</p>
            <div class="pill-row">
              ${statusPill}
              <span class="pill">${bill.autopay ? 'Autopay' : 'Manual pay'}</span>
              <span class="pill">${escapeHtml(bill.paymentMethod || 'No payment method')}</span>
              ${inactive}
            </div>
          </div>
        </div>
        <div class="bill-amount">
          <div>
            <strong>${money(bill.amount)}</strong>
            <small>${money(monthlyCost(bill))}/mo average</small>
          </div>
          <div class="action-row">
            <button class="secondary-btn edit-btn" data-id="${bill.id}">Edit</button>
            <button class="secondary-btn paid-btn" data-id="${bill.id}">Paid</button>
          </div>
        </div>
      </article>`;
  }).join('');

  $$('.edit-btn').forEach((button) => button.addEventListener('click', () => openBillDialog(button.dataset.id)));
  $$('.paid-btn').forEach((button) => button.addEventListener('click', () => markPaid(button.dataset.id)));
}

function renderUpcoming() {
  const mini = $('#upcomingMini');
  if (!mini) return;
  const upcoming = upcomingOccurrences(30).slice(0, 6);
  if (!upcoming.length) {
    mini.innerHTML = `<div class="empty-state">No bills due in the next 30 days.</div>`;
    return;
  }
  mini.innerHTML = upcoming.map(({ bill, due, days }) => `
    <div class="compact-item ${days < 0 ? 'overdue' : ''}">
      <div>
        <strong>${escapeHtml(bill.name)}</strong>
        <p class="bill-meta">${formatDate(due)} · ${days === 0 ? 'Today' : days > 0 ? `in ${days} days` : `${Math.abs(days)} days late`}</p>
      </div>
      <strong>${money(bill.amount)}</strong>
    </div>
  `).join('');
}

function renderCalendar() {
  const list = $('#calendarList');
  if (!list) return;
  const items = upcomingOccurrences(90);
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No upcoming items found.</div>`;
    return;
  }
  let currentMonth = '';
  list.innerHTML = items.map(({ bill, due, days }) => {
    const month = due.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const heading = month !== currentMonth ? `<h3>${month}</h3>` : '';
    currentMonth = month;
    return `${heading}
      <div class="calendar-item ${days < 0 ? 'overdue' : ''}">
        <div>
          <strong>${escapeHtml(bill.name)}</strong>
          <p class="bill-meta">${formatDate(due)} · ${escapeHtml(bill.category)} · ${bill.autopay ? 'autopay' : 'manual pay'}</p>
        </div>
        <strong>${money(bill.amount)}</strong>
      </div>`;
  }).join('');
}

function renderBudget() {
  const list = $('#budgetList');
  if (!list) return;
  const spends = categoryMonthlySpend();
  list.innerHTML = CATEGORIES.map((category) => {
    const budget = Number(state.settings.budgets[category] || 0);
    const spend = spends[category] || 0;
    const pct = budget > 0 ? Math.min(160, (spend / budget) * 100) : spend > 0 ? 100 : 0;
    const over = budget > 0 && spend > budget;
    return `
      <div class="budget-row">
        <div class="budget-info">
          <div class="budget-title"><span>${escapeHtml(category)}</span><span>${money(spend)} / ${budget ? money(budget) : 'No cap'}</span></div>
          <div class="budget-bar"><div class="budget-fill ${over ? 'over' : ''}" style="width:${Math.min(100, pct)}%"></div></div>
          <small>${over ? `${money(spend - budget)} over budget` : `${money(Math.max(0, budget - spend))} room left`}</small>
        </div>
        <input class="budget-input" data-category="${escapeHtml(category)}" inputmode="decimal" type="number" min="0" step="0.01" value="${budget || ''}" placeholder="Monthly cap" />
      </div>`;
  }).join('');
}

function renderTransactions() {
  const list = $('#transactionList');
  if (!list) return;
  const txns = [...state.transactions].sort((a, b) => parseDate(b.date) - parseDate(a.date)).slice(0, 80);
  if (!txns.length) {
    list.innerHTML = `<div class="empty-state">No transactions yet. Import a CSV or connect the Plaid sandbox backend.</div>`;
    return;
  }
  list.innerHTML = txns.map((txn) => `
    <div class="transaction-row">
      <div>
        <strong>${escapeHtml(txn.name)}</strong>
        <p class="bill-meta">${formatDate(parseDate(txn.date))} · ${escapeHtml(txn.category || 'Other')} · ${escapeHtml(txn.account || txn.source || '')}</p>
      </div>
      <strong>${money(Math.abs(txn.amount))}</strong>
    </div>`).join('');
}

function renderDetectedCharges() {
  const target = $('#detectedCharges');
  if (!target) return;
  const detections = detectRecurringCharges();
  if (!detections.length) {
    target.innerHTML = `<div class="empty-state">No recurring charges detected yet. Import at least 2 months of transactions for best results.</div>`;
    return;
  }
  target.innerHTML = detections.map((detection) => `
    <div class="insight">
      <strong>${escapeHtml(detection.name)} · ${money(detection.amount)}</strong>
      <p>${detection.frequencyLabel} pattern from ${detection.count} transactions. Last seen ${formatDate(parseDate(detection.lastDate))}.</p>
      <div class="action-row">
        <button class="secondary-btn add-detected-btn" data-name="${escapeAttr(detection.name)}" data-amount="${detection.amount}" data-frequency="${detection.frequency}">Add to bills</button>
      </div>
    </div>`).join('');
  $$('.add-detected-btn').forEach((button) => button.addEventListener('click', () => addDetectedBill(button.dataset)));
}

function renderInsights() {
  const target = $('#insights');
  if (!target) return;
  const insights = buildInsights();
  $('#savingsScore').textContent = `${Math.max(0, 100 - insights.risk)}%`;
  target.innerHTML = insights.items.length
    ? insights.items.map((item) => `<div class="insight"><strong>${item.title}</strong><p>${item.body}</p></div>`).join('')
    : `<div class="insight"><strong>You are organized.</strong><p>No urgent savings flags. Keep your due dates and payment methods updated.</p></div>`;
}

function renderSettings() {
  const income = $('#incomeInput');
  const alertDays = $('#alertDaysInput');
  const currency = $('#currencyInput');
  const apiBase = $('#apiBaseInput');
  if (income) income.value = state.settings.income || '';
  if (alertDays) alertDays.value = state.settings.alertDays ?? 3;
  if (currency) currency.value = state.settings.currency || 'USD';
  if (apiBase) apiBase.value = localStorage.getItem(API_BASE_KEY) || '';
}

function buildInsights() {
  const items = [];
  let risk = 0;
  const bills = activeBills();
  const monthly = bills.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const subscriptions = bills.filter((bill) => bill.type === 'subscription');
  const niceToHave = bills.filter((bill) => bill.priority === 'nice-to-have');
  const budgetSpends = categoryMonthlySpend();

  if (income && monthly > income * 0.55) {
    risk += 18;
    items.push({
      title: 'Recurring bills are high versus income',
      body: `Recurring items average ${money(monthly)} per month, about ${Math.round((monthly / income) * 100)}% of your income. Try cutting nice-to-have subscriptions first.`
    });
  }

  const dueSoon = upcomingOccurrences(state.settings.alertDays || 3);
  const manualDue = dueSoon.filter(({ bill }) => !bill.autopay);
  if (manualDue.length) {
    risk += 8;
    items.push({
      title: 'Manual payments are due soon',
      body: `${manualDue.map(({ bill }) => bill.name).slice(0, 3).join(', ')} ${manualDue.length > 3 ? 'and more ' : ''}need manual payment. Consider autopay or calendar reminders.`
    });
  }

  const streaming = subscriptions.filter((bill) => bill.category === 'Streaming');
  if (streaming.length >= 3) {
    const spend = streaming.reduce((sum, bill) => sum + monthlyCost(bill), 0);
    risk += 10;
    items.push({
      title: 'Streaming stack check',
      body: `You have ${streaming.length} streaming subscriptions costing about ${money(spend)} per month. Rotating one service at a time can save quickly.`
    });
  }

  const topNice = niceToHave.sort((a, b) => monthlyCost(b) - monthlyCost(a)).slice(0, 3);
  if (topNice.length) {
    const potential = topNice.reduce((sum, bill) => sum + monthlyCost(bill), 0);
    risk += 8;
    items.push({
      title: 'Fast cancel shortlist',
      body: `${topNice.map((bill) => bill.name).join(', ')} are marked nice-to-have. Canceling all would free about ${money(potential)} per month.`
    });
  }

  const yearlyCandidates = subscriptions.filter((bill) => bill.frequency === 'monthly' && bill.amount >= 8).slice(0, 4);
  if (yearlyCandidates.length) {
    const possible = yearlyCandidates.reduce((sum, bill) => sum + annualCost(bill) * 0.1, 0);
    risk += 5;
    items.push({
      title: 'Ask about annual discounts',
      body: `${yearlyCandidates.map((bill) => bill.name).join(', ')} may offer annual billing. If they average 10% off, that is roughly ${money(possible)} per year.`
    });
  }

  CATEGORIES.forEach((category) => {
    const budget = Number(state.settings.budgets[category] || 0);
    const spend = budgetSpends[category] || 0;
    if (budget && spend > budget) {
      risk += 7;
      items.push({
        title: `${category} is over budget`,
        body: `Recurring ${category.toLowerCase()} items are ${money(spend - budget)} over your monthly cap.`
      });
    }
  });

  const detections = detectRecurringCharges();
  if (detections.length) {
    risk += 12;
    items.push({
      title: 'Untracked recurring charges found',
      body: `${detections.slice(0, 3).map((d) => d.name).join(', ')} look recurring in your transactions but are not in the bill list.`
    });
  }

  const paymentGroups = groupBy(bills.filter((bill) => bill.paymentMethod), (bill) => bill.paymentMethod.toLowerCase());
  if (Object.keys(paymentGroups).length >= 4) {
    risk += 4;
    items.push({
      title: 'Payments are spread across many cards/accounts',
      body: `You use ${Object.keys(paymentGroups).length} payment methods. Consolidating can make missed charges and fraud easier to spot.`
    });
  }

  return { risk: Math.min(100, risk), items: items.slice(0, 8) };
}

function detectRecurringCharges() {
  const groups = groupBy(
    state.transactions.filter((txn) => Number.isFinite(txn.amount) && Math.abs(txn.amount) > 1),
    (txn) => normalizeMerchant(txn.name)
  );

  const billNames = activeBills().map((bill) => normalizeMerchant(bill.name));
  const detections = [];

  Object.entries(groups).forEach(([merchant, txns]) => {
    const sorted = txns.sort((a, b) => parseDate(a.date) - parseDate(b.date));
    if (sorted.length < 2) return;
    if (billNames.some((name) => merchant.includes(name) || name.includes(merchant))) return;

    const amounts = sorted.map((txn) => Math.abs(Number(txn.amount))).filter(Boolean);
    const medianAmount = median(amounts);
    if (!medianAmount || medianAmount < 2) return;
    const amountVariance = amounts.reduce((max, amount) => Math.max(max, Math.abs(amount - medianAmount) / medianAmount), 0);
    if (amountVariance > 0.28) return;

    const gaps = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push(Math.abs(daysBetween(parseDate(sorted[i - 1].date), parseDate(sorted[i].date))));
    }
    const gap = median(gaps);
    const freq = guessFrequency(gap);
    if (!freq) return;

    detections.push({
      name: titleCase(merchant),
      amount: medianAmount,
      frequency: freq.key,
      frequencyLabel: freq.label,
      count: sorted.length,
      lastDate: sorted[sorted.length - 1].date
    });
  });

  return detections.sort((a, b) => b.amount - a.amount).slice(0, 12);
}

function guessFrequency(gap) {
  if (gap >= 6 && gap <= 8) return { key: 'weekly', label: 'Weekly' };
  if (gap >= 12 && gap <= 16) return { key: 'biweekly', label: 'Biweekly' };
  if (gap >= 26 && gap <= 35) return { key: 'monthly', label: 'Monthly' };
  if (gap >= 80 && gap <= 100) return { key: 'quarterly', label: 'Quarterly' };
  if (gap >= 170 && gap <= 195) return { key: 'twiceYearly', label: 'Twice a year' };
  if (gap >= 350 && gap <= 380) return { key: 'yearly', label: 'Yearly' };
  return null;
}

function normalizeMerchant(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/PENDING|POS|DEBIT|CREDIT|PURCHASE|ONLINE|AUTOPAY|PAYMENT|RECURRING/g, '')
    .replace(/[0-9#*_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42);
}

function addDetectedBill(dataset) {
  const newBill = normalizeBill({
    name: dataset.name,
    amount: Number(dataset.amount || 0),
    frequency: dataset.frequency || 'monthly',
    dueDate: isoDate(todayLocal()),
    category: 'Other',
    paymentMethod: 'Detected from bank/card',
    autopay: true,
    type: 'subscription'
  });
  state.bills.push(newBill);
  saveState();
  render();
  toast('Detected charge added. Edit the due date when you know it.');
}

function openBillDialog(billId = null) {
  currentEditId = billId;
  const bill = billId ? state.bills.find((item) => item.id === billId) : null;
  $('#dialogTitle').textContent = bill ? 'Edit bill' : 'Add bill';
  $('#billId').value = bill?.id || '';
  $('#billName').value = bill?.name || '';
  $('#billType').value = bill?.type || 'subscription';
  $('#billAmount').value = bill?.amount || '';
  $('#billFrequency').value = bill?.frequency || 'monthly';
  $('#customDays').value = bill?.customDays || 30;
  $('#billDueDate').value = bill?.dueDate || isoDate(todayLocal());
  $('#billCategory').value = bill?.category || 'Other';
  $('#billPayment').value = bill?.paymentMethod || '';
  $('#billPriority').value = bill?.priority || 'useful';
  $('#billAutopay').checked = Boolean(bill?.autopay);
  $('#billActive').checked = bill?.active !== false;
  $('#billNotes').value = bill?.notes || '';
  $('#deleteBillBtn').classList.toggle('hidden', !bill);
  toggleCustomDays();
  $('#billDialog').showModal();
}

function closeBillDialog() {
  $('#billDialog').close();
  currentEditId = null;
}

function saveBillFromForm(event) {
  event.preventDefault();
  const formBill = normalizeBill({
    id: $('#billId').value || undefined,
    name: $('#billName').value.trim(),
    type: $('#billType').value,
    amount: Number($('#billAmount').value || 0),
    frequency: $('#billFrequency').value,
    customDays: Number($('#customDays').value || 30),
    dueDate: $('#billDueDate').value,
    category: $('#billCategory').value,
    paymentMethod: $('#billPayment').value.trim(),
    priority: $('#billPriority').value,
    autopay: $('#billAutopay').checked,
    active: $('#billActive').checked,
    notes: $('#billNotes').value.trim(),
    createdAt: state.bills.find((bill) => bill.id === $('#billId').value)?.createdAt,
    updatedAt: new Date().toISOString()
  });

  if (!formBill.name || !formBill.amount || !formBill.dueDate) {
    toast('Name, amount, and due date are required.');
    return;
  }

  const index = state.bills.findIndex((bill) => bill.id === formBill.id);
  if (index >= 0) state.bills[index] = formBill;
  else state.bills.push(formBill);
  saveState();
  closeBillDialog();
  render();
  toast('Saved.');
}

function deleteCurrentBill() {
  if (!currentEditId) return;
  state.bills = state.bills.filter((bill) => bill.id !== currentEditId);
  saveState();
  closeBillDialog();
  render();
  toast('Deleted.');
}

function markPaid(billId) {
  const bill = state.bills.find((item) => item.id === billId);
  if (!bill) return;
  const next = nextDueDate(bill);
  bill.lastPaid = isoDate(todayLocal());
  bill.dueDate = isoDate(advanceDate(next, bill));
  bill.updatedAt = new Date().toISOString();
  saveState();
  render();
  toast(`${bill.name} marked paid.`);
}

function saveBudgets() {
  $$('.budget-input').forEach((input) => {
    state.settings.budgets[input.dataset.category] = Number(input.value || 0);
  });
  state.settings.income = Number($('#incomeInput').value || 0);
  state.settings.alertDays = Number($('#alertDaysInput').value || 3);
  state.settings.currency = $('#currencyInput').value || 'USD';
  saveState();
  render();
  toast('Budget saved.');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = '';
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quote && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === ',' && !quote) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quote) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

async function importCsv(file) {
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) {
    toast('CSV appears empty.');
    return;
  }
  const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const findIndex = (names) => headers.findIndex((header) => names.some((name) => header.includes(name)));
  const dateIndex = findIndex(['date', 'posted', 'transactiondate']);
  const nameIndex = findIndex(['name', 'description', 'merchant', 'payee']);
  const amountIndex = findIndex(['amount', 'debit', 'charge']);
  const categoryIndex = findIndex(['category']);
  const accountIndex = findIndex(['account', 'card']);

  if (dateIndex < 0 || nameIndex < 0 || amountIndex < 0) {
    toast('CSV needs date, name/description, and amount columns.');
    return;
  }

  const added = [];
  rows.slice(1).forEach((cells) => {
    const rawDate = cells[dateIndex];
    const parsedDate = parseLooseDate(rawDate);
    if (!parsedDate) return;
    const amount = Number(String(cells[amountIndex] || '').replace(/[$,()]/g, '').replace(/^\s*$/, '0'));
    if (!Number.isFinite(amount)) return;
    added.push(normalizeTransaction({
      id: id('csv'),
      date: isoDate(parsedDate),
      name: cells[nameIndex] || 'Imported transaction',
      amount,
      category: cells[categoryIndex] || 'Other',
      account: cells[accountIndex] || 'CSV import',
      source: 'csv'
    }));
  });

  mergeTransactions(added);
  saveState();
  render();
  toast(`Imported ${added.length} transactions.`);
}

function parseLooseDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const iso = /^\d{4}-\d{1,2}-\d{1,2}$/;
  if (iso.test(trimmed)) return parseDate(trimmed);
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let [, m, d, y] = slash;
    if (y.length === 2) y = `20${y}`;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const native = new Date(trimmed);
  return Number.isNaN(native.getTime()) ? null : native;
}

function mergeTransactions(incoming) {
  const seen = new Set(state.transactions.map((txn) => `${txn.date}|${normalizeMerchant(txn.name)}|${Math.round(Math.abs(txn.amount) * 100)}`));
  incoming.forEach((txn) => {
    const key = `${txn.date}|${normalizeMerchant(txn.name)}|${Math.round(Math.abs(txn.amount) * 100)}`;
    if (!seen.has(key)) {
      state.transactions.push(txn);
      seen.add(key);
    }
  });
}

async function connectBank() {
  const apiBase = getApiBase();
  try {
    const response = await fetch(`${apiBase}/api/create-link-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'local-iphone-user' })
    });
    const data = await response.json();
    if (data.mock || !data.link_token) {
      state.settings.bankConnected = false;
      saveState();
      updateBankStatus('Plaid backend is in mock mode. Sync will load demo transactions until you add Plaid keys.');
      toast('Plaid backend mock mode.');
      return;
    }
    if (!window.Plaid) {
      toast('Plaid Link script did not load. Check your internet connection.');
      return;
    }
    const handler = window.Plaid.create({
      token: data.link_token,
      onSuccess: async (publicToken) => {
        await fetch(`${apiBase}/api/exchange-public-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken, userId: 'local-iphone-user' })
        });
        state.settings.bankConnected = true;
        saveState();
        await syncBank();
        toast('Bank/card connected.');
      },
      onExit: () => toast('Bank connection closed.')
    });
    handler.open();
  } catch (error) {
    console.error(error);
    updateBankStatus('Could not reach backend. Run the server or import a CSV instead.');
    toast('Bank backend unavailable.');
  }
}

async function syncBank() {
  const apiBase = getApiBase();
  try {
    const response = await fetch(`${apiBase}/api/transactions?userId=local-iphone-user`);
    const data = await response.json();
    const incoming = (data.transactions || []).map((txn) => normalizeTransaction({
      id: txn.transaction_id || txn.id,
      date: txn.date,
      name: txn.merchant_name || txn.name,
      amount: txn.amount,
      category: Array.isArray(txn.category) ? txn.category[0] : (txn.personal_finance_category?.primary || txn.category || 'Other'),
      account: txn.account_id || txn.account || 'Plaid',
      source: data.mock ? 'plaid-mock' : 'plaid',
      raw: txn
    }));
    mergeTransactions(incoming);
    state.settings.bankConnected = !data.mock;
    saveState();
    render();
    toast(`${incoming.length} transactions synced${data.mock ? ' from mock mode' : ''}.`);
  } catch (error) {
    console.error(error);
    updateBankStatus('Sync failed. Check the backend URL and Plaid keys.');
    toast('Sync failed.');
  }
}

function getApiBase() {
  return (localStorage.getItem(API_BASE_KEY) || '').replace(/\/$/, '');
}

function updateBankStatus(message = null) {
  const box = $('#bankStatus');
  if (!box) return;
  if (message) {
    box.textContent = message;
    return;
  }
  const apiBase = getApiBase() || 'same origin';
  box.textContent = state.settings.bankConnected
    ? `Connected. Backend: ${apiBase}. Transactions stored locally on this device.`
    : `Not connected. Backend: ${apiBase}. Use Plaid sandbox or import CSV.`;
}

function downloadIcs() {
  const calendar = buildIcs();
  downloadFile('billpilot-reminders.ics', calendar, 'text/calendar;charset=utf-8');
}

function buildIcs() {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//BillPilot IQ//Smart Bills//EN',
    'X-WR-CALNAME:BillPilot IQ Reminders'
  ];

  activeBills().forEach((bill) => {
    const due = nextDueDate(bill);
    const rrule = bill.frequency === 'customDays'
      ? `FREQ=DAILY;INTERVAL=${Math.max(1, Number(bill.customDays || 30))}`
      : FREQ[bill.frequency]?.rrule || FREQ.monthly.rrule;
    const alertDays = Math.max(0, Number(state.settings.alertDays || 3));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${bill.id}@billpilot-iq`,
      `DTSTAMP:${icsDateTime(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(due)}`,
      `SUMMARY:${escapeIcs(`Pay ${bill.name} - ${money(bill.amount)}`)}`,
      `DESCRIPTION:${escapeIcs(`${bill.name} due. Category: ${bill.category}. Payment: ${bill.paymentMethod || 'not set'}. Notes: ${bill.notes || ''}`)}`,
      `RRULE:${rrule}`,
      'BEGIN:VALARM',
      `TRIGGER:-P${alertDays}D`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(`${bill.name} due soon`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function icsDate(date) {
  return isoDate(date).replace(/-/g, '');
}

function icsDateTime(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function downloadJson() {
  downloadFile(`billpilot-backup-${isoDate(todayLocal())}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
}

async function importJson(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    state = normalizeState(parsed);
    saveState();
    render();
    toast('Backup imported.');
  } catch (error) {
    console.error(error);
    toast('Could not import backup.');
  }
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Browser notifications are not supported here.');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    checkDueNotifications(true);
    toast('In-app alerts enabled.');
  } else {
    toast('Notifications not enabled.');
  }
}

function checkDueNotifications(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = isoDate(todayLocal());
  if (!force && state.settings.lastNotificationDate === today) return;
  const due = upcomingOccurrences(state.settings.alertDays || 3).slice(0, 4);
  if (!due.length) return;
  const body = due.map(({ bill, days }) => `${bill.name}: ${days === 0 ? 'today' : `in ${days}d`}`).join('\n');
  new Notification('BillPilot IQ reminders', { body, tag: `billpilot-${today}` });
  state.settings.lastNotificationDate = today;
  saveState();
}

function setupStaticControls() {
  CATEGORIES.forEach((category) => {
    const option = new Option(category, category);
    $('#billCategory').append(option);
    $('#categoryFilter').append(new Option(category, category));
  });

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  $('#quickAddBtn').addEventListener('click', () => openBillDialog());
  $('#addBillBtn').addEventListener('click', () => openBillDialog());
  $('#closeDialogBtn').addEventListener('click', closeBillDialog);
  $('#cancelDialogBtn').addEventListener('click', closeBillDialog);
  $('#billForm').addEventListener('submit', saveBillFromForm);
  $('#deleteBillBtn').addEventListener('click', deleteCurrentBill);
  $('#billFrequency').addEventListener('change', toggleCustomDays);
  $('#searchInput').addEventListener('input', renderBills);
  $('#categoryFilter').addEventListener('change', renderBills);
  $('#typeFilter').addEventListener('change', renderBills);
  $('#saveBudgetBtn').addEventListener('click', saveBudgets);
  $('#incomeInput').addEventListener('change', saveBudgets);
  $('#alertDaysInput').addEventListener('change', saveBudgets);
  $('#currencyInput').addEventListener('change', saveBudgets);
  $('#downloadIcsBtn').addEventListener('click', downloadIcs);
  $('#downloadIcsBtn2').addEventListener('click', downloadIcs);
  $('#exportJsonBtn').addEventListener('click', downloadJson);
  $('#jsonInput').addEventListener('change', (event) => importJson(event.target.files[0]));
  $('#enableNotifyBtn').addEventListener('click', enableNotifications);
  $('#resetBtn').addEventListener('click', resetData);
  $('#saveApiBaseBtn').addEventListener('click', saveApiBase);
  $('#connectBankBtn').addEventListener('click', connectBank);
  $('#connectBankBtn2').addEventListener('click', connectBank);
  $('#syncBankBtn').addEventListener('click', syncBank);
  $('#syncBankBtn2').addEventListener('click', syncBank);
  $('#clearTransactionsBtn').addEventListener('click', clearTransactions);
  $('#csvInput').addEventListener('change', (event) => importCsv(event.target.files[0]));
  $('#csvInput2').addEventListener('change', (event) => importCsv(event.target.files[0]));

  if (!window.navigator.standalone && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    $('#installTip').classList.remove('hidden');
  }
}

function switchTab(tabName) {
  activeTab = tabName;
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  $$('.screen').forEach((screen) => screen.classList.toggle('active-screen', screen.id === tabName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleCustomDays() {
  $('#customDaysLabel').classList.toggle('hidden', $('#billFrequency').value !== 'customDays');
}

function saveApiBase() {
  const value = $('#apiBaseInput').value.trim().replace(/\/$/, '');
  if (value) localStorage.setItem(API_BASE_KEY, value);
  else localStorage.removeItem(API_BASE_KEY);
  updateBankStatus();
  toast('API URL saved.');
}

function clearTransactions() {
  state.transactions = [];
  saveState();
  render();
  toast('Transactions cleared.');
}

function resetData() {
  const ok = confirm('Delete all BillPilot IQ data on this device?');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = normalizeState(seedState());
  saveState();
  render();
  toast('Local data reset.');
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'Other';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.add('hidden'), 3200);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}

setupStaticControls();
render();
registerServiceWorker();
checkDueNotifications();
setInterval(checkDueNotifications, 60 * 60 * 1000);
