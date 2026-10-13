// Avyntro demo — accounting engine. Pure functions, no DOM.
// All money is stored in paise (integers) so totals never drift.

export const ACCOUNTS = [
  { code: "1000", name: "Cash in hand", type: "asset", cash: true },
  { code: "1010", name: "HDFC Bank current account", type: "asset", cash: true, bank: true },
  { code: "1100", name: "Accounts receivable", type: "asset" },
  { code: "1200", name: "Input CGST", type: "asset" },
  { code: "1201", name: "Input SGST", type: "asset" },
  { code: "1202", name: "Input IGST", type: "asset" },
  { code: "1500", name: "Plant & machinery", type: "asset", investing: true },
  { code: "2000", name: "Accounts payable", type: "liability" },
  { code: "2100", name: "Output CGST", type: "liability" },
  { code: "2101", name: "Output SGST", type: "liability" },
  { code: "2102", name: "Output IGST", type: "liability" },
  { code: "2200", name: "Term loan", type: "liability", financing: true },
  { code: "3000", name: "Owner's capital", type: "equity", financing: true },
  { code: "4000", name: "Sales", type: "income" },
  { code: "4100", name: "Other income", type: "income" },
  { code: "5000", name: "Raw material purchases", type: "expense" },
  { code: "5100", name: "Salaries & wages", type: "expense" },
  { code: "5200", name: "Factory rent", type: "expense" },
  { code: "5300", name: "Electricity", type: "expense" },
  { code: "5400", name: "Freight & transport", type: "expense" },
  { code: "5500", name: "Bank charges", type: "expense" },
];

export const accountName = (code) => ACCOUNTS.find((a) => a.code === code)?.name ?? code;
export const accountType = (code) => ACCOUNTS.find((a) => a.code === code)?.type;

export const GST_RATES = [0, 5, 12, 18, 28];

// ---------- money ----------
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export function formatINR(paise, { sign = false } = {}) {
  const value = (paise ?? 0) / 100;
  const text = Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value < 0) return `−₹${text}`;
  return `${sign && value > 0 ? "+" : ""}₹${text}`;
}

// ---------- dates ----------
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
export const monthKey = (date) => date.slice(0, 7);
// Indian financial year: April to March. "2026-10-13" -> { start: "2026-04-01", end: "2027-03-31", label: "FY 2026-27" }
export function financialYear(date) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return { start: `${start}-04-01`, end: `${start + 1}-03-31`, label: `FY ${start}-${String(start + 1).slice(2)}` };
}

// ---------- GSTIN ----------
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GST_STATES = {
  "07": "Delhi", "09": "Uttar Pradesh", "06": "Haryana", "27": "Maharashtra", "29": "Karnataka",
  "24": "Gujarat", "33": "Tamil Nadu", "08": "Rajasthan", "19": "West Bengal", "36": "Telangana",
};

export function gstinCheckDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

// Returns null when valid, or a plain-English problem.
export function validateGstin(raw) {
  const g = String(raw ?? "").trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return "A GSTIN has 15 characters: 2-digit state code, 10-character PAN, entity number, Z and a check character.";
  if (!GST_STATES[g.slice(0, 2)] && !(Number(g.slice(0, 2)) >= 1 && Number(g.slice(0, 2)) <= 38)) return "The first two digits are not a valid state code.";
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) return "The last character (check digit) doesn't match — please re-check the GSTIN.";
  return null;
}

export const makeGstin = (stateCode, pan, entity = "1") => {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckDigit(first14);
};

// ---------- invoices ----------
// Tax per line, split CGST+SGST within the same state, IGST across states.
export function invoiceTotals(lines, interState) {
  const out = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, byRate: {} };
  for (const l of lines) {
    const taxable = Math.round(Number(l.qty) * l.rate);
    const tax = Math.round((taxable * l.gstRate) / 100);
    let cgst = 0, sgst = 0, igst = 0;
    if (interState) igst = tax;
    else {
      cgst = Math.floor(tax / 2);
      sgst = tax - cgst;
    }
    out.taxable += taxable;
    out.cgst += cgst;
    out.sgst += sgst;
    out.igst += igst;
    const r = (out.byRate[l.gstRate] ??= { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    r.taxable += taxable; r.cgst += cgst; r.sgst += sgst; r.igst += igst;
  }
  out.total = out.taxable + out.cgst + out.sgst + out.igst;
  return out;
}

export function invoiceJournalLines(totals) {
  const lines = [{ account: "1100", debit: totals.total, credit: 0 }, { account: "4000", debit: 0, credit: totals.taxable }];
  if (totals.cgst) lines.push({ account: "2100", debit: 0, credit: totals.cgst });
  if (totals.sgst) lines.push({ account: "2101", debit: 0, credit: totals.sgst });
  if (totals.igst) lines.push({ account: "2102", debit: 0, credit: totals.igst });
  return lines;
}

export const amountPaid = (state, invoiceId) => state.payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);

export function invoiceStatus(state, inv, today) {
  if (inv.status === "draft") return "draft";
  const due = inv.totals.total - amountPaid(state, inv.id);
  if (due <= 0) return "paid";
  if (due < inv.totals.total) return inv.due < today ? "overdue" : "part-paid";
  return inv.due < today ? "overdue" : "unpaid";
}

// Demo-only IRN: 64 hex characters like a real IRN, but NOT registered with the GST portal (IRP).
export function demoIrn(sellerGstin, docNo, date) {
  const text = `${sellerGstin}|${financialYear(date).label}|INV|${docNo}`;
  let out = "";
  for (let round = 0; out.length < 64; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

// ---------- journals ----------
export function journalProblems(lines) {
  const used = lines.filter((l) => l.account && (l.debit || l.credit));
  if (used.length < 2) return "An entry needs at least two lines.";
  if (used.some((l) => l.debit && l.credit)) return "A line can have a debit or a credit, not both.";
  if (used.some((l) => l.debit < 0 || l.credit < 0)) return "Amounts can't be negative.";
  const dr = used.reduce((s, l) => s + (l.debit || 0), 0);
  const cr = used.reduce((s, l) => s + (l.credit || 0), 0);
  if (dr !== cr) return `Debits (${formatINR(dr)}) and credits (${formatINR(cr)}) must be equal.`;
  if (dr === 0) return "The entry has no amount.";
  return null;
}

export function reversalLines(lines) {
  return lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit }));
}

// Signed movement per account between two dates (inclusive). Debit positive.
export function balances(journals, { from = "0000-01-01", to = "9999-12-31" } = {}) {
  const out = {};
  for (const j of journals) {
    if (j.date < from || j.date > to) continue;
    for (const l of j.lines) out[l.account] = (out[l.account] ?? 0) + (l.debit || 0) - (l.credit || 0);
  }
  return out;
}

export function trialBalance(journals, asOf) {
  const b = balances(journals, { to: asOf });
  const rows = ACCOUNTS.filter((a) => b[a.code]).map((a) => ({
    code: a.code, name: a.name, type: a.type,
    debit: b[a.code] > 0 ? b[a.code] : 0,
    credit: b[a.code] < 0 ? -b[a.code] : 0,
  }));
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function profitAndLoss(journals, from, to) {
  const b = balances(journals, { from, to });
  const income = ACCOUNTS.filter((a) => a.type === "income" && b[a.code]).map((a) => ({ code: a.code, name: a.name, amount: -b[a.code] }));
  const expenses = ACCOUNTS.filter((a) => a.type === "expense" && b[a.code]).map((a) => ({ code: a.code, name: a.name, amount: b[a.code] }));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

export function balanceSheet(journals, asOf) {
  const b = balances(journals, { to: asOf });
  const pick = (type, sign) => ACCOUNTS.filter((a) => a.type === type && b[a.code]).map((a) => ({ code: a.code, name: a.name, amount: sign * b[a.code] }));
  const assets = pick("asset", 1);
  const liabilities = pick("liability", -1);
  const equity = pick("equity", -1);
  const earnings = ACCOUNTS.filter((a) => a.type === "income" || a.type === "expense").reduce((s, a) => s - (b[a.code] ?? 0), 0);
  equity.push({ code: "", name: "Retained earnings (profit to date)", amount: earnings });
  const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);
  const totalAssets = sum(assets);
  const totalLiabEquity = sum(liabilities) + sum(equity);
  return { assets, liabilities, equity, totalAssets, totalLiabilities: sum(liabilities), totalEquity: sum(equity), totalLiabEquity, balanced: totalAssets === totalLiabEquity };
}

// Direct-method cash flow: each journal's cash movement is classed by the other accounts it touches.
export function cashFlow(journals, from, to) {
  const isCash = (code) => ACCOUNTS.find((a) => a.code === code)?.cash;
  const sections = { operating: [], investing: [], financing: [] };
  const cashMove = (j) => j.lines.filter((l) => isCash(l.account)).reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
  for (const j of journals) {
    if (j.date < from || j.date > to) continue;
    const move = cashMove(j);
    if (!move) continue;
    const others = j.lines.filter((l) => !isCash(l.account)).map((l) => ACCOUNTS.find((a) => a.code === l.account) ?? {});
    const kind = others.some((a) => a.financing) ? "financing" : others.some((a) => a.investing) ? "investing" : "operating";
    sections[kind].push({ date: j.date, narration: j.narration, amount: move });
  }
  const opening = journals.filter((j) => j.date < from).reduce((s, j) => s + cashMove(j), 0);
  const totals = Object.fromEntries(Object.entries(sections).map(([k, rows]) => [k, rows.reduce((s, r) => s + r.amount, 0)]));
  const net = totals.operating + totals.investing + totals.financing;
  return { sections, totals, opening, net, closing: opening + net };
}

// ---------- GST returns ----------
export function gstr1(state, month) {
  const invoices = state.invoices.filter((i) => i.status !== "draft" && monthKey(i.date) === month);
  const b2b = [], b2cs = {}, hsn = {};
  for (const inv of invoices) {
    const client = state.clients.find((c) => c.id === inv.clientId);
    if (client?.gstin) {
      for (const [rate, t] of Object.entries(inv.totals.byRate)) {
        b2b.push({ gstin: client.gstin, name: client.name, invoiceNo: inv.no, date: inv.date, value: inv.totals.total, pos: inv.placeOfSupply, rate: Number(rate), ...t });
      }
    } else {
      for (const [rate, t] of Object.entries(inv.totals.byRate)) {
        const key = `${inv.placeOfSupply}|${rate}`;
        const row = (b2cs[key] ??= { pos: inv.placeOfSupply, rate: Number(rate), taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        row.taxable += t.taxable; row.cgst += t.cgst; row.sgst += t.sgst; row.igst += t.igst;
      }
    }
    for (const l of inv.lines) {
      const taxable = Math.round(l.qty * l.rate);
      const tax = Math.round((taxable * l.gstRate) / 100);
      const row = (hsn[`${l.hsn}|${l.gstRate}`] ??= { hsn: l.hsn, description: l.name, rate: l.gstRate, qty: 0, taxable: 0, tax: 0 });
      row.qty += Number(l.qty); row.taxable += taxable; row.tax += tax;
    }
  }
  return { b2b, b2cs: Object.values(b2cs), hsn: Object.values(hsn), count: invoices.length };
}

// Output tax minus input tax credit, per month, from the ledger.
export function gstLiability(journals, month) {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const b = balances(journals, { from, to });
  const output = { cgst: -(b["2100"] ?? 0), sgst: -(b["2101"] ?? 0), igst: -(b["2102"] ?? 0) };
  const input = { cgst: b["1200"] ?? 0, sgst: b["1201"] ?? 0, igst: b["1202"] ?? 0 };
  const totalOutput = output.cgst + output.sgst + output.igst;
  const totalInput = input.cgst + input.sgst + input.igst;
  const [y, m] = month.split("-").map(Number);
  const dueDate = m === 12 ? `${y + 1}-01-20` : `${y}-${String(m + 1).padStart(2, "0")}-20`;
  return { output, input, totalOutput, totalInput, net: totalOutput - totalInput, dueDate };
}

// ---------- bank reconciliation ----------
export function parseStatementCsv(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3) continue;
    const [date, description, amountText] = cells;
    const amount = Number(amountText.replace(/[₹\s]/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount === 0) continue;
    rows.push({ date, description, amount: toPaise(amount) });
  }
  return rows;
}

// Suggest a match for each statement line: an unreconciled bank journal with the same
// amount within 5 days (preferring one whose invoice number appears in the description),
// or, for money in, an open invoice for exactly the outstanding amount.
export function autoMatch(state, statementLines) {
  const used = new Set();
  const dayGap = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
  const bankMoves = state.journals
    .filter((j) => !j.reconciled && !j.reversedBy && !j.reversalOf)
    .map((j) => ({ j, amount: j.lines.filter((l) => l.account === "1010").reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0) }))
    .filter((x) => x.amount !== 0);

  return statementLines.map((line) => {
    const candidates = bankMoves.filter((x) => !used.has(x.j.id) && x.amount === line.amount && dayGap(x.j.date, line.date) <= 5);
    const byRef = candidates.find((x) => x.j.ref && line.description.toUpperCase().includes(x.j.ref.toUpperCase()));
    const hit = byRef ?? candidates.sort((a, b) => dayGap(a.j.date, line.date) - dayGap(b.j.date, line.date))[0];
    if (hit) {
      used.add(hit.j.id);
      return { ...line, match: { kind: "journal", journalId: hit.j.id, label: hit.j.narration, confidence: byRef ? "high" : "medium" } };
    }
    if (line.amount > 0) {
      const inv = state.invoices.find(
        (i) => i.status !== "draft" && !used.has(`inv:${i.id}`) && i.totals.total - amountPaid(state, i.id) === line.amount &&
          (line.description.toUpperCase().includes(i.no.toUpperCase()) || dayGap(i.date, line.date) <= 90),
      );
      if (inv) {
        used.add(`inv:${inv.id}`);
        const byNo = line.description.toUpperCase().includes(inv.no.toUpperCase());
        return { ...line, match: { kind: "invoice", invoiceId: inv.id, label: `Receipt against ${inv.no}`, confidence: byNo ? "high" : "low" } };
      }
    }
    return { ...line, match: null };
  });
}

// ---------- catalogue import ----------
// Reads "Name | HSN | Price | GST%" or CSV rows from extracted catalogue text.
export function parseCatalogueText(text) {
  const rows = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(name|item|product)\b/i.test(line)) continue;
    const cells = line.split(/\s*[|,\t]\s*/).filter((c) => c !== "");
    if (cells.length < 2) continue;
    const [name, hsn = "", price = "", gst = ""] = cells;
    rows.push({ name, hsn: hsn.replace(/\D/g, ""), price: Number(String(price).replace(/[₹,\s]/g, "")) || 0, gstRate: Number(String(gst).replace(/[%\s]/g, "")) });
  }
  return rows;
}

export function reviewCatalogueRows(rows, existingItems) {
  return rows.map((r) => {
    const issues = [];
    if (!/^\d{4}(\d{2})?(\d{2})?$/.test(r.hsn)) issues.push("HSN/SAC should be 4, 6 or 8 digits");
    if (!GST_RATES.includes(r.gstRate)) issues.push("GST rate must be 0, 5, 12, 18 or 28%");
    if (!(r.price > 0)) issues.push("Price is missing");
    if (existingItems.some((i) => i.name.toLowerCase() === r.name.toLowerCase())) issues.push("Already in your item master");
    return { ...r, issues, include: issues.length === 0 };
  });
}
