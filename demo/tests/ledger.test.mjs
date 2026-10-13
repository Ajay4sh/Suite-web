import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../ledger.js";
import * as S from "../store.js";

const TODAY = "2026-10-13";
const fresh = () => S.seed(TODAY);

test("sample books balance: trial balance and balance sheet", () => {
  const s = fresh();
  const tb = L.trialBalance(s.journals, TODAY);
  assert.ok(tb.balanced, `TB ${tb.totalDebit} vs ${tb.totalCredit}`);
  const bs = L.balanceSheet(s.journals, TODAY);
  assert.ok(bs.balanced, `BS ${bs.totalAssets} vs ${bs.totalLiabEquity}`);
  assert.ok(s.invoices.length > 20, `invoices ${s.invoices.length}`);
});

test("cash flow closing equals cash + bank balance", () => {
  const s = fresh();
  const fy = L.financialYear(TODAY);
  const cf = L.cashFlow(s.journals, fy.start, TODAY);
  const b = L.balances(s.journals, { to: TODAY });
  assert.equal(cf.closing, (b["1000"] ?? 0) + (b["1010"] ?? 0));
  assert.ok(cf.totals.financing > 0 && cf.totals.investing < 0);
});

test("P&L net equals retained earnings movement", () => {
  const s = fresh();
  const pl = L.profitAndLoss(s.journals, "0000-01-01", TODAY);
  const bs = L.balanceSheet(s.journals, TODAY);
  assert.equal(bs.equity.at(-1).amount, pl.net);
});

test("GST: intra-state splits CGST/SGST, inter-state uses IGST", () => {
  const lines = [{ qty: 3, rate: 33333, gstRate: 18 }];
  const intra = L.invoiceTotals(lines, false);
  assert.equal(intra.cgst + intra.sgst, Math.round(99999 * 0.18));
  assert.equal(intra.igst, 0);
  const inter = L.invoiceTotals(lines, true);
  assert.equal(inter.igst, 18000);
  assert.equal(inter.total, 99999 + 18000);
});

test("issuing an invoice posts a balanced journal and numbers it", () => {
  const s = fresh();
  const inv = S.createInvoice(s, { clientId: "C2", date: TODAY, lines: [{ name: "Fitting", hsn: "8481", qty: 10, rate: 26500, gstRate: 18 }] });
  assert.match(inv.no, /^SGE\/26-27\/\d{4}$/);
  assert.ok(inv.totals.igst > 0, "Delhi client from UP is inter-state");
  const j = s.journals.find((x) => x.id === inv.journalId);
  assert.equal(L.journalProblems(j.lines), null);
});

test("payments can't exceed what is outstanding", () => {
  const s = fresh();
  const inv = S.createInvoice(s, { clientId: "C1", date: TODAY, lines: [{ name: "Bracket", hsn: "7326", qty: 1, rate: 10000, gstRate: 18 }] });
  assert.throws(() => S.recordPayment(s, { invoiceId: inv.id, date: TODAY, amount: 999999 }), /more than what is outstanding/);
  S.recordPayment(s, { invoiceId: inv.id, date: TODAY, amount: 11800 });
  assert.equal(L.invoiceStatus(s, inv, TODAY), "paid");
});

test("unbalanced journals are refused; reversal nets to zero and can't repeat", () => {
  const s = fresh();
  assert.throws(() => S.postJournal(s, { date: TODAY, narration: "x", lines: [{ account: "5500", debit: 100 }, { account: "1010", credit: 90 }] }), /must be equal/);
  const j = S.postJournal(s, { date: TODAY, narration: "Bank charges", lines: [{ account: "5500", debit: 500 }, { account: "1010", credit: 500 }] });
  const before = L.balances(s.journals)["5500"];
  S.reverseJournal(s, j.id, TODAY);
  assert.equal(L.balances(s.journals)["5500"], before - 500);
  assert.throws(() => S.reverseJournal(s, j.id, TODAY), /already been reversed/);
});

test("GSTIN validation and generated GSTINs", () => {
  const g = L.makeGstin("09", "AAKFS4821P");
  assert.equal(L.validateGstin(g), null);
  assert.match(L.validateGstin(g.slice(0, 14) + (g[14] === "A" ? "B" : "A")), /check digit/);
  assert.match(L.validateGstin("123"), /15 characters/);
});

test("bank reconciliation: auto-match, create entries, approve", () => {
  const s = fresh();
  const csv = S.sampleStatement(s, TODAY);
  const lines = L.parseStatementCsv(csv);
  assert.ok(lines.length >= 5);
  const session = S.startReconciliation(s, lines, "statement.csv");
  const matched = session.lines.filter((l) => l.match);
  const unmatched = session.lines.filter((l) => !l.match);
  assert.ok(matched.length >= lines.length - 2, `${matched.length} of ${lines.length} matched`);
  assert.ok(matched.some((l) => l.match.kind === "invoice"), "open invoice receipt suggested");
  assert.equal(unmatched.length, 2);
  unmatched[0].newAccount = unmatched[0].amount > 0 ? "4100" : "5500";
  unmatched[1].newAccount = unmatched[1].amount > 0 ? "4100" : "5500";
  const result = S.approveReconciliation(s, session.id);
  assert.equal(result.created, 2);
  assert.ok(L.trialBalance(s.journals, TODAY).balanced);
  assert.throws(() => S.approveReconciliation(s, session.id), /not awaiting/);
});

test("catalogue import flags bad rows and duplicates", () => {
  const s = fresh();
  const rows = L.reviewCatalogueRows(L.parseCatalogueText(S.SAMPLE_CATALOGUE), s.items);
  assert.equal(rows.length, 7);
  assert.ok(rows.find((r) => r.name === "MS fabricated bracket").issues.includes("Already in your item master"));
  assert.ok(rows.find((r) => r.name === "Stainless hinge 4in").issues.some((i) => i.includes("GST rate")));
  assert.ok(rows.find((r) => r.name === "Flange coupling 50mm").include);
});

test("GSTR-1 and liability come from the books", () => {
  const s = fresh();
  const month = TODAY.slice(0, 7);
  const prev = L.addDays(`${month}-01`, -1).slice(0, 7);
  const r1 = L.gstr1(s, prev);
  assert.ok(r1.count > 0 && r1.b2b.length > 0 && r1.hsn.length > 0);
  const liab = L.gstLiability(s.journals, prev);
  const taxOnInvoices = s.invoices.filter((i) => i.status !== "draft" && i.date.startsWith(prev)).reduce((t, i) => t + i.totals.cgst + i.totals.sgst + i.totals.igst, 0);
  assert.equal(liab.totalOutput, taxOnInvoices);
  assert.equal(liab.dueDate, `${month}-20`);
});

test("new records never reuse sample-data IDs", () => {
  const s = fresh();
  for (const [prefix, list] of [["U", s.team], ["C", s.clients], ["I", s.items], ["N", s.notices]]) {
    const id = S.newId(s, prefix);
    assert.ok(!list.some((x) => x.id === id), `${id} collides`);
  }
});
