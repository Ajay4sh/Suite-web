// Avyntro demo — state, actions and sample data. Pure JS, no DOM, so it can be tested in Node.

import {
  addDays, amountPaid, autoMatch, demoIrn, financialYear, invoiceJournalLines, invoiceTotals, journalProblems,
  makeGstin, reversalLines, toPaise,
} from "./ledger.js";

export const ROLES = {
  Owner: "Everything, including billing and deleting the workspace",
  Admin: "Everything except billing; manages team and settings",
  Accountant: "Invoices, GST, bank reconciliation, journals and reports",
  Sales: "Clients and invoices; no journals, bank or settings",
  Viewer: "Read-only access to every module",
};

export const MODULES = [
  { key: "invoicing", label: "Invoicing" },
  { key: "items", label: "Item master" },
  { key: "gst", label: "GST compliance" },
  { key: "clients", label: "Clients" },
  { key: "bank", label: "Bank reconciliation" },
  { key: "accounting", label: "Journals & reports" },
];

const nextNo = (state, key) => (state.counters[key] = (state.counters[key] ?? 0) + 1);
export const newId = (state, prefix) => `${prefix}${nextNo(state, prefix)}`;

export function audit(state, action, detail = "", { user = state.currentUser, tenantId = state.activeTenantId, at } = {}) {
  state.audit.unshift({ id: newId(state, "A"), at: at ?? state.clock(), user, action, detail, tenantId });
  if (state.audit.length > 500) state.audit.length = 500;
}

export function postJournal(state, { date, narration, lines, source = "manual", ref = "" }) {
  const clean = lines.filter((l) => l.account && (l.debit || l.credit)).map((l) => ({ account: l.account, debit: l.debit || 0, credit: l.credit || 0 }));
  const problem = journalProblems(clean);
  if (problem) throw new Error(problem);
  const no = nextNo(state, "JV");
  const journal = { id: `J${no}`, no: `JV-${String(no).padStart(4, "0")}`, date, narration, lines: clean, source, ref, reconciled: false };
  state.journals.push(journal);
  return journal;
}

export function reverseJournal(state, journalId, date) {
  const j = state.journals.find((x) => x.id === journalId);
  if (!j) throw new Error("Entry not found.");
  if (j.reversedBy || j.reversalOf) throw new Error("This entry has already been reversed or is itself a reversal.");
  const rev = postJournal(state, { date, narration: `Reversal of ${j.no}: ${j.narration}`, lines: reversalLines(j.lines), source: "reversal", ref: j.no });
  rev.reversalOf = j.id;
  j.reversedBy = rev.id;
  audit(state, "journal.reversed", `${j.no} reversed by ${rev.no}`);
  return rev;
}

export function invoicePrefix(state, date) {
  return `${state.tenant.invoicePrefix}/${financialYear(date).label.slice(5)}/`;
}

export function createInvoice(state, { clientId, date, dueDays = 30, lines, notes = "", draft = false }) {
  const client = state.clients.find((c) => c.id === clientId);
  if (!client) throw new Error("Choose a client.");
  const clean = lines.filter((l) => l.name && Number(l.qty) > 0 && l.rate > 0);
  if (!clean.length) throw new Error("Add at least one line with quantity and rate.");
  const placeOfSupply = client.state;
  const interState = placeOfSupply !== state.tenant.state;
  const totals = invoiceTotals(clean, interState);
  const id = newId(state, "INV");
  const inv = {
    id, no: draft ? "Draft" : "", clientId, date, due: addDays(date, Number(dueDays) || 0), lines: clean, notes,
    placeOfSupply, totals, status: draft ? "draft" : "issued", irn: null, emailedAt: null, journalId: null,
  };
  state.invoices.push(inv);
  if (!draft) issueInvoice(state, id, { skipStatusCheck: true });
  else audit(state, "invoice.draft_saved", `Draft for ${client.name}`);
  return inv;
}

export function issueInvoice(state, id, { skipStatusCheck = false } = {}) {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) throw new Error("Invoice not found.");
  if (!skipStatusCheck && inv.status !== "draft") throw new Error("Only drafts can be issued.");
  const client = state.clients.find((c) => c.id === inv.clientId);
  inv.no = `${invoicePrefix(state, inv.date)}${String(nextNo(state, `INVNO-${financialYear(inv.date).label}`)).padStart(4, "0")}`;
  inv.status = "issued";
  const j = postJournal(state, { date: inv.date, narration: `Sales invoice ${inv.no} — ${client.name}`, lines: invoiceJournalLines(inv.totals), source: "invoice", ref: inv.no });
  inv.journalId = j.id;
  audit(state, "invoice.issued", `${inv.no} for ${client.name}`);
  return inv;
}

export function recordPayment(state, { invoiceId, date, amount, mode = "Bank transfer", ref = "" }) {
  const inv = state.invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.status === "draft") throw new Error("Payments can only be recorded on issued invoices.");
  const outstanding = inv.totals.total - amountPaid(state, invoiceId);
  if (!(amount > 0)) throw new Error("Enter an amount.");
  if (amount > outstanding) throw new Error("Amount is more than what is outstanding on this invoice.");
  const account = mode === "Cash" ? "1000" : "1010";
  const client = state.clients.find((c) => c.id === inv.clientId);
  const j = postJournal(state, {
    date, narration: `Receipt from ${client.name} against ${inv.no}`, source: "payment", ref: inv.no,
    lines: [{ account, debit: amount, credit: 0 }, { account: "1100", debit: 0, credit: amount }],
  });
  const payment = { id: newId(state, "PAY"), invoiceId, date, amount, mode, ref, journalId: j.id };
  state.payments.push(payment);
  audit(state, "payment.recorded", `${inv.no}: ₹${(amount / 100).toLocaleString("en-IN")} by ${mode}`);
  return payment;
}

// A bank payment for an expense, with optional input GST.
export function recordExpense(state, { date, account, amount, gstRate = 0, interState = false, narration, ref = "" }) {
  const tax = Math.round((amount * gstRate) / 100);
  const lines = [{ account, debit: amount, credit: 0 }];
  if (tax) {
    if (interState) lines.push({ account: "1202", debit: tax, credit: 0 });
    else lines.push({ account: "1200", debit: Math.floor(tax / 2), credit: 0 }, { account: "1201", debit: tax - Math.floor(tax / 2), credit: 0 });
  }
  lines.push({ account: "1010", debit: 0, credit: amount + tax });
  return postJournal(state, { date, narration, lines, source: "expense", ref });
}

export function startReconciliation(state, statementLines, fileName) {
  const session = { id: newId(state, "REC"), fileName, uploadedAt: state.clock(), status: "review", lines: autoMatch(state, statementLines) };
  state.bankSessions.unshift(session);
  audit(state, "bank.statement_uploaded", `${fileName}: ${statementLines.length} lines`);
  return session;
}

// Approve: matched journals are marked reconciled; invoice matches become receipts;
// lines given an account become new bank entries; ignored lines are left alone.
export function approveReconciliation(state, sessionId) {
  const s = state.bankSessions.find((x) => x.id === sessionId);
  if (!s || s.status !== "review") throw new Error("This session is not awaiting approval.");
  let matched = 0, created = 0;
  for (const line of s.lines) {
    if (line.ignored) continue;
    if (line.match?.kind === "journal") {
      const j = state.journals.find((x) => x.id === line.match.journalId);
      if (j) { j.reconciled = true; matched++; }
    } else if (line.match?.kind === "invoice") {
      const p = recordPayment(state, { invoiceId: line.match.invoiceId, date: line.date, amount: line.amount, mode: "Bank transfer", ref: line.description });
      state.journals.find((x) => x.id === p.journalId).reconciled = true;
      matched++;
    } else if (line.newAccount) {
      const amount = Math.abs(line.amount);
      const j = postJournal(state, {
        date: line.date, narration: line.description, source: "bank", ref: "",
        lines: line.amount > 0
          ? [{ account: "1010", debit: amount, credit: 0 }, { account: line.newAccount, debit: 0, credit: amount }]
          : [{ account: line.newAccount, debit: amount, credit: 0 }, { account: "1010", debit: 0, credit: amount }],
      });
      j.reconciled = true;
      created++;
    }
  }
  s.status = "approved";
  s.approvedAt = state.clock();
  s.approvedBy = state.currentUser;
  audit(state, "bank.session_approved", `${s.fileName}: ${matched} matched, ${created} new entries`);
  return { matched, created };
}

// ---------- sample data ----------

// Small deterministic random generator so the sample data is the same every time.
function rng(seed) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function emptyState(today) {
  return {
    version: 1, today, clock: () => new Date().toISOString(),
    counters: {}, currentUser: "Rohit Agarwal (Owner)", activeTenantId: "T1", impersonating: null, superAdmin: true,
    tenant: {}, tenants: [], gstins: [], clients: [], items: [], invoices: [], payments: [], journals: [],
    bankSessions: [], notices: [], team: [], audit: [],
  };
}

export function seed(today) {
  const state = emptyState(today);
  const r = rng(2026);
  const sellerGstin = makeGstin("09", "AAKFS4821P");
  state.tenant = {
    id: "T1", name: "Shree Ganesh Engineering Works", city: "Kanpur", state: "09", gstin: sellerGstin,
    address: "Plot 14, Panki Industrial Area, Kanpur, Uttar Pradesh 208022", invoicePrefix: "SGE",
    brand: { color: "#0E6E63", font: "Source Sans 3", logo: null, initials: "SG" },
    smtp: { host: "", port: "587", user: "", from: "" },
    modules: Object.fromEntries(MODULES.map((m) => [m.key, true])),
  };
  state.tenants = [
    { id: "T1", name: state.tenant.name, plan: "Growth", users: 5, city: "Kanpur", createdAt: addDays(today, -190), modules: state.tenant.modules, demoData: true },
    { id: "T2", name: "Verma Packaging Pvt Ltd", plan: "Starter", users: 3, city: "Noida", createdAt: addDays(today, -95), modules: { invoicing: true, items: true, gst: true, clients: true, bank: false, accounting: true } },
    { id: "T3", name: "Lucknow Precision Castings", plan: "Growth", users: 8, city: "Lucknow", createdAt: addDays(today, -40), modules: { invoicing: true, items: true, gst: true, clients: true, bank: true, accounting: true } },
  ];
  state.gstins = [
    { gstin: sellerGstin, state: "09", label: "Head office & factory, Kanpur", primary: true },
    { gstin: makeGstin("07", "AAKFS4821P"), state: "07", label: "Sales office, New Delhi", primary: false },
  ];
  state.clients = [
    { id: "C1", name: "Kanpur Auto Components Ltd", gstin: makeGstin("09", "AABCK7712M"), state: "09", city: "Kanpur", email: "accounts@kac.example", phone: "+91 90000 11001", contact: "Rakesh Mishra" },
    { id: "C2", name: "Delhi Hydraulics Pvt Ltd", gstin: makeGstin("07", "AAACD5531Q"), state: "07", city: "New Delhi", email: "purchase@dhpl.example", phone: "+91 90000 11002", contact: "Neha Kapoor" },
    { id: "C3", name: "Gurugram Motors LLP", gstin: makeGstin("06", "AAKFG9024R"), state: "06", city: "Gurugram", email: "ap@gmllp.example", phone: "+91 90000 11003", contact: "Vikram Singh" },
    { id: "C4", name: "Lucknow Infra Projects", gstin: makeGstin("09", "AAGFL3378K"), state: "09", city: "Lucknow", email: "finance@lip.example", phone: "+91 90000 11004", contact: "Sana Rizvi" },
    { id: "C5", name: "Pune Tooling Systems", gstin: makeGstin("27", "AAECP6619H"), state: "27", city: "Pune", email: "billing@pts.example", phone: "+91 90000 11005", contact: "Amit Kulkarni" },
    { id: "C6", name: "Ramesh Traders (walk-in)", gstin: "", state: "09", city: "Kanpur", email: "", phone: "+91 90000 11006", contact: "Ramesh Gupta" },
  ];
  for (const c of state.clients) c.interactions = [];
  state.items = [
    { id: "I1", name: "MS fabricated bracket", hsn: "7326", gstRate: 18, price: toPaise(420), unit: "pcs" },
    { id: "I2", name: "CNC machined shaft 40mm", hsn: "8483", gstRate: 18, price: toPaise(1850), unit: "pcs" },
    { id: "I3", name: "EN8 bright bar", hsn: "7215", gstRate: 18, price: toPaise(78), unit: "kg" },
    { id: "I4", name: "Hydraulic hose fitting", hsn: "8481", gstRate: 18, price: toPaise(265), unit: "pcs" },
    { id: "I5", name: "Machining job work", hsn: "998898", gstRate: 12, price: toPaise(950), unit: "hrs" },
    { id: "I6", name: "Wooden packing crate", hsn: "4415", gstRate: 12, price: toPaise(1200), unit: "pcs" },
    { id: "I7", name: "Hex bolt M12 (box of 100)", hsn: "7318", gstRate: 18, price: toPaise(640), unit: "box" },
  ];

  const start = addDays(today, -180);
  // Opening: capital, loan, machinery
  postJournal(state, { date: start, narration: "Owner's capital introduced", lines: [{ account: "1010", debit: toPaise(1500000), credit: 0 }, { account: "3000", debit: 0, credit: toPaise(1500000) }], source: "manual" });
  postJournal(state, { date: addDays(start, 3), narration: "Term loan disbursed — SIDBI", lines: [{ account: "1010", debit: toPaise(800000), credit: 0 }, { account: "2200", debit: 0, credit: toPaise(800000) }], source: "manual" });
  recordExpense(state, { date: addDays(start, 6), account: "1500", amount: toPaise(650000), gstRate: 18, narration: "VMC machine purchase — Jyoti CNC", ref: "PO-0007" });
  postJournal(state, { date: addDays(start, 1), narration: "Cash withdrawn for petty cash", lines: [{ account: "1000", debit: toPaise(25000), credit: 0 }, { account: "1010", debit: 0, credit: toPaise(25000) }], source: "manual" });

  // Six months of trading
  for (let m = 0; m < 6; m++) {
    const monthStart = addDays(start, m * 30 + 2);
    recordExpense(state, { date: addDays(monthStart, 1), account: "5200", amount: toPaise(60000), narration: "Factory rent", ref: "RENT" });
    recordExpense(state, { date: addDays(monthStart, 4), account: "5000", amount: toPaise(180000 + Math.round(r() * 90000)), gstRate: 18, narration: "Steel purchase — Kanpur Steel Depot", ref: `PUR-${m + 1}` });
    recordExpense(state, { date: addDays(monthStart, 9), account: "5300", amount: toPaise(28000 + Math.round(r() * 9000)), narration: "Electricity — KESCO", ref: "KESCO" });
    recordExpense(state, { date: addDays(monthStart, 27), account: "5100", amount: toPaise(210000), narration: "Salaries & wages", ref: "SAL" });
    recordExpense(state, { date: addDays(monthStart, 15), account: "5400", amount: toPaise(9000 + Math.round(r() * 6000)), gstRate: 12, narration: "Freight — VRL Logistics", ref: "VRL" });

    const invoicesThisMonth = 4 + Math.floor(r() * 3);
    for (let k = 0; k < invoicesThisMonth; k++) {
      const date = addDays(monthStart, Math.floor(r() * 26));
      if (date > today) continue;
      const client = state.clients[Math.floor(r() * state.clients.length)];
      const nLines = 1 + Math.floor(r() * 3);
      const lines = [];
      for (let n = 0; n < nLines; n++) {
        const item = state.items[Math.floor(r() * state.items.length)];
        if (lines.some((l) => l.itemId === item.id)) continue;
        const qty = item.unit === "kg" ? 200 + Math.floor(r() * 800) : item.unit === "hrs" ? 8 + Math.floor(r() * 40) : 10 + Math.floor(r() * 140);
        lines.push({ itemId: item.id, name: item.name, hsn: item.hsn, qty, rate: item.price, gstRate: item.gstRate, unit: item.unit });
      }
      const inv = createInvoice(state, { clientId: client.id, date, dueDays: client.gstin ? 30 : 0, lines });
      inv.emailedAt = client.email ? `${date}T11:00:00.000Z` : null;
      // Older invoices are mostly paid, recent ones mostly open.
      const age = (Date.parse(today) - Date.parse(date)) / 86_400_000;
      const roll = r();
      if ((age > 45 && roll < 0.85) || (age > 20 && roll < 0.5)) {
        const payDate = addDays(date, 12 + Math.floor(r() * 25));
        if (payDate <= addDays(today, -6)) {
          const part = roll < 0.12 && age > 45;
          recordPayment(state, { invoiceId: inv.id, date: payDate, amount: part ? Math.round(inv.totals.total / 2) : inv.totals.total, mode: "Bank transfer", ref: `NEFT ${inv.no}` });
        }
      }
    }
  }
  // Older bank entries are already reconciled
  for (const j of state.journals) if (j.date < addDays(today, -25)) j.reconciled = true;

  // A draft and IRNs on GST-registered clients' invoices
  createInvoice(state, { clientId: "C2", date: today, lines: [{ itemId: "I4", name: "Hydraulic hose fitting", hsn: "8481", qty: 120, rate: toPaise(265), gstRate: 18, unit: "pcs" }], draft: true });
  for (const inv of state.invoices) {
    const c = state.clients.find((x) => x.id === inv.clientId);
    if (inv.status === "issued" && c.gstin) inv.irn = demoIrn(state.tenant.gstin, inv.no, inv.date);
  }

  const ago = (d) => addDays(today, -d);
  state.clients[0].interactions.push({ date: ago(52), type: "Meeting", note: "Plant visit; discussed annual bracket contract (~40,000 pcs)." }, { date: ago(9), type: "Call", note: "Asked for revised quote on CNC shafts; send by Friday." });
  state.clients[1].interactions.push({ date: ago(30), type: "Email", note: "Sent catalogue of hydraulic fittings." }, { date: ago(2), type: "Call", note: "Ready to order 120 fittings; draft invoice prepared." });
  state.clients[2].interactions.push({ date: ago(70), type: "Meeting", note: "Vendor registration completed." }, { date: ago(18), type: "Call", note: "Payment follow-up on overdue invoice; promised by month end." });
  state.clients[4].interactions.push({ date: ago(14), type: "Email", note: "Shared drawings for tooling job work." });

  state.notices = [
    { id: "N1", gstin: sellerGstin, form: "ASMT-10", subject: "Mismatch between GSTR-1 and GSTR-3B (Q2)", issued: ago(21), due: addDays(today, 9), status: "Reply drafted" },
    { id: "N2", gstin: sellerGstin, form: "REG-17", subject: "Clarification on additional place of business", issued: ago(64), due: ago(34), status: "Closed" },
    { id: "N3", gstin: state.gstins[1].gstin, form: "GSTR-3A", subject: "Return not filed — Delhi registration", issued: ago(5), due: addDays(today, 10), status: "Open" },
  ];
  state.team = [
    { id: "U1", name: "Rohit Agarwal", email: "rohit@sge.example", role: "Owner", status: "Active", lastActive: today },
    { id: "U2", name: "Pooja Agarwal", email: "pooja@sge.example", role: "Accountant", status: "Active", lastActive: ago(1) },
    { id: "U3", name: "Manoj Yadav", email: "manoj@sge.example", role: "Sales", status: "Active", lastActive: ago(3) },
    { id: "U4", name: "CA Sunil Bajpai", email: "sunil@caoffice.example", role: "Viewer", status: "Active", lastActive: ago(12) },
    { id: "U5", name: "", email: "dispatch@sge.example", role: "Sales", status: "Invited", lastActive: null, invitedAt: ago(2) },
  ];
  const at = (d, h) => `${ago(d)}T${String(h).padStart(2, "0")}:15:00.000Z`;
  state.audit = [];
  audit(state, "workspace.created", state.tenant.name, { at: at(180, 5) });
  audit(state, "user.invited", "pooja@sge.example as Accountant", { at: at(170, 6) });
  audit(state, "settings.branding_updated", "Logo and brand colour", { at: at(150, 7) });
  audit(state, "gstin.added", `${state.gstins[1].gstin} (Delhi)`, { at: at(120, 9) });
  audit(state, "user.invited", "dispatch@sge.example as Sales", { at: at(2, 10) });
  audit(state, "login", "", { user: "Pooja Agarwal (Accountant)", at: at(1, 4) });
  audit(state, "workspace.created", "Verma Packaging Pvt Ltd", { tenantId: "T2", user: "Platform", at: at(95, 5) });
  audit(state, "module.disabled", "Bank reconciliation", { tenantId: "T2", user: "Super admin", at: at(60, 8) });
  audit(state, "workspace.created", "Lucknow Precision Castings", { tenantId: "T3", user: "Platform", at: at(40, 5) });
  audit(state, "invoice.issued", "LPC/26-27/0012", { tenantId: "T3", user: "Rahul Tiwari (Accountant)", at: at(1, 6) });
  state.audit.sort((a, b) => (a.at < b.at ? 1 : -1));
  // New records must never reuse an ID given to the sample data above.
  const highest = (list, prefix) => Math.max(0, ...list.map((x) => Number(String(x.id).slice(prefix.length)) || 0));
  state.counters.C = highest(state.clients, "C");
  state.counters.I = highest(state.items, "I");
  state.counters.N = highest(state.notices, "N");
  state.counters.U = highest(state.team, "U");
  return state;
}

// A realistic bank statement for the last few weeks: most lines match recorded entries,
// one is a receipt for an open invoice, two are charges/interest not yet in the books.
export function sampleStatement(state, today) {
  const from = addDays(today, -24);
  const lines = [];
  for (const j of state.journals) {
    if (j.date < from || j.reconciled) continue;
    const amount = j.lines.filter((l) => l.account === "1010").reduce((s, l) => s + l.debit - l.credit, 0);
    if (!amount) continue;
    const desc = amount > 0 ? `NEFT CR ${j.ref || j.narration}`.toUpperCase() : `${j.ref === "SAL" ? "BULK SALARY UPLOAD" : `NEFT DR ${j.narration}`}`.toUpperCase();
    const bankDate = j.source === "payment" ? j.date : addDays(j.date, 1);
    lines.push({ date: bankDate > today ? j.date : bankDate, description: desc.slice(0, 60), amount });
  }
  const open = state.invoices.filter((i) => i.status === "issued" && amountPaid(state, i.id) === 0 && i.date < addDays(today, -10)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (open) lines.push({ date: addDays(today, -2), description: `IMPS CR ${open.no} PAYMENT`, amount: open.totals.total });
  lines.push({ date: addDays(today, -4), description: "SMS ALERT CHARGES QTR", amount: -toPaise(59) });
  lines.push({ date: addDays(today, -1), description: "INTEREST CREDIT SB SWEEP", amount: toPaise(1840) });
  lines.sort((a, b) => (a.date < b.date ? -1 : 1));
  return ["date,description,amount", ...lines.map((l) => `${l.date},"${l.description.replaceAll('"', "")}",${(l.amount / 100).toFixed(2)}`)].join("\n");
}

export const SAMPLE_CATALOGUE = `Item | HSN | Price | GST
Flange coupling 50mm | 8483 | 1450 | 18
Spring washer M10 (box) | 7318 | 180 | 18
Laser cutting job work | 998898 | 22 | 12
Gear blank EN19 | 8483 | 2380 | 28
MS fabricated bracket | 7326 | 420 | 18
Powder coating service | 9988 | 35 | 18
Stainless hinge 4in | 8302 | 95 | 15`;
