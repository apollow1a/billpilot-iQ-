const STORAGE_KEY = 'billpilot-iq:v1';
const API_BASE_KEY = 'billpilot-iq:api-base';
const PERSONAL_REPORT_NAME = 'billpilot-apollo-private-report.json';
const DEMO_SIGNATURE = ['Rent:1450', 'Netflix:15.49', 'Car insurance:118', 'iCloud storage:2.99'];
let appUnlocked = false;

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
let selectedWhatIf = new Set();

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
      cashBuffer: Number(input.settings?.cashBuffer || 0),
      monthlySavingsGoal: Number(input.settings?.monthlySavingsGoal || 0),
      cushionFloor: Number(input.settings?.cushionFloor || 0),
      paydayFrequency: ['weekly', 'biweekly', 'monthly'].includes(input.settings?.paydayFrequency) ? input.settings.paydayFrequency : 'monthly',
      paydayDate: input.settings?.paydayDate || isoDate(todayLocal()),
      autopilotMode: ['balanced', 'aggressive', 'gentle'].includes(input.settings?.autopilotMode) ? input.settings.autopilotMode : 'balanced',
      bankConnected: Boolean(input.settings?.bankConnected),
      lastNotificationDate: input.settings?.lastNotificationDate || null,
      ownerName: input.settings?.ownerName || 'Apollo',
      buildLabel: input.settings?.buildLabel || "Apollo's personal build",
      localOnly: input.settings?.localOnly !== false,
      privacyReminder: input.settings?.privacyReminder !== false,
      appLockEnabled: Boolean(input.settings?.appLockEnabled),
      appLockHash: input.settings?.appLockHash || '',
      lockWhenHidden: input.settings?.lockWhenHidden !== false,
      firstRunAt: input.settings?.firstRunAt || new Date().toISOString(),
      dataMode: input.settings?.dataMode || 'personal-only',
      lastCommandPlan: input.settings?.lastCommandPlan || ''
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
    trialEndDate: bill.trialEndDate || '',
    contractEndDate: bill.contractEndDate || '',
    cancelUrl: bill.cancelUrl || '',
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
    bills: [],
    transactions: [],
    settings: {
      income: 0,
      currency: 'USD',
      alertDays: 3,
      budgets: { ...defaultBudgets },
      cashBuffer: 0,
      monthlySavingsGoal: 0,
      cushionFloor: 0,
      paydayFrequency: 'biweekly',
      paydayDate: isoDate(today),
      autopilotMode: 'balanced',
      bankConnected: false,
      ownerName: 'Apollo',
      buildLabel: "Apollo's personal build",
      localOnly: true,
      privacyReminder: true,
      appLockEnabled: false,
      appLockHash: '',
      lockWhenHidden: true,
      firstRunAt: new Date().toISOString(),
      dataMode: 'personal-only',
      lastCommandPlan: ''
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
  renderAutopilot();
  renderBrainPreview();
  renderCommandCenter();
  renderSettings();
  renderPersonalization();
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
    const trialDays = bill.trialEndDate ? daysBetween(todayLocal(), parseDate(bill.trialEndDate)) : null;
    const trialPill = trialDays !== null && trialDays >= 0
      ? `<span class="pill ${trialDays <= 7 ? 'danger' : 'warn'}">Cancel-by in ${trialDays}d</span>`
      : '';
    const contractDays = bill.contractEndDate ? daysBetween(todayLocal(), parseDate(bill.contractEndDate)) : null;
    const contractPill = contractDays !== null && contractDays >= 0 && contractDays <= 45
      ? `<span class="pill warn">Promo ends in ${contractDays}d</span>`
      : '';
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
              ${trialPill}
              ${contractPill}
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
  const cashBuffer = $('#cashBufferInput');
  const savingsGoal = $('#monthlySavingsGoalInput');
  const cushionFloor = $('#cushionFloorInput');
  const paydayFrequency = $('#paydayFrequencyInput');
  const paydayDate = $('#paydayDateInput');
  const autopilotMode = $('#autopilotModeInput');
  if (income) income.value = state.settings.income || '';
  if (alertDays) alertDays.value = state.settings.alertDays ?? 3;
  if (currency) currency.value = state.settings.currency || 'USD';
  if (cashBuffer) cashBuffer.value = state.settings.cashBuffer || '';
  if (savingsGoal) savingsGoal.value = state.settings.monthlySavingsGoal || '';
  if (cushionFloor) cushionFloor.value = state.settings.cushionFloor || '';
  if (paydayFrequency) paydayFrequency.value = state.settings.paydayFrequency || 'monthly';
  if (paydayDate) paydayDate.value = state.settings.paydayDate || isoDate(todayLocal());
  if (autopilotMode) autopilotMode.value = state.settings.autopilotMode || 'balanced';
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

function renderBrainPreview() {
  const target = $('#brainPreview');
  if (!target) return;
  const health = calculateHealth();
  const forecast = buildCashForecast(60);
  const missions = buildMissions();
  const anomalyCount = buildAnomalies().length;
  const lowPoint = forecast.lowPoint;
  target.innerHTML = [
    { label: 'IQ health score', value: `${health.score}%`, sub: health.label },
    { label: 'Projected low cash', value: money(lowPoint.balance), sub: lowPoint.date ? `around ${formatDate(parseDate(lowPoint.date))}` : 'add cash buffer' },
    { label: 'Possible savings', value: money(missions.monthlyImpact), sub: 'monthly mission value' },
    { label: 'Anomalies found', value: String(anomalyCount), sub: anomalyCount ? 'review in AI Coach' : 'nothing urgent' }
  ].map((item) => `
    <div class="brain-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.sub)}</small>
    </div>
  `).join('');
}

function renderAutopilot() {
  if (!$('#autopilot')) return;
  const health = calculateHealth();
  const missions = buildMissions();
  const forecast = buildCashForecast(60);
  const anomalies = buildAnomalies();

  if ($('#healthScoreBig')) $('#healthScoreBig').textContent = `${health.score}%`;
  renderRadarGrid(health, forecast, missions, anomalies);
  renderCashForecast(forecast);
  renderMissions(missions);
  renderWhatIfLab();
  renderAnomalies(anomalies);
}

function renderRadarGrid(health, forecast, missions, anomalies) {
  const target = $('#radarGrid');
  if (!target) return;
  const monthly = activeBills().reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const subscriptions = activeBills().filter((bill) => bill.type === 'subscription');
  const detected = detectRecurringCharges();
  const spendPulse = spendPulseStats();
  const manualSoon = upcomingOccurrences(state.settings.alertDays || 3).filter(({ bill }) => !bill.autopay).length;
  const radar = [
    { title: 'Income pressure', value: income ? `${Math.round((monthly / income) * 100)}%` : 'N/A', body: `${money(monthly)} committed monthly` },
    { title: 'Subscription load', value: String(subscriptions.length), body: `${money(subscriptions.reduce((sum, bill) => sum + monthlyCost(bill), 0))}/mo in subscriptions` },
    { title: 'Upcoming risk', value: String(manualSoon), body: 'manual payments due soon' },
    { title: 'Lowest forecast point', value: money(forecast.lowPoint.balance), body: forecast.lowPoint.date ? formatDate(parseDate(forecast.lowPoint.date)) : 'set cash buffer' },
    { title: 'CSV/bank intelligence', value: String(state.transactions.length), body: `${detected.length} recurring patterns detected` },
    { title: 'Spend pulse', value: spendPulse.label, body: spendPulse.body },
    { title: 'Mission value', value: money(missions.monthlyImpact), body: 'possible monthly improvement' },
    { title: 'Scanner alerts', value: String(anomalies.length), body: health.label }
  ];
  target.innerHTML = radar.map((item) => `
    <article class="radar-card">
      <span>${escapeHtml(item.title)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.body)}</p>
    </article>`).join('');
}

function calculateHealth() {
  const bills = activeBills();
  const monthly = bills.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const dueSoon = upcomingOccurrences(state.settings.alertDays || 3);
  const budgetSpends = categoryMonthlySpend();
  const detections = detectRecurringCharges();
  const anomalies = buildAnomalies({ skipHealth: true });
  let risk = 0;

  if (!income) risk += 15;
  if (income) {
    const ratio = monthly / income;
    if (ratio > 0.75) risk += 35;
    else if (ratio > 0.55) risk += 22;
    else if (ratio > 0.4) risk += 10;
  }
  risk += Math.min(18, dueSoon.filter(({ bill }) => !bill.autopay).length * 5);
  risk += Math.min(18, detections.length * 4);
  Object.entries(budgetSpends).forEach(([category, spend]) => {
    const cap = Number(state.settings.budgets[category] || 0);
    if (cap && spend > cap) risk += 5;
  });
  risk += Math.min(15, anomalies.length * 4);

  const forecast = buildCashForecast(60);
  if (state.settings.cushionFloor && forecast.lowPoint.balance < state.settings.cushionFloor) risk += 12;
  if (state.settings.cashBuffer && forecast.lowPoint.balance < 0) risk += 18;

  const score = clamp(Math.round(100 - risk), 0, 100);
  const label = score >= 85 ? 'elite control' : score >= 70 ? 'healthy' : score >= 50 ? 'watch closely' : 'needs cleanup';
  return { score, label, risk };
}

function buildCashForecast(days = 60) {
  const start = todayLocal();
  let balance = Number(state.settings.cashBuffer || 0);
  const daily = [];
  const eventsByDate = {};

  upcomingOccurrences(days).forEach(({ bill, due }) => {
    const key = isoDate(due);
    eventsByDate[key] = eventsByDate[key] || { income: 0, bills: 0, names: [] };
    eventsByDate[key].bills += Number(bill.amount || 0);
    eventsByDate[key].names.push(bill.name);
  });

  nextPaydates(days).forEach((pay) => {
    const key = isoDate(pay.date);
    eventsByDate[key] = eventsByDate[key] || { income: 0, bills: 0, names: [] };
    eventsByDate[key].income += pay.amount;
    eventsByDate[key].names.push('Paycheck');
  });

  let lowPoint = { date: isoDate(start), balance };
  for (let i = 0; i <= days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = isoDate(date);
    const event = eventsByDate[key] || { income: 0, bills: 0, names: [] };
    balance += event.income;
    balance -= event.bills;
    const day = { date: key, balance, income: event.income, bills: event.bills, names: event.names };
    daily.push(day);
    if (balance < lowPoint.balance) lowPoint = { date: key, balance };
  }

  const weeks = [];
  for (let i = 0; i < daily.length; i += 7) {
    const slice = daily.slice(i, i + 7);
    weeks.push({
      start: slice[0].date,
      end: slice[slice.length - 1].date,
      bills: slice.reduce((sum, day) => sum + day.bills, 0),
      income: slice.reduce((sum, day) => sum + day.income, 0),
      ending: slice[slice.length - 1].balance,
      names: slice.flatMap((day) => day.names).filter(Boolean).slice(0, 5)
    });
  }
  return { daily, weeks, lowPoint };
}

function nextPaydates(days = 60) {
  const income = Number(state.settings.income || 0);
  if (!income) return [];
  const start = todayLocal();
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const frequency = state.settings.paydayFrequency || 'monthly';
  const intervalDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : null;
  const amount = frequency === 'weekly' ? (income * 12) / 52 : frequency === 'biweekly' ? (income * 12) / 26 : income;
  let payday = parseDate(state.settings.paydayDate || isoDate(start));
  let guard = 0;

  while (payday < start && guard < 200) {
    if (intervalDays) payday.setDate(payday.getDate() + intervalDays);
    else payday.setMonth(payday.getMonth() + 1);
    guard += 1;
  }

  const pays = [];
  guard = 0;
  while (payday <= end && guard < 100) {
    pays.push({ date: new Date(payday), amount });
    if (intervalDays) payday.setDate(payday.getDate() + intervalDays);
    else payday.setMonth(payday.getMonth() + 1);
    guard += 1;
  }
  return pays;
}

function renderCashForecast(forecast) {
  const chart = $('#cashflowChart');
  const list = $('#cashflowList');
  if (!chart || !list) return;
  const values = forecast.weeks.map((week) => Math.abs(week.ending));
  const max = Math.max(1, ...values);
  chart.innerHTML = forecast.weeks.map((week) => {
    const width = Math.max(8, Math.round((Math.abs(week.ending) / max) * 100));
    const tone = week.ending < 0 ? 'danger' : week.ending < Number(state.settings.cushionFloor || 0) ? 'warn' : 'good';
    return `
      <div class="forecast-bar ${tone}">
        <span>${escapeHtml(shortDateRange(week.start, week.end))}</span>
        <div><i style="width:${width}%"></i></div>
        <strong>${money(week.ending)}</strong>
      </div>`;
  }).join('');
  list.innerHTML = forecast.weeks.slice(0, 6).map((week) => `
    <div class="compact-item">
      <div>
        <strong>${escapeHtml(shortDateRange(week.start, week.end))}</strong>
        <p class="bill-meta">Bills: ${money(week.bills)} · Income: ${money(week.income)} · ${escapeHtml(week.names.join(', ') || 'no scheduled events')}</p>
      </div>
      <strong>${money(week.ending)}</strong>
    </div>`).join('');
}

function buildMissions() {
  const missions = [];
  const bills = activeBills();
  const monthly = bills.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const mode = state.settings.autopilotMode || 'balanced';
  const aggressiveness = mode === 'aggressive' ? 1.25 : mode === 'gentle' ? 0.75 : 1;

  const nice = bills.filter((bill) => bill.priority === 'nice-to-have').sort((a, b) => monthlyCost(b) - monthlyCost(a));
  if (nice.length) {
    const top = nice.slice(0, mode === 'aggressive' ? 5 : 3);
    const impact = top.reduce((sum, bill) => sum + monthlyCost(bill), 0);
    missions.push(makeMission('Cancel or pause the low-value stack', `Start with ${top.map((bill) => bill.name).join(', ')}. They are marked nice-to-have and cost ${money(impact)} per month.`, impact, 92, 'Today'));
  }

  const negotiable = bills.filter((bill) => ['Utilities', 'Insurance', 'Phone/Internet', 'Transportation'].includes(bill.category) && monthlyCost(bill) >= 30).sort((a, b) => monthlyCost(b) - monthlyCost(a));
  if (negotiable.length) {
    const top = negotiable.slice(0, 3);
    const impact = top.reduce((sum, bill) => sum + monthlyCost(bill) * 0.08 * aggressiveness, 0);
    missions.push(makeMission('Bill negotiation sprint', `Call or chat with ${top.map((bill) => bill.name).join(', ')} and ask for loyalty, autopay, paperless, or competitor-match discounts.`, impact, 72, 'This week'));
  }

  const yearly = bills.filter((bill) => bill.type === 'subscription' && bill.frequency === 'monthly' && monthlyCost(bill) >= 8).slice(0, 4);
  if (yearly.length) {
    const impact = yearly.reduce((sum, bill) => sum + monthlyCost(bill) * 0.1, 0);
    missions.push(makeMission('Annual billing arbitrage', `Check yearly plans for ${yearly.map((bill) => bill.name).join(', ')}. Only switch if you will keep them.`, impact, 64, 'This month'));
  }

  const detected = detectRecurringCharges();
  if (detected.length) {
    const impact = detected.slice(0, 3).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    missions.push(makeMission('Track hidden recurring charges', `${detected.slice(0, 3).map((item) => item.name).join(', ')} appear recurring but are not in your bill list. Add them or cancel them.`, impact, 88, 'Now'));
  }

  const manualSoon = upcomingOccurrences(10).filter(({ bill }) => !bill.autopay);
  if (manualSoon.length) {
    missions.push(makeMission('Missed-payment shield', `Add reminders or autopay for ${manualSoon.slice(0, 4).map(({ bill }) => bill.name).join(', ')}. This protects cash and late fees.`, Math.min(45, manualSoon.length * 12), 80, 'Before due'));
  }

  const goal = Number(state.settings.monthlySavingsGoal || 0);
  if (goal && income && monthly + goal > income) {
    missions.push(makeMission('Savings goal gap plan', `Your savings goal needs ${money(Math.max(0, monthly + goal - income))} more room. Use the What-if lab to build that gap.`, Math.max(0, monthly + goal - income), 76, 'This month'));
  }

  const sorted = missions.sort((a, b) => (b.impact * b.confidence) - (a.impact * a.confidence)).slice(0, 8);
  return { items: sorted, monthlyImpact: sorted.reduce((sum, mission) => sum + mission.impact, 0) };
}

function makeMission(title, body, impact, confidence, urgency) {
  return { title, body, impact: Math.max(0, impact), confidence, urgency };
}

function renderMissions(missions) {
  const target = $('#missionList');
  if (!target) return;
  $('#missionValue').textContent = `${money(missions.monthlyImpact)}/mo`;
  if (!missions.items.length) {
    target.innerHTML = `<div class="empty-state">Add income, budgets, bills, or CSV transactions to unlock smart missions.</div>`;
    return;
  }
  target.innerHTML = missions.items.map((mission) => `
    <article class="mission-card">
      <div>
        <strong>${escapeHtml(mission.title)}</strong>
        <p>${escapeHtml(mission.body)}</p>
      </div>
      <div class="mission-score">
        <span>${money(mission.impact)}/mo</span>
        <small>${mission.confidence}% confidence · ${escapeHtml(mission.urgency)}</small>
      </div>
    </article>`).join('');
}

function renderWhatIfLab() {
  const list = $('#whatIfList');
  if (!list) return;
  const candidates = activeBills()
    .filter((bill) => bill.priority !== 'essential' || bill.type === 'subscription')
    .sort((a, b) => monthlyCost(b) - monthlyCost(a))
    .slice(0, 14);
  if (!candidates.length) {
    list.innerHTML = `<div class="empty-state">Add some subscriptions or useful/nice-to-have bills to run a scenario.</div>`;
    renderWhatIfSummary();
    return;
  }
  list.innerHTML = candidates.map((bill) => `
    <label class="whatif-item">
      <input type="checkbox" class="whatif-check" value="${escapeAttr(bill.id)}" ${selectedWhatIf.has(bill.id) ? 'checked' : ''} />
      <span>
        <strong>${escapeHtml(bill.name)}</strong>
        <small>${escapeHtml(bill.category)} · ${money(monthlyCost(bill))}/mo · ${escapeHtml(bill.priority)}</small>
      </span>
    </label>`).join('');
  $$('.whatif-check').forEach((box) => box.addEventListener('change', () => {
    if (box.checked) selectedWhatIf.add(box.value);
    else selectedWhatIf.delete(box.value);
    renderWhatIfSummary();
  }));
  renderWhatIfSummary();
}

function renderWhatIfSummary() {
  const target = $('#whatIfSummary');
  if (!target) return;
  const selectedBills = activeBills().filter((bill) => selectedWhatIf.has(bill.id));
  const monthlySavings = selectedBills.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const monthly = activeBills().reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const goal = Number(state.settings.monthlySavingsGoal || 0);
  const after = income - monthly + monthlySavings;
  const goalProgress = goal ? Math.min(100, Math.round((monthlySavings / goal) * 100)) : 0;
  target.innerHTML = `
    <h3>Scenario result</h3>
    <div class="scenario-number">${money(monthlySavings)}/mo</div>
    <p>Extra room created by your selected changes.</p>
    <div class="mini-stat"><span>Left after bills</span><strong>${money(after)}</strong></div>
    <div class="mini-stat"><span>Annual impact</span><strong>${money(monthlySavings * 12)}</strong></div>
    <div class="mini-stat"><span>Savings goal progress</span><strong>${goal ? `${goalProgress}%` : 'Set goal'}</strong></div>
    <button class="secondary-btn" id="clearScenarioBtn">Clear scenario</button>`;
  const clear = $('#clearScenarioBtn');
  if (clear) clear.addEventListener('click', () => { selectedWhatIf = new Set(); renderWhatIfLab(); });
}

function buildAnomalies(options = {}) {
  const anomalies = [];
  const changes = detectPriceChanges();
  changes.slice(0, 6).forEach((change) => {
    anomalies.push({
      title: `${change.name} price changed`,
      body: `Last charge was ${money(change.lastAmount)}, previous typical charge was ${money(change.previousMedian)}. Difference: ${money(change.delta)}.`,
      tone: change.delta > 0 ? 'warn' : 'good'
    });
  });

  const detected = detectRecurringCharges();
  detected.slice(0, 4).forEach((item) => anomalies.push({
    title: `Untracked recurring charge: ${item.name}`,
    body: `${money(item.amount)} ${item.frequencyLabel.toLowerCase()} pattern from ${item.count} transactions. Add it to bills or cancel it.`,
    tone: 'warn'
  }));

  const categories = groupBy(activeBills().filter((bill) => bill.type === 'subscription'), (bill) => bill.category);
  Object.entries(categories).forEach(([category, bills]) => {
    if (bills.length >= 3 && ['Streaming', 'Software', 'Food', 'Health'].includes(category)) {
      anomalies.push({
        title: `${category} subscription pile-up`,
        body: `${bills.length} active ${category.toLowerCase()} subscriptions cost ${money(bills.reduce((sum, bill) => sum + monthlyCost(bill), 0))}/mo. Rotate, bundle, or cancel overlap.`,
        tone: 'warn'
      });
    }
  });

  const trials = activeBills().filter((bill) => bill.trialEndDate && daysBetween(todayLocal(), parseDate(bill.trialEndDate)) <= 14 && daysBetween(todayLocal(), parseDate(bill.trialEndDate)) >= 0);
  trials.forEach((bill) => anomalies.push({
    title: `${bill.name} trial/cancel date is close`,
    body: `${formatDate(parseDate(bill.trialEndDate))} is the cancel-by date. ${bill.cancelUrl ? 'Cancel/manage link is saved.' : 'Add the cancel link so it is ready.'}`,
    tone: 'danger'
  }));

  const manualSoon = upcomingOccurrences(state.settings.alertDays || 3).filter(({ bill }) => !bill.autopay);
  manualSoon.forEach(({ bill, days }) => anomalies.push({
    title: `${bill.name} needs manual payment`,
    body: `Due ${days === 0 ? 'today' : `in ${days} days`}. Export iPhone reminders or mark paid when complete.`,
    tone: 'danger'
  }));

  if (!options.skipHealth && !anomalies.length) anomalies.push({ title: 'No major anomalies found', body: 'Import more transaction history for sharper scanning.', tone: 'good' });
  return anomalies.slice(0, 12);
}

function renderAnomalies(anomalies) {
  const target = $('#anomalyList');
  if (!target) return;
  target.innerHTML = anomalies.map((item) => `
    <div class="insight anomaly ${escapeAttr(item.tone)}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.body)}</p>
    </div>`).join('');
}

function detectPriceChanges() {
  const groups = groupBy(
    state.transactions.filter((txn) => Number.isFinite(txn.amount) && Math.abs(txn.amount) > 1),
    (txn) => normalizeMerchant(txn.name)
  );
  const changes = [];
  Object.entries(groups).forEach(([merchant, txns]) => {
    const sorted = txns.slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
    if (sorted.length < 3) return;
    const last = sorted[sorted.length - 1];
    const previous = sorted.slice(0, -1).map((txn) => Math.abs(Number(txn.amount))).filter(Boolean);
    const previousMedian = median(previous);
    const lastAmount = Math.abs(Number(last.amount));
    if (!previousMedian || !lastAmount) return;
    const delta = lastAmount - previousMedian;
    const pct = Math.abs(delta) / previousMedian;
    if (Math.abs(delta) >= 2 && pct >= 0.08) {
      changes.push({ name: titleCase(merchant), lastAmount, previousMedian, delta, pct, lastDate: last.date });
    }
  });
  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function spendPulseStats() {
  const now = todayLocal();
  const last30 = new Date(now); last30.setDate(now.getDate() - 30);
  const prior60 = new Date(now); prior60.setDate(now.getDate() - 60);
  const expenses = state.transactions.filter((txn) => Math.abs(Number(txn.amount || 0)) > 0);
  const last = expenses.filter((txn) => parseDate(txn.date) >= last30).reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0);
  const prior = expenses.filter((txn) => parseDate(txn.date) >= prior60 && parseDate(txn.date) < last30).reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0);
  if (!expenses.length) return { label: 'No data', body: 'import CSV for pulse' };
  if (!prior) return { label: money(last), body: 'spent in last 30 days' };
  const delta = last - prior;
  const pct = Math.round((delta / prior) * 100);
  return { label: pct > 0 ? `+${pct}%` : `${pct}%`, body: `${money(Math.abs(delta))} ${delta >= 0 ? 'higher' : 'lower'} than prior 30 days` };
}

function saveSmartProfile() {
  state.settings.cashBuffer = Number($('#cashBufferInput')?.value || 0);
  state.settings.monthlySavingsGoal = Number($('#monthlySavingsGoalInput')?.value || 0);
  state.settings.cushionFloor = Number($('#cushionFloorInput')?.value || 0);
  state.settings.paydayFrequency = $('#paydayFrequencyInput')?.value || 'monthly';
  state.settings.paydayDate = $('#paydayDateInput')?.value || isoDate(todayLocal());
  state.settings.autopilotMode = $('#autopilotModeInput')?.value || 'balanced';
  saveState();
  render();
  toast('Smart profile saved.');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shortDateRange(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}-${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}


function renderCommandCenter() {
  const metricsBox = $('#commandMetrics');
  if (!metricsBox) return;
  const metrics = buildCommandMetrics();
  const score = metrics.readinessScore;
  const scoreBig = $('#commandScoreBig');
  if (scoreBig) scoreBig.textContent = String(score);
  metricsBox.innerHTML = [
    { label: 'Money OS readiness', value: `${score}/100`, body: metrics.readinessLabel, tone: score >= 76 ? 'good' : score >= 50 ? 'warn' : 'danger' },
    { label: 'Cash runway', value: metrics.runwayLabel, body: metrics.runwayBody, tone: metrics.runwayTone },
    { label: 'Savings leak', value: money(metrics.savingsLeak), body: 'estimated monthly opportunity', tone: metrics.savingsLeak > 75 ? 'warn' : 'good' },
    { label: 'Private vault', value: state.settings.appLockEnabled ? 'Locked' : 'Open', body: state.settings.localOnly ? 'local-only mode on' : 'backend tools visible', tone: state.settings.appLockEnabled && state.settings.localOnly ? 'good' : 'warn' }
  ].map((item) => `
    <article class="command-metric ${escapeAttr(item.tone)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.body)}</small>
    </article>
  `).join('');
  renderOperatingPlan(metrics);
  renderReviewQueue(metrics);
  renderNegotiator();
  renderDueDateOptimizer(metrics);
  renderProjection();
  renderRulesEngine(metrics);
}

function buildCommandMetrics() {
  const bills = activeBills();
  const monthly = bills.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const income = Number(state.settings.income || 0);
  const buffer = Number(state.settings.cashBuffer || 0);
  const cushion = Number(state.settings.cushionFloor || 0);
  const due30 = dueAmountWithin(30);
  const detected = detectRecurringCharges();
  const anomalies = buildAnomalies({ skipHealth: true });
  const spendStats = spendPulseStats();
  const manualSoon = upcomingOccurrences(14).filter(({ bill }) => !bill.autopay).length;
  const subscriptions = bills.filter((bill) => bill.type === 'subscription');
  const niceToHave = subscriptions.filter((bill) => bill.priority === 'nice-to-have');
  const niceMonthly = niceToHave.reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const duplicates = findDuplicateBills();
  const overBudgets = Object.entries(categoryMonthlySpend()).filter(([category, spend]) => Number(state.settings.budgets[category] || 0) > 0 && spend > Number(state.settings.budgets[category] || 0));
  const readinessPieces = [
    bills.length ? 14 : 0,
    income > 0 ? 14 : 0,
    state.settings.cashBuffer > 0 ? 12 : 0,
    state.settings.cushionFloor > 0 ? 8 : 0,
    state.transactions.length ? 12 : 0,
    state.settings.appLockEnabled ? 10 : 0,
    state.settings.localOnly ? 10 : 0,
    Object.values(state.settings.budgets || {}).some((value) => Number(value) > 0) ? 10 : 0,
    bills.some((bill) => bill.cancelUrl) ? 5 : 0,
    bills.some((bill) => bill.trialEndDate || bill.contractEndDate) ? 5 : 0
  ];
  const readinessScore = Math.min(100, readinessPieces.reduce((sum, value) => sum + value, 0));
  const netMonthly = income ? income - monthly - Number(state.settings.monthlySavingsGoal || 0) : 0;
  const sixtyDayBills = dueAmountWithin(60);
  const expectedIncome60 = income ? income * 2 : 0;
  const projected60 = buffer + expectedIncome60 - sixtyDayBills;
  let runwayTone = 'good';
  let runwayLabel = income ? money(projected60) : 'Set income';
  let runwayBody = income ? 'projected after 60 days' : 'add income for forecast';
  if (income && projected60 < cushion) { runwayTone = 'danger'; runwayBody = 'below comfort cushion'; }
  else if (income && projected60 < cushion + due30) { runwayTone = 'warn'; runwayBody = 'watch next bill cluster'; }
  const savingsLeak = niceMonthly + detected.reduce((sum, item) => sum + item.amount, 0) * 0.35 + overBudgets.reduce((sum, [, spend]) => sum + spend * 0.12, 0);
  const readinessLabel = readinessScore >= 80 ? 'strong personal setup' : readinessScore >= 55 ? 'good, needs tuning' : 'finish setup steps';
  return { bills, monthly, income, buffer, cushion, due30, detected, anomalies, spendStats, manualSoon, subscriptions, niceToHave, duplicates, overBudgets, readinessScore, readinessLabel, netMonthly, projected60, runwayTone, runwayLabel, runwayBody, savingsLeak };
}

function renderOperatingPlan(metrics) {
  const box = $('#operatingPlan');
  if (!box) return;
  const plan = buildOperatingPlan(metrics);
  state.settings.lastCommandPlan = plan.map((item, index) => `${index + 1}. ${item.title}: ${item.body}`).join('\n');
  box.innerHTML = plan.map((item, index) => `
    <article class="plan-step ${escapeAttr(item.tone)}">
      <span>${index + 1}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>
    </article>
  `).join('');
}

function buildOperatingPlan(metrics) {
  const plan = [];
  if (!metrics.bills.length) plan.push({ title: 'Build your base list', body: 'Add rent, phone, insurance, cards, subscriptions, and utilities so the app can forecast properly.', tone: 'danger' });
  if (!metrics.income) plan.push({ title: 'Set monthly take-home income', body: 'Budget math gets much smarter after income is saved in the Budget tab.', tone: 'warn' });
  if (!state.transactions.length) plan.push({ title: 'Import one bank/card CSV', body: 'CSV import unlocks recurring-charge detection, price-change scanning, and hidden subscription discovery while staying free.', tone: 'warn' });
  if (metrics.detected.length) plan.push({ title: 'Review hidden recurring charges', body: `${metrics.detected.length} recurring pattern(s) were found from transactions. Add real ones or investigate/cancel them.`, tone: 'danger' });
  const trial = activeBills().find((bill) => bill.trialEndDate && daysBetween(todayLocal(), parseDate(bill.trialEndDate)) >= 0 && daysBetween(todayLocal(), parseDate(bill.trialEndDate)) <= 14);
  if (trial) plan.push({ title: `Handle ${trial.name} before trial/promo ends`, body: `Cancel-by or promo date is ${formatDate(parseDate(trial.trialEndDate || trial.contractEndDate))}. Save the cancel link and decide now.`, tone: 'danger' });
  if (metrics.overBudgets.length) plan.push({ title: 'Fix over-budget categories', body: `${metrics.overBudgets.length} category budget(s) are over target. Start with the biggest recurring category.`, tone: 'warn' });
  if (metrics.manualSoon) plan.push({ title: 'Protect manual payments', body: `${metrics.manualSoon} manual payment(s) are due within 14 days. Export iPhone reminders or switch to autopay if safe.`, tone: 'warn' });
  if (!state.settings.appLockEnabled) plan.push({ title: 'Turn on app PIN', body: 'Enable the local app lock so your bills and transactions are hidden if someone opens this device.', tone: 'warn' });
  if (!activeBills().some((bill) => bill.cancelUrl)) plan.push({ title: 'Add cancel/manage links', body: 'Save cancel links for subscriptions so cleanup is fast when you decide to cut costs.', tone: 'info' });
  if (plan.length < 5) plan.push({ title: 'Run a monthly 10-minute money review', body: 'Open Command Center, handle the review queue, export a private backup, and check the 12-month projection.', tone: 'good' });
  return plan.slice(0, 7);
}

function renderReviewQueue(metrics) {
  const box = $('#reviewQueue');
  if (!box) return;
  const rows = [];
  metrics.detected.slice(0, 5).forEach((item) => rows.push({ title: `Add or inspect ${item.name}`, body: `${money(item.amount)} ${item.frequencyLabel.toLowerCase()} pattern from ${item.count} transactions.`, tone: 'danger', action: 'Detected recurring' }));
  detectPriceChanges().slice(0, 4).forEach((item) => rows.push({ title: `${item.name} changed price`, body: `New charge ${money(item.lastAmount)} vs prior typical ${money(item.previousMedian)}.`, tone: item.delta > 0 ? 'warn' : 'good', action: item.delta > 0 ? 'Negotiate/cancel' : 'Price dropped' }));
  upcomingOccurrences(10).filter(({ bill }) => !bill.autopay).slice(0, 5).forEach(({ bill, days }) => rows.push({ title: `${bill.name} manual payment`, body: `Due ${days === 0 ? 'today' : `in ${days} days`} for ${money(bill.amount)}.`, tone: 'danger', action: 'Pay/remind' }));
  metrics.duplicates.forEach((group) => rows.push({ title: `Possible duplicate: ${group.label}`, body: `${group.items.length} similar active items cost ${money(group.monthly)}/mo.`, tone: 'warn', action: 'Compare' }));
  activeBills().filter((bill) => !bill.cancelUrl && bill.type === 'subscription').slice(0, 5).forEach((bill) => rows.push({ title: `Missing cancel link: ${bill.name}`, body: 'Add the manage/cancel URL so cleanup is faster later.', tone: 'info', action: 'Add link' }));
  if (!rows.length) rows.push({ title: 'Review queue is clean', body: 'Import more transaction history or add cancel/trial dates for deeper monitoring.', tone: 'good', action: 'Nice' });
  box.innerHTML = rows.slice(0, 12).map((item) => `
    <article class="review-item ${escapeAttr(item.tone)}">
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>
      <span>${escapeHtml(item.action)}</span>
    </article>
  `).join('');
}

function addAllDetectedBills() {
  const detected = detectRecurringCharges();
  if (!detected.length) return toast('No detected recurring charges to add yet. Import CSV first.');
  let added = 0;
  detected.forEach((item) => {
    const exists = state.bills.some((bill) => normalizeMerchant(bill.name) === normalizeMerchant(item.name));
    if (exists) return;
    state.bills.push(normalizeBill({
      name: item.name,
      amount: item.amount,
      frequency: item.frequency || 'monthly',
      dueDate: item.lastDate || isoDate(todayLocal()),
      category: guessCategoryFromName(item.name),
      paymentMethod: 'Detected from CSV',
      autopay: true,
      type: 'subscription',
      priority: 'useful',
      notes: 'Auto-added from Command Center review queue. Confirm due date and category.'
    }));
    added += 1;
  });
  saveState();
  render();
  toast(added ? `Added ${added} detected item(s).` : 'Everything detected is already in bills.');
}

function renderNegotiator() {
  const select = $('#negotiatorBillSelect');
  const scriptBox = $('#negotiatorScript');
  if (!select || !scriptBox) return;
  const bills = activeBills().slice().sort((a, b) => monthlyCost(b) - monthlyCost(a));
  const previous = select.value;
  select.innerHTML = bills.length ? bills.map((bill) => `<option value="${escapeAttr(bill.id)}">${escapeHtml(bill.name)} - ${money(bill.amount)} / ${FREQ[bill.frequency]?.label || 'Monthly'}</option>`).join('') : '<option value="">Add a bill first</option>';
  if (bills.some((bill) => bill.id === previous)) select.value = previous;
  const selected = bills.find((bill) => bill.id === select.value) || bills[0];
  scriptBox.textContent = selected ? buildNegotiationScript(selected, $('#negotiatorGoalSelect')?.value || 'discount') : 'Add a bill or subscription first, then this will generate a script.';
}

function buildNegotiationScript(bill, goal) {
  const monthly = money(monthlyCost(bill));
  const annual = money(annualCost(bill));
  const category = bill.category || 'Other';
  if (goal === 'cancel') {
    return `Hi, I need help canceling or pausing my ${bill.name} plan.\n\nI am reviewing my monthly budget and this ${category.toLowerCase()} charge is currently about ${monthly}/month (${annual}/year). Please confirm the exact cancellation steps, the final billing date, and whether any refund or prorated credit applies.\n\nIf there is a lower-cost pause, downgrade, or retention offer, please show me that before canceling. Otherwise, please cancel and send written confirmation.`;
  }
  if (goal === 'fee') {
    return `Hi, I am reviewing my ${bill.name} account and noticed a charge or fee around ${money(bill.amount)}.\n\nCan you review my account and credit or remove any avoidable fees? I have been trying to keep this bill predictable and would appreciate a one-time courtesy credit or a lower-fee plan. Please confirm the new monthly cost in writing.`;
  }
  if (goal === 'annual') {
    return `Hi, I am reviewing my ${bill.name} plan. I currently pay about ${monthly}/month, or ${annual}/year.\n\nDo you offer a yearly, loyalty, student, bundle, or autopay discount? I am comparing this with alternatives and would stay if the price can be meaningfully reduced. Please send the best available offer and any contract terms before making changes.`;
  }
  return `Hi, I am reviewing my budget and ${bill.name} is one of my recurring charges at about ${monthly}/month (${annual}/year).\n\nBefore I cancel or switch providers, can you check for a loyalty discount, lower plan, promotional rate, autopay discount, or bundle that would reduce my monthly cost?\n\nMy goal is to keep the service only if the price is competitive. Please confirm the new price, how long it lasts, and whether there are any contract terms.`;
}

async function copyNegotiatorScript() {
  const text = $('#negotiatorScript')?.textContent || '';
  if (!text.trim()) return toast('No script to copy yet.');
  try {
    await navigator.clipboard.writeText(text);
    toast('Negotiation script copied.');
  } catch (error) {
    toast('Could not copy script on this browser.');
  }
}

async function copyOperatingPlan() {
  const text = state.settings.lastCommandPlan || '';
  if (!text.trim()) return toast('No plan to copy yet.');
  try {
    await navigator.clipboard.writeText(text);
    toast('Operating plan copied.');
  } catch (error) {
    toast('Could not copy plan on this browser.');
  }
}

function renderDueDateOptimizer(metrics) {
  const box = $('#dueDateOptimizer');
  if (!box) return;
  const paydays = nextPaydays(90);
  const score = (tone) => tone === 'danger' ? 0 : tone === 'warn' ? 1 : 2;
  const rows = activeBills().map((bill) => {
    const due = nextDueDate(bill);
    const nearestBefore = paydays.filter((payday) => payday <= due).at(-1) || paydays[0];
    const gap = nearestBefore ? daysBetween(nearestBefore, due) : 0;
    let tone = 'good';
    let suggestion = 'Timing looks okay.';
    if (gap >= 10) { tone = 'warn'; suggestion = 'Ask provider to move due date closer to payday.'; }
    if (gap < 0 || gap > 21) { tone = 'danger'; suggestion = 'This may hit before income lands. Consider moving it.'; }
    if (!bill.autopay && daysBetween(todayLocal(), due) <= 7) { tone = 'danger'; suggestion = 'Manual bill is due soon. Add reminder or pay now.'; }
    return { bill, due, nearestBefore, gap, tone, suggestion };
  }).sort((a, b) => score(a.tone) - score(b.tone)).slice(0, 8);
  if (!rows.length) {
    box.innerHTML = '<div class="empty-state">Add bills and payday settings to optimize timing.</div>';
    return;
  }
  box.innerHTML = rows.map((row) => `
    <article class="optimizer-card ${escapeAttr(row.tone)}">
      <strong>${escapeHtml(row.bill.name)}</strong>
      <p>${formatDate(row.due)} · ${row.nearestBefore ? `${Math.abs(row.gap)} day(s) after payday` : 'payday not set'}</p>
      <small>${escapeHtml(row.suggestion)}</small>
    </article>
  `).join('');
}

function nextPaydays(days = 90) {
  const result = [];
  const start = todayLocal();
  let d = parseDate(state.settings.paydayDate || isoDate(start));
  const freq = state.settings.paydayFrequency || 'monthly';
  let guard = 0;
  while (d < start && guard < 80) {
    if (freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
    else d.setMonth(d.getMonth() + 1);
    guard += 1;
  }
  const end = new Date(start); end.setDate(end.getDate() + days);
  while (d <= end && result.length < 40) {
    result.push(new Date(d));
    const next = new Date(d);
    if (freq === 'weekly') next.setDate(next.getDate() + 7);
    else if (freq === 'biweekly') next.setDate(next.getDate() + 14);
    else next.setMonth(next.getMonth() + 1);
    d = next;
  }
  return result;
}

function renderProjection() {
  const chart = $('#projectionChart');
  const list = $('#projectionList');
  if (!chart || !list) return;
  const months = buildTwelveMonthProjection();
  const max = Math.max(1, ...months.map((m) => m.total));
  chart.innerHTML = months.map((m) => `<div class="projection-month"><div class="projection-bar" style="height:${Math.max(8, Math.round((m.total / max) * 100))}%"></div><span>${escapeHtml(m.label)}</span></div>`).join('');
  const heavy = months.slice().sort((a, b) => b.total - a.total).slice(0, 4);
  list.innerHTML = heavy.map((m) => `
    <div class="compact-item">
      <div><strong>${escapeHtml(m.fullLabel)}</strong><p class="bill-meta">${m.items.length} scheduled charge(s)</p></div>
      <strong>${money(m.total)}</strong>
    </div>
  `).join('');
}

function buildTwelveMonthProjection() {
  const start = todayLocal();
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), fullLabel: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), total: 0, items: [] });
  }
  upcomingOccurrences(370).forEach((occurrence) => {
    const key = `${occurrence.due.getFullYear()}-${occurrence.due.getMonth()}`;
    const month = months.find((m) => m.key === key);
    if (!month) return;
    month.total += Number(occurrence.bill.amount || 0);
    month.items.push(occurrence);
  });
  return months;
}

function renderRulesEngine(metrics) {
  const box = $('#rulesEngine');
  if (!box) return;
  const subCount = activeBills().filter((bill) => bill.type === 'subscription').length;
  const cancelCount = activeBills().filter((bill) => bill.cancelUrl).length;
  const rules = [];
  rules.push({ title: 'Local-only privacy', status: state.settings.localOnly ? 'Pass' : 'Review', body: state.settings.localOnly ? 'Bank buttons are hidden/disabled.' : 'Backend mode is visible. Use only with a private server.', tone: state.settings.localOnly ? 'good' : 'warn' });
  rules.push({ title: 'Encrypted backup', status: 'Ready', body: 'Use Settings to export an encrypted private backup file with a password.', tone: 'good' });
  rules.push({ title: 'Duplicate scan', status: metrics.duplicates.length ? 'Review' : 'Pass', body: metrics.duplicates.length ? `${metrics.duplicates.length} similar group(s) found.` : 'No obvious duplicate recurring items.', tone: metrics.duplicates.length ? 'warn' : 'good' });
  rules.push({ title: 'Cancel-link coverage', status: `${cancelCount}/${subCount}`, body: 'Subscriptions with saved manage/cancel URLs.', tone: activeBills().some((bill) => bill.type === 'subscription' && !bill.cancelUrl) ? 'warn' : 'good' });
  rules.push({ title: 'Manual payment risk', status: metrics.manualSoon ? 'Review' : 'Pass', body: metrics.manualSoon ? `${metrics.manualSoon} manual bill(s) due within 14 days.` : 'No urgent manual payments.', tone: metrics.manualSoon ? 'danger' : 'good' });
  rules.push({ title: 'Budget pressure', status: metrics.overBudgets.length ? 'Review' : 'Pass', body: metrics.overBudgets.length ? `${metrics.overBudgets.length} categories over target.` : 'Recurring spend is inside category targets.', tone: metrics.overBudgets.length ? 'warn' : 'good' });
  box.innerHTML = rules.map((rule) => `
    <article class="rule-card ${escapeAttr(rule.tone)}">
      <span>${escapeHtml(rule.status)}</span>
      <strong>${escapeHtml(rule.title)}</strong>
      <p>${escapeHtml(rule.body)}</p>
    </article>
  `).join('');
}

function findDuplicateBills() {
  const groups = groupBy(activeBills(), (bill) => `${bill.category}:${bill.type}`);
  const duplicates = [];
  Object.entries(groups).forEach(([key, items]) => {
    if (items.length < 2) return;
    const similar = items.filter((bill, index) => items.some((other, j) => j !== index && (normalizeMerchant(other.name).includes(normalizeMerchant(bill.name)) || normalizeMerchant(bill.name).includes(normalizeMerchant(other.name)) || other.category === bill.category)));
    if (similar.length >= 2) {
      const label = key.split(':')[0];
      duplicates.push({ label, items: similar, monthly: similar.reduce((sum, bill) => sum + monthlyCost(bill), 0) });
    }
  });
  return duplicates.slice(0, 5);
}

function guessCategoryFromName(name) {
  const value = String(name || '').toLowerCase();
  if (/netflix|hulu|spotify|disney|max|peacock|paramount|youtube|stream|apple music/.test(value)) return 'Streaming';
  if (/verizon|att|t-mobile|xfinity|internet|phone|mobile|comcast/.test(value)) return 'Phone/Internet';
  if (/geico|progressive|insurance|allstate|state farm/.test(value)) return 'Insurance';
  if (/rent|mortgage|apartment|landlord/.test(value)) return 'Housing';
  if (/electric|water|gas|utility|power/.test(value)) return 'Utilities';
  if (/adobe|microsoft|google|icloud|dropbox|software|app store/.test(value)) return 'Software';
  if (/gym|fitness|health|medical/.test(value)) return 'Health';
  if (/loan|credit|card|affirm|klarna/.test(value)) return 'Debt';
  if (/uber|lyft|gas|parking|toll|auto/.test(value)) return 'Transportation';
  return 'Other';
}

async function exportEncryptedBackup() {
  const password = $('#vaultPasswordInput')?.value || '';
  if (password.length < 8) return toast('Use an 8+ character backup password.');
  try {
    const payload = await encryptText(JSON.stringify(state), password);
    downloadFile(`billpilot-private-vault-${isoDate(todayLocal())}.bpvault`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    $('#vaultPasswordInput').value = '';
    toast('Encrypted backup exported. Do not lose the password.');
  } catch (error) {
    console.error(error);
    toast('Encrypted export failed on this browser.');
  }
}

async function importEncryptedBackup(file) {
  if (!file) return;
  const password = $('#vaultPasswordInput')?.value || '';
  if (!password) return toast('Enter the backup password first.');
  try {
    const payload = JSON.parse(await file.text());
    const decrypted = await decryptText(payload, password);
    state = normalizeState(JSON.parse(decrypted));
    saveState();
    $('#vaultPasswordInput').value = '';
    render();
    toast('Encrypted backup imported.');
  } catch (error) {
    console.error(error);
    toast('Could not unlock backup. Check the password/file.');
  }
}

async function deriveVaultKey(password, salt) {
  if (!crypto?.subtle) throw new Error('Web Crypto unavailable');
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { format: 'billpilot-vault-v1', kdf: 'PBKDF2-SHA256-200000', cipher: 'AES-GCM-256', salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ciphertext)), createdAt: new Date().toISOString() };
}

async function decryptText(payload, password) {
  if (payload?.format !== 'billpilot-vault-v1') throw new Error('Unknown vault format');
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const data = fromB64(payload.data);
  const key = await deriveVaultKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

function b64(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromB64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
  $('#trialEndDate').value = bill?.trialEndDate || '';
  $('#contractEndDate').value = bill?.contractEndDate || '';
  $('#cancelUrl').value = bill?.cancelUrl || '';
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
    trialEndDate: $('#trialEndDate').value,
    contractEndDate: $('#contractEndDate').value,
    cancelUrl: $('#cancelUrl').value.trim(),
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
  if (state.settings.localOnly) {
    updateBankStatus('Local-only mode is on. Use Import CSV for the free private version.');
    toast('Local-only mode is on. Use Import CSV for the free private version.');
    return;
  }
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
  if (state.settings.localOnly) {
    updateBankStatus('Local-only mode is on. Use Import CSV for the free private version.');
    toast('Local-only mode is on. Use Import CSV for the free private version.');
    return;
  }
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
  if (state.settings.localOnly) {
    box.textContent = 'Local-only mode is on. For the free private version, use Import CSV instead of Plaid/bank sync.';
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


function renderPersonalization() {
  const owner = state.settings.ownerName || 'Apollo';
  const label = state.settings.buildLabel || `${owner}'s personal build`;
  const appTitle = $('#appTitle');
  if (appTitle) appTitle.textContent = `${owner}'s BillPilot IQ Ultra`;
  document.title = `${owner}'s BillPilot IQ Ultra`;
  const pill = $('#privateBuildPill');
  if (pill) pill.textContent = state.settings.localOnly ? 'Private local-only build' : 'Bank backend mode';
  const welcome = $('#ownerWelcome');
  if (welcome) welcome.textContent = `${owner}'s private money cockpit`;
  const privacyLine = $('#ownerPrivacyLine');
  if (privacyLine) privacyLine.textContent = state.settings.localOnly
    ? 'Local-only. Bills, transactions, lock PIN, and settings stay in this browser unless you export them.'
    : 'Backend tools are visible. Keep API secrets only on your server, never in GitHub.';
  const ownerInput = $('#ownerNameInput');
  if (ownerInput) ownerInput.value = owner;
  const labelInput = $('#buildLabelInput');
  if (labelInput) labelInput.value = label;
  const localOnly = $('#localOnlyInput');
  if (localOnly) localOnly.value = state.settings.localOnly ? 'on' : 'off';
  const privacyReminder = $('#privacyReminderInput');
  if (privacyReminder) privacyReminder.value = state.settings.privacyReminder ? 'on' : 'off';
  const lockWhenHidden = $('#lockWhenHiddenInput');
  if (lockWhenHidden) lockWhenHidden.value = state.settings.lockWhenHidden ? 'on' : 'off';
  const lockStatus = $('#lockStatus');
  if (lockStatus) lockStatus.textContent = state.settings.appLockEnabled ? 'On' : 'Off';
  renderVaultStats();
  renderPrivacyAudit();
  renderDataPurityReport();
  toggleBankTools();
}

function renderVaultStats() {
  const box = $('#vaultStats');
  if (!box) return;
  const monthly = activeBills().reduce((sum, bill) => sum + monthlyCost(bill), 0);
  const annual = activeBills().reduce((sum, bill) => sum + annualCost(bill), 0);
  const recurring = detectRecurringCharges();
  const lastTxn = state.transactions.length ? state.transactions.map((txn) => txn.date).sort().at(-1) : 'None yet';
  const stats = [
    ['Owner', state.settings.ownerName || 'Apollo'],
    ['Bills', String(state.bills.length)],
    ['Transactions', String(state.transactions.length)],
    ['Monthly burn', money(monthly)],
    ['Annual commitments', money(annual)],
    ['Recurring found from CSV', String(recurring.length)],
    ['Last transaction', lastTxn]
  ];
  box.innerHTML = stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}

function renderPrivacyAudit() {
  const box = $('#privacyAudit');
  if (!box) return;
  const items = [];
  items.push({ tone: 'good', title: 'Device-only data', text: 'Manual bills and imported transactions stay in localStorage on this device/browser.' });
  items.push({ tone: state.settings.localOnly ? 'good' : 'warn', title: 'Bank backend tools', text: state.settings.localOnly ? 'Hidden/disabled for your free personal-only setup.' : 'Visible. Use only if you deploy a private backend.' });
  items.push({ tone: state.settings.appLockEnabled ? 'good' : 'warn', title: 'App PIN', text: state.settings.appLockEnabled ? 'Enabled on this device.' : 'Off. Turn it on if anyone else can access this browser.' });
  if (state.settings.privacyReminder) {
    items.push({ tone: 'warn', title: 'Public GitHub Pages reminder', text: 'The app shell and embedded screenshots are public if the repository is public. Your entered bill data is not uploaded.' });
  }
  box.innerHTML = items.map((item) => `<div class="audit-item ${item.tone}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join('');
}

function renderDataPurityReport() {
  const box = $('#dataPurityReport');
  if (!box) return;
  const demoCount = countDemoStarterBills();
  const empty = !state.bills.length && !state.transactions.length;
  const rows = [];
  if (empty) {
    rows.push({ type: 'info', title: 'Ready for your real data', text: 'No bills or transactions are saved yet. Add bills or import a CSV on your iPhone.' });
  } else {
    rows.push({ type: 'good', title: 'Personal local records', text: `${state.bills.length} bills and ${state.transactions.length} transactions saved only on this device.` });
  }
  if (demoCount) {
    rows.push({ type: 'warn', title: 'Starter/demo bills detected', text: `${demoCount} starter item(s) look like demo data. Use Remove starter/demo bills to clean them out.` });
  } else {
    rows.push({ type: 'good', title: 'No starter demo bills detected', text: 'This build is ready to hold only your real information.' });
  }
  if (localStorage.getItem(API_BASE_KEY)) {
    rows.push({ type: 'warn', title: 'Custom backend URL saved', text: 'A backend URL is stored. Clear it if you want fully local-only mode.' });
  }
  box.innerHTML = rows.map((row) => `
    <article class="insight ${row.type}">
      <strong>${escapeHtml(row.title)}</strong>
      <p>${escapeHtml(row.text)}</p>
    </article>
  `).join('');
}

function toggleBankTools() {
  const disabled = Boolean(state.settings.localOnly);
  ['connectBankBtn','connectBankBtn2','syncBankBtn','syncBankBtn2'].forEach((idName) => {
    const button = $('#' + idName);
    if (!button) return;
    button.disabled = disabled;
    button.title = disabled ? 'Local-only mode is on. Use Import CSV for the free private version.' : '';
    button.classList.toggle('is-disabled', disabled);
  });
}

function countDemoStarterBills() {
  return state.bills.filter((bill) => DEMO_SIGNATURE.includes(`${bill.name}:${Number(bill.amount || 0)}`)).length;
}

function removeDemoStarterBills() {
  const before = state.bills.length;
  state.bills = state.bills.filter((bill) => !DEMO_SIGNATURE.includes(`${bill.name}:${Number(bill.amount || 0)}`));
  const removed = before - state.bills.length;
  saveState();
  render();
  toast(removed ? `Removed ${removed} starter/demo item(s).` : 'No starter/demo items found.');
}

function saveOwnerSetup() {
  const owner = ($('#ownerNameInput')?.value || '').trim() || 'Apollo';
  state.settings.ownerName = owner;
  state.settings.buildLabel = ($('#buildLabelInput')?.value || '').trim() || `${owner}'s personal build`;
  state.settings.localOnly = ($('#localOnlyInput')?.value || 'on') === 'on';
  state.settings.privacyReminder = ($('#privacyReminderInput')?.value || 'on') === 'on';
  saveState();
  render();
  toast('Owner-only setup saved.');
}

function createPrivateReport() {
  const monthlyByCategory = categoryMonthlySpend();
  const recurringFromTransactions = detectRecurringCharges().map((item) => ({
    merchant: item.name,
    count: item.count,
    averageAmount: item.amount,
    frequency: item.frequency,
    frequencyLabel: item.frequencyLabel
  }));
  const upcoming = upcomingOccurrences(60).slice(0, 25).map(({ bill, due, days }) => ({
    name: bill.name,
    amount: bill.amount,
    category: bill.category,
    dueDate: isoDate(due),
    days
  }));
  return {
    reportType: 'BillPilot IQ private report',
    owner: state.settings.ownerName || 'Apollo',
    generatedAt: new Date().toISOString(),
    privacy: {
      localOnly: state.settings.localOnly,
      dataMode: state.settings.dataMode,
      reminder: 'This file is created only when you export it. Keep it private.'
    },
    summary: {
      bills: state.bills.length,
      transactions: state.transactions.length,
      monthlyRecurring: activeBills().reduce((sum, bill) => sum + monthlyCost(bill), 0),
      annualCommitments: activeBills().reduce((sum, bill) => sum + annualCost(bill), 0),
      dueIn30Days: dueAmountWithin(30),
      income: state.settings.income || 0
    },
    monthlyByCategory,
    recurringFromTransactions,
    upcoming,
    bills: state.bills,
    transactions: state.transactions
  };
}

function exportPrivateReport() {
  const payload = createPrivateReport();
  downloadFile(PERSONAL_REPORT_NAME, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  toast('Private report exported. Keep it somewhere safe.');
}

async function copyDataSummary() {
  const report = createPrivateReport();
  const summary = `${report.owner}'s BillPilot IQ summary\nBills: ${report.summary.bills}\nTransactions: ${report.summary.transactions}\nMonthly recurring: ${money(report.summary.monthlyRecurring)}\nDue in 30 days: ${money(report.summary.dueIn30Days)}\nLocal-only: ${report.privacy.localOnly ? 'yes' : 'no'}`;
  try {
    await navigator.clipboard.writeText(summary);
    toast('Data summary copied.');
  } catch (error) {
    toast('Could not copy. Export private report instead.');
  }
}

async function hashPin(pin) {
  const value = String(pin || '');
  if (!window.crypto?.subtle) return `fallback:${btoa(value).split('').reverse().join('')}`;
  const buffer = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function setPinLock() {
  const pin = $('#newPinInput')?.value || '';
  const confirm = $('#confirmPinInput')?.value || '';
  if (pin.length < 4) return toast('Use a PIN with at least 4 digits.');
  if (pin !== confirm) return toast('PINs do not match.');
  state.settings.appLockHash = await hashPin(pin);
  state.settings.appLockEnabled = true;
  state.settings.lockWhenHidden = ($('#lockWhenHiddenInput')?.value || 'on') === 'on';
  saveState();
  $('#newPinInput').value = '';
  $('#confirmPinInput').value = '';
  appUnlocked = true;
  render();
  toast('App PIN enabled.');
}

function clearPinLock() {
  const ok = confirm('Turn off the app PIN on this device?');
  if (!ok) return;
  state.settings.appLockEnabled = false;
  state.settings.appLockHash = '';
  saveState();
  appUnlocked = true;
  render();
  hideLockScreen();
  toast('App PIN turned off.');
}

function showLockScreen() {
  if (!state.settings.appLockEnabled || appUnlocked) return;
  const screen = $('#lockScreen');
  if (!screen) return;
  screen.classList.remove('hidden');
  setTimeout(() => $('#unlockPinInput')?.focus(), 50);
}

function hideLockScreen() {
  $('#lockScreen')?.classList.add('hidden');
}

async function unlockApp() {
  const pin = $('#unlockPinInput')?.value || '';
  const expected = state.settings.appLockHash;
  const actual = await hashPin(pin);
  if (actual !== expected) {
    $('#unlockHint').textContent = 'Wrong PIN. Try again.';
    return;
  }
  appUnlocked = true;
  $('#unlockPinInput').value = '';
  $('#unlockHint').textContent = 'Your PIN stays on this device.';
  hideLockScreen();
  toast('Unlocked.');
}

function lockAppNow() {
  if (!state.settings.appLockEnabled) {
    switchTab('settings');
    toast('Set a PIN in Settings first.');
    return;
  }
  appUnlocked = false;
  showLockScreen();
}

function setupLocking() {
  appUnlocked = !state.settings.appLockEnabled;
  $('#unlockBtn')?.addEventListener('click', unlockApp);
  $('#unlockPinInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlockApp();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.settings.appLockEnabled && state.settings.lockWhenHidden) {
      appUnlocked = false;
    }
    if (!document.hidden) showLockScreen();
  });
  showLockScreen();
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
  $('#openAutopilotBtn').addEventListener('click', () => switchTab('autopilot'));
  $('#openCommandBtn')?.addEventListener('click', () => switchTab('command'));
  $('#saveSmartProfileBtn').addEventListener('click', saveSmartProfile);
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
  $('#saveOwnerBtn')?.addEventListener('click', saveOwnerSetup);
  $('#setPinBtn')?.addEventListener('click', setPinLock);
  $('#clearPinBtn')?.addEventListener('click', clearPinLock);
  $('#lockNowBtn')?.addEventListener('click', lockAppNow);
  $('#removeDemoBtn')?.addEventListener('click', removeDemoStarterBills);
  $('#exportPrivateReportBtn')?.addEventListener('click', exportPrivateReport);
  $('#copyDataSummaryBtn')?.addEventListener('click', copyDataSummary);
  $('#addAllDetectedBtn')?.addEventListener('click', addAllDetectedBills);
  $('#copyNegotiatorBtn')?.addEventListener('click', copyNegotiatorScript);
  $('#copyOperatingPlanBtn')?.addEventListener('click', copyOperatingPlan);
  $('#negotiatorBillSelect')?.addEventListener('change', renderNegotiator);
  $('#negotiatorGoalSelect')?.addEventListener('change', renderNegotiator);
  $('#exportEncryptedBtn')?.addEventListener('click', exportEncryptedBackup);
  $('#encryptedJsonInput')?.addEventListener('change', (event) => importEncryptedBackup(event.target.files[0]));

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
setupLocking();
render();
registerServiceWorker();
checkDueNotifications();
setInterval(checkDueNotifications, 60 * 60 * 1000);
