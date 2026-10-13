// Avyntro demo app. Static, runs in the browser; data is sample data kept in this browser only.
import * as L from "./ledger.js";
import * as S from "./store.js";

const KEY = "avyntro-demo-v1";
const pad = (n) => String(n).padStart(2, "0");
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const TODAY = localToday();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
const fmtMonth = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fmtTime = (isoTs) => {
  const d = new Date(isoTs);
  return `${fmtDate(localDateOf(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localDateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inr = L.formatINR;

// ---------- state ----------
let state;
const ui = { inv: null, journal: null, importRows: null, importNote: "", invSearch: "", auditQuery: "", auditUser: "", journalAll: false };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.version === 1) return attach(s);
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return attach(S.seed(TODAY));
}
function attach(s) {
  s.clock = () => new Date().toISOString();
  return s;
}
function save() {
  try {
    const { clock, ...rest } = state;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* private mode or full storage: the demo still works for this visit */
  }
}
function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = attach(S.seed(TODAY));
  save();
  location.hash = "#/dashboard";
  render();
  toast("Sample data reset.");
}

// ---------- tiny templating (auto-escaping) ----------
class Raw {
  constructor(v) {
    this.v = v;
  }
  toString() {
    return this.v;
  }
}
const raw = (v) => new Raw(String(v));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const out = (v) => (v instanceof Raw ? v.v : Array.isArray(v) ? v.map(out).join("") : v === null || v === undefined || v === false ? "" : esc(v));
function html(strings, ...values) {
  let s = strings[0];
  values.forEach((v, i) => (s += out(v) + strings[i + 1]));
  return new Raw(s);
}
const sel = (cond) => (cond ? raw("selected") : "");
const chk = (cond) => (cond ? raw("checked") : "");

// ---------- helpers ----------
const tenantMeta = () => state.tenants.find((t) => t.id === state.activeTenantId);
const moduleOn = (key) => !!tenantMeta()?.modules?.[key];
const client = (id) => state.clients.find((c) => c.id === id);
const outstanding = (inv) => inv.totals.total - L.amountPaid(state, inv.id);
const statusLabel = { draft: "Draft", paid: "Paid", "part-paid": "Part-paid", unpaid: "Unpaid", overdue: "Overdue" };
const statusBadge = (inv) => {
  const s = L.invoiceStatus(state, inv, TODAY);
  return html`<span class="badge ${s}">${statusLabel[s]}</span>`;
};
const stateName = (code) => L.GST_STATES[code] ?? `State ${code}`;
const lastMonths = (n) => {
  const res = [];
  let m = TODAY.slice(0, 7);
  for (let i = 0; i < n; i++) {
    res.unshift(m);
    m = L.addDays(`${m}-01`, -1).slice(0, 7);
  }
  return res;
};
const monthEnd = (m) => L.addDays(L.addDays(`${m}-28`, 4).slice(0, 7) + "-01", -1);
function query() {
  const q = location.hash.split("?")[1] ?? "";
  return Object.fromEntries(new URLSearchParams(q));
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
function toast(message) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
function download(name, text, type = "text/csv") {
  const blob = new Blob([type === "text/csv" ? "﻿" + text : text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
const csv = (rows) =>
  rows.map((r) => r.map((c) => {
    let s = String(c ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
const rupees = (paise) => (paise / 100).toFixed(2);
function act(action, detail) {
  S.audit(state, action, detail);
}

// ---------- icons ----------
const ICON = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  invoices: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  items: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  gst: '<path d="M4 4h16v16H4z"/><path d="M8 15l8-8"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/>',
  clients: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M16 4.5a3 3 0 010 6M18 14.5c1.8.6 3 2.6 3 5.5"/>',
  bank: '<path d="M3 9l9-5 9 5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  journal: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15H4.5a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0011.2 4.4V4.5a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.4.9z"/>',
  team: '<circle cx="8" cy="9" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20c0-3 2.4-5 5.5-5s5.5 2 5.5 5M14.5 15.3c2.8-.4 6 1.2 6 4.7"/>',
  audit: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  admin: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  roadmap: '<path d="M4 20V5l5-2 6 3 5-2v15l-5 2-6-3-5 2z"/><path d="M9 3v15M15 6v15"/>',
};
const icon = (name) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`);

const NAV = [
  { group: "Overview" },
  { path: "dashboard", label: "Dashboard", icon: "dashboard" },
  { group: "Sales" },
  { path: "invoices", label: "Invoices", icon: "invoices", module: "invoicing" },
  { path: "items", label: "Item master", icon: "items", module: "items" },
  { path: "clients", label: "Clients", icon: "clients", module: "clients" },
  { group: "Compliance & accounts" },
  { path: "gst", label: "GST compliance", icon: "gst", module: "gst" },
  { path: "bank", label: "Bank reconciliation", icon: "bank", module: "bank" },
  { path: "journal", label: "Journal entries", icon: "journal", module: "accounting" },
  { path: "reports", label: "Financial reports", icon: "reports", module: "accounting" },
  { group: "Workspace" },
  { path: "settings", label: "Branding & email", icon: "settings" },
  { path: "team", label: "Team", icon: "team" },
  { path: "audit", label: "Audit log", icon: "audit" },
  { path: "admin", label: "Super admin", icon: "admin" },
  { path: "roadmap", label: "Coming soon", icon: "roadmap", soon: true },
];

// ---------- shell ----------
function shell(section, body) {
  const t = state.tenant;
  const meta = tenantMeta();
  const imp = state.impersonating ? state.tenants.find((x) => x.id === state.impersonating) : null;
  const wsName = imp ? imp.name : t.name;
  const initials = imp ? imp.name.split(" ").map((w) => w[0]).slice(0, 2).join("") : t.brand.initials;
  return html`
    <div class="demo-banner no-print">
      <span>Demo workspace with sample data. Changes are saved only in this browser.</span>
      <button type="button" data-act="reset">Reset sample data</button>
      <a href="../request-access.html" style="color:#6B4510;text-decoration:underline">Request early access</a>
    </div>
    ${imp ? html`<div class="imp-banner no-print" role="status">Super admin view: you are signed in to <strong>${imp.name}</strong> to help with support. Actions are recorded in the platform audit log. <button type="button" data-act="exit-impersonation">Exit</button></div>` : ""}
    <div class="shell">
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <div class="ws">
          <div class="ws-logo" aria-hidden="true">${!imp && t.brand.logo ? html`<img src="${t.brand.logo}" alt="">` : initials}</div>
          <div><div class="ws-name">${wsName}</div><div class="ws-sub">${imp ? imp.city : `${t.city} · ${t.gstin}`}</div></div>
        </div>
        <nav class="nav">
          ${NAV.map((n) =>
            n.group
              ? html`<div class="nav-group">${n.group}</div>`
              : n.module && !meta?.modules?.[n.module]
                ? ""
                : html`<a href="#/${n.path}" ${section === n.path ? raw('aria-current="page"') : ""}>${icon(n.icon)}<span>${n.label}</span>${n.soon ? html`<span class="soon">12</span>` : ""}</a>`,
          )}
        </nav>
        <a class="back-site" href="../index.html">← Back to avyntro.com</a>
      </aside>
      <div class="main">
        <header class="topbar no-print">
          <button class="btn small menu-btn" type="button" data-act="menu" aria-controls="sidebar" aria-expanded="false">Menu</button>
          <span class="muted" style="font-size:13px">${L.financialYear(TODAY).label}</span>
          <span class="spacer"></span>
          <div class="user-chip"><span class="avatar" aria-hidden="true">RA</span><span class="who">${state.currentUser}</span></div>
        </header>
        <main class="content" id="content" tabindex="-1">${body}</main>
      </div>
    </div>`;
}

function moduleOff(name) {
  return html`<div class="card empty"><h1 style="margin-bottom:8px">${name} is turned off</h1><p>A platform administrator has switched this module off for this workspace. Turn it back on in <a href="#/admin">Super admin</a>.</p></div>`;
}

// ---------- pages ----------
const PAGES = [];
const page = (pattern, section, fn, module) => PAGES.push({ pattern, section, fn, module });

function head(title, sub, actions = "") {
  return html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ""}</div><div class="actions no-print">${actions}</div></div>`;
}

// Dashboard
page(/^dashboard$/, "dashboard", () => {
  const month = TODAY.slice(0, 7);
  const sales = L.profitAndLoss(state.journals, `${month}-01`, TODAY).income.find((r) => r.code === "4000")?.amount ?? 0;
  const bal = L.balances(state.journals, { to: TODAY });
  const liab = L.gstLiability(state.journals, month);
  const months = lastMonths(6);
  const series = months.map((m) => ({ m, v: L.profitAndLoss(state.journals, `${m}-01`, monthEnd(m)).income.find((r) => r.code === "4000")?.amount ?? 0 }));
  const overdue = state.invoices.filter((i) => L.invoiceStatus(state, i, TODAY) === "overdue").sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdueTotal = overdue.reduce((s, i) => s + outstanding(i), 0);
  return html`
    ${head(`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, Rohit`, `Here's ${state.tenant.name} as of ${fmtDate(TODAY)}.`, html`<a class="btn primary" href="#/invoices/new">New invoice</a>`)}
    <div class="tiles">
      <div class="tile"><div class="label">Sales this month (before GST)</div><div class="value">${inr(sales)}</div><div class="note">${fmtMonth(month)}</div></div>
      <div class="tile"><div class="label">Receivables outstanding</div><div class="value">${inr(bal["1100"] ?? 0)}</div><div class="note">${overdue.length} overdue · ${inr(overdueTotal)}</div></div>
      <div class="tile"><div class="label">Net GST payable · ${fmtMonth(month)}</div><div class="value">${inr(Math.max(liab.net, 0))}</div><div class="note">${liab.net < 0 ? `Credit carried forward ${inr(-liab.net)} · ` : ""}Due ${fmtDate(liab.dueDate)}</div></div>
      <div class="tile"><div class="label">HDFC Bank balance (books)</div><div class="value">${inr(bal["1010"] ?? 0)}</div><div class="note">Cash in hand ${inr(bal["1000"] ?? 0)}</div></div>
    </div>
    <div class="grid two">
      <section class="card" aria-labelledby="rev-h">
        <div class="card-head"><h2 id="rev-h">Sales by month (before GST)</h2><a href="#/reports?tab=pl">Profit &amp; loss →</a></div>
        ${barChart(series)}
        <details style="margin-top:8px"><summary class="muted" style="font-size:13px;cursor:pointer">Show as table</summary>
          <table class="t" style="margin-top:8px"><thead><tr><th>Month</th><th class="num">Sales</th></tr></thead><tbody>${series.map((s) => html`<tr><td>${fmtMonth(s.m)}</td><td class="num">${inr(s.v)}</td></tr>`)}</tbody></table>
        </details>
      </section>
      <section class="card" aria-labelledby="od-h">
        <div class="card-head"><h2 id="od-h">Overdue invoices</h2><a href="#/invoices?status=overdue">All overdue →</a></div>
        ${overdue.length
          ? html`<ul class="list">${overdue.slice(0, 6).map((i) => html`<li><span><a href="#/invoices/${i.id}">${i.no}</a> · ${client(i.clientId).name}<br><span class="faint" style="font-size:12.5px">${Math.round((Date.parse(TODAY) - Date.parse(i.due)) / 86_400_000)} days overdue</span></span><strong class="num">${inr(outstanding(i))}</strong></li>`)}</ul>`
          : html`<p class="empty">Nothing overdue.</p>`}
      </section>
    </div>
    <div class="grid two" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Recent activity</h2><a href="#/audit">Audit log →</a></div>
        <ul class="list">${state.audit.filter((a) => a.tenantId === "T1").slice(0, 6).map((a) => html`<li><span>${describeAction(a)}<br><span class="faint" style="font-size:12.5px">${a.user}</span></span><span class="faint" style="font-size:12.5px;white-space:nowrap">${fmtTime(a.at)}</span></li>`)}</ul>
      </section>
      <section class="card"><div class="card-head"><h2>Try these in the demo</h2></div>
        <ul class="list">
          <li><span>Raise a GST invoice with item autocomplete and IRN</span><a href="#/invoices/new">Open</a></li>
          <li><span>Reconcile a bank statement with auto-matching</span><a href="#/bank">Open</a></li>
          <li><span>Import a product catalogue with a review step</span><a href="#/items/import">Open</a></li>
          <li><span>See GSTR-1 data and GST liability</span><a href="#/gst">Open</a></li>
          <li><span>Rebrand the workspace with your logo and colour</span><a href="#/settings">Open</a></li>
        </ul>
      </section>
    </div>`;
});

function barChart(series) {
  const W = window.innerWidth < 640 ? 340 : 560, H = 220, top = 24, bottom = 28, left = 52, right = 8;
  const max = Math.max(...series.map((s) => s.v), 1);
  const nice = niceMax(max);
  const band = (W - left - right) / series.length;
  const bw = Math.min(24, band * 0.5);
  const y = (v) => top + (H - top - bottom) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const last = series.length - 1;
  const peak = series.reduce((b, s, i) => (s.v > series[b].v ? i : b), 0);
  const short = (p) => {
    const r = p / 100;
    return r >= 1e7 ? `₹${(r / 1e7).toFixed(1)}Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)}L` : `₹${Math.round(r / 1000)}K`;
  };
  return html`<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales by month, last six months">
    ${ticks.map((t) => html`<line class="grid-line" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"></line><text x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${t ? short(t) : "0"}</text>`)}
    ${series.map((s, i) => {
      const x = left + band * i + (band - bw) / 2;
      const yy = y(s.v), h = Math.max(H - bottom - yy, 0), r = Math.min(4, h);
      const d = `M${x},${H - bottom} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${H - bottom} Z`;
      return html`<g><rect class="hit" x="${left + band * i}" y="${top}" width="${band}" height="${H - top - bottom}" fill="transparent"><title>${fmtMonth(s.m)}: ${inr(s.v)}</title></rect><path class="bar" d="${d}"><title>${fmtMonth(s.m)}: ${inr(s.v)}</title></path>
        ${i === last || i === peak ? html`<text class="val" x="${x + bw / 2}" y="${yy - 6}" text-anchor="middle">${short(s.v)}</text>` : ""}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${MONTHS[Number(s.m.slice(5, 7)) - 1]}</text></g>`;
    })}
  </svg></div>`;
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const ACTION_TEXT = {
  "invoice.issued": "Invoice issued", "invoice.draft_saved": "Draft invoice saved", "invoice.irn_generated": "E-invoice IRN generated", "invoice.emailed": "Invoice emailed",
  "invoice.draft_deleted": "Draft deleted", "payment.recorded": "Payment recorded", "journal.posted": "Journal entry posted", "journal.reversed": "Journal entry reversed",
  "bank.statement_uploaded": "Bank statement uploaded", "bank.session_approved": "Reconciliation approved", "items.imported": "Catalogue imported", "item.saved": "Item saved",
  "client.added": "Client added", "client.interaction_logged": "Interaction logged", "gstin.added": "GSTIN added", "gstin.primary_changed": "Primary GSTIN changed",
  "notice.status_changed": "GST notice updated", "notice.added": "GST notice added", "settings.branding_updated": "Branding updated", "settings.smtp_updated": "Email (SMTP) settings updated",
  "settings.workspace_updated": "Workspace details updated", "user.invited": "Team member invited", "user.role_changed": "Role changed", "user.removed": "Team member removed",
  "user.invite_accepted": "Invitation accepted", "login": "Signed in", "workspace.created": "Workspace created", "module.disabled": "Module turned off", "module.enabled": "Module turned on",
  "admin.impersonation_started": "Super admin signed in as workspace", "admin.impersonation_ended": "Super admin left workspace", "reports.exported": "Report exported", "gstr1.exported": "GSTR-1 data exported",
};
const describeAction = (a) => html`${ACTION_TEXT[a.action] ?? a.action}${a.detail ? html` <span class="muted">· ${a.detail}</span>` : ""}`;

// ---------- Invoices ----------
page(/^invoices$/, "invoices", () => {
  const q = query();
  const filter = q.status ?? "all";
  const tabs = ["all", "unpaid", "overdue", "paid", "draft"];
  return html`
    ${head("Invoices", "GST tax invoices with PDF, e-invoice IRN and email.", html`<a class="btn primary" href="#/invoices/new">New invoice</a>`)}
    <nav class="tabs" aria-label="Filter invoices">${tabs.map((t) => html`<a href="#/invoices?status=${t}" ${filter === t ? raw('aria-current="page"') : ""}>${t[0].toUpperCase() + t.slice(1)}</a>`)}</nav>
    <div style="margin-bottom:12px;max-width:340px"><label class="sr-only" for="inv-search">Search invoices</label><input id="inv-search" data-live="inv-search" type="search" placeholder="Search by number or client" value="${ui.invSearch}"></div>
    <div id="inv-table">${invoiceTable(filter)}</div>`;
});
function invoiceTable(filter) {
  const s = ui.invSearch.trim().toLowerCase();
  const rows = state.invoices
    .filter((i) => {
      const st = L.invoiceStatus(state, i, TODAY);
      if (filter === "unpaid" && !["unpaid", "part-paid", "overdue"].includes(st)) return false;
      if (filter !== "all" && filter !== "unpaid" && st !== filter) return false;
      return !s || i.no.toLowerCase().includes(s) || client(i.clientId).name.toLowerCase().includes(s);
    })
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));
  if (!rows.length) return html`<div class="card empty">No invoices match.</div>`;
  return html`<div class="table-wrap"><table class="t"><thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
    <tbody>${rows.map((i) => html`<tr><td><a href="#/invoices/${i.id}">${i.status === "draft" ? "Draft" : i.no}</a>${i.irn ? html` <span class="badge brand" title="E-invoice IRN generated">IRN</span>` : ""}</td><td>${client(i.clientId).name}</td><td>${fmtDate(i.date)}</td><td>${fmtDate(i.due)}</td><td class="num">${inr(i.totals.total)}</td><td class="num">${i.status === "draft" ? "—" : inr(outstanding(i))}</td><td>${statusBadge(i)}</td></tr>`)}</tbody></table></div>`;
}

function blankLine() {
  return { itemId: "", name: "", hsn: "", qty: 1, rate: 0, gstRate: 18, unit: "pcs" };
}
page(/^invoices\/new$/, "invoices", () => {
  if (!ui.inv || ui.inv.editing) ui.inv = { editing: null, clientId: state.clients[0].id, date: TODAY, dueDays: 30, notes: "", lines: [blankLine()] };
  return invoiceForm();
});
page(/^invoices\/([^/]+)\/edit$/, "invoices", (id) => {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv || inv.status !== "draft") return html`<div class="card empty">Only draft invoices can be edited. <a href="#/invoices">Back to invoices</a></div>`;
  if (!ui.inv || ui.inv.editing !== id) ui.inv = { editing: id, clientId: inv.clientId, date: inv.date, dueDays: Math.round((Date.parse(inv.due) - Date.parse(inv.date)) / 86_400_000), notes: inv.notes, lines: structuredClone(inv.lines) };
  return invoiceForm();
});
function invoiceForm() {
  const f = ui.inv;
  const c = client(f.clientId);
  const inter = c.state !== state.tenant.state;
  return html`
    ${head(f.editing ? "Edit draft invoice" : "New invoice", "Start typing an item name: saved items fill in HSN, rate and GST for you.")}
    <form class="card form" data-form="invoice" novalidate>
      <div class="form-row">
        <label class="f">Client
          <select name="clientId" data-live="inv">${state.clients.map((x) => html`<option value="${x.id}" ${sel(x.id === f.clientId)}>${x.name}</option>`)}</select>
          <span class="hint" id="pos-hint">${c.gstin ? `GSTIN ${c.gstin}` : "Unregistered (B2C)"} · Place of supply ${stateName(c.state)} · ${inter ? "IGST" : "CGST + SGST"}</span></label>
        <label class="f">Invoice date <input type="date" name="date" value="${f.date}" required data-live="inv"></label>
        <label class="f">Payment terms
          <select name="dueDays" data-live="inv">${[0, 15, 30, 45, 60].map((d) => html`<option value="${d}" ${sel(Number(f.dueDays) === d)}>${d ? `Net ${d} days` : "Due on receipt"}</option>`)}</select></label>
      </div>
      <datalist id="item-list">${state.items.map((i) => html`<option value="${i.name}"></option>`)}</datalist>
      <div class="table-wrap"><table class="t lines" aria-label="Invoice lines"><thead><tr><th style="min-width:210px">Item</th><th>HSN/SAC</th><th style="width:90px">Qty</th><th style="width:120px">Rate (₹)</th><th style="width:90px">GST</th><th class="num">Amount</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${f.lines.map((l, i) => html`<tr data-line="${i}">
          <td><input name="name" list="item-list" value="${l.name}" aria-label="Item ${i + 1}" data-live="inv" autocomplete="off"></td>
          <td><input name="hsn" value="${l.hsn}" aria-label="HSN/SAC ${i + 1}" data-live="inv" inputmode="numeric" style="width:100px"></td>
          <td><input name="qty" type="number" min="0" step="any" value="${l.qty}" aria-label="Quantity ${i + 1}" data-live="inv"></td>
          <td><input name="rate" type="number" min="0" step="0.01" value="${l.rate ? rupees(l.rate) : ""}" aria-label="Rate ${i + 1}" data-live="inv"></td>
          <td><select name="gstRate" aria-label="GST rate ${i + 1}" data-live="inv">${L.GST_RATES.map((r) => html`<option value="${r}" ${sel(Number(l.gstRate) === r)}>${r}%</option>`)}</select></td>
          <td class="num" data-amount="${i}">${inr(Math.round(Number(l.qty) * l.rate))}</td>
          <td><button type="button" class="btn small danger" data-act="inv-remove-line" data-i="${i}" ${f.lines.length === 1 ? raw("disabled") : ""} aria-label="Remove line ${i + 1}">✕</button></td></tr>`)}</tbody></table></div>
      <div><button type="button" class="btn small" data-act="inv-add-line">+ Add line</button></div>
      <div class="totals" id="inv-totals">${totalsBlock(L.invoiceTotals(f.lines.filter((l) => l.rate > 0), inter), inter)}</div>
      <label class="f">Notes on the invoice <span class="hint">Optional, e.g. bank details or delivery terms</span><textarea name="notes" rows="2" data-live="inv">${f.notes}</textarea></label>
      <p class="err" id="inv-err" role="alert"></p>
      <div class="actions"><button class="btn primary" name="mode" value="issue">Save &amp; issue</button><button class="btn" name="mode" value="draft">Save as draft</button><a class="btn" href="#/invoices">Cancel</a></div>
    </form>`;
}
function totalsBlock(t, inter) {
  return html`<div><span>Taxable value</span><span class="num">${inr(t.taxable)}</span></div>
    ${inter ? html`<div><span>IGST</span><span class="num">${inr(t.igst)}</span></div>` : html`<div><span>CGST</span><span class="num">${inr(t.cgst)}</span></div><div><span>SGST</span><span class="num">${inr(t.sgst)}</span></div>`}
    <div class="grand"><span>Invoice total</span><span class="num">${inr(t.total)}</span></div>`;
}
function readInvoiceForm(form) {
  const f = ui.inv;
  f.clientId = form.clientId.value;
  f.date = form.date.value;
  f.dueDays = Number(form.dueDays.value);
  f.notes = form.notes.value;
  form.querySelectorAll("tr[data-line]").forEach((tr) => {
    const i = Number(tr.dataset.line);
    const l = f.lines[i];
    const name = tr.querySelector('[name="name"]').value;
    const item = state.items.find((x) => x.name === name);
    if (item && l.itemId !== item.id) {
      Object.assign(l, { itemId: item.id, hsn: item.hsn, rate: item.price, gstRate: item.gstRate, unit: item.unit });
      tr.querySelector('[name="hsn"]').value = item.hsn;
      tr.querySelector('[name="rate"]').value = rupees(item.price);
      tr.querySelector('[name="gstRate"]').value = item.gstRate;
    } else {
      if (!item) l.itemId = "";
      l.hsn = tr.querySelector('[name="hsn"]').value.trim();
      l.rate = L.toPaise(tr.querySelector('[name="rate"]').value || 0);
      l.gstRate = Number(tr.querySelector('[name="gstRate"]').value);
    }
    l.name = name.trim();
    l.qty = Number(tr.querySelector('[name="qty"]').value || 0);
    tr.querySelector(`[data-amount="${i}"]`).textContent = inr(Math.round(l.qty * l.rate));
  });
  const c = client(f.clientId);
  const inter = c.state !== state.tenant.state;
  document.getElementById("pos-hint").textContent = `${c.gstin ? `GSTIN ${c.gstin}` : "Unregistered (B2C)"} · Place of supply ${stateName(c.state)} · ${inter ? "IGST" : "CGST + SGST"}`;
  document.getElementById("inv-totals").innerHTML = String(totalsBlock(L.invoiceTotals(f.lines.filter((l) => l.rate > 0), inter), inter));
}

page(/^invoices\/([^/]+)$/, "invoices", (id) => {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return html`<div class="card empty">Invoice not found. <a href="#/invoices">Back to invoices</a></div>`;
  const c = client(inv.clientId);
  const t = state.tenant;
  const inter = inv.totals.igst > 0 || c.state !== t.state;
  const payments = state.payments.filter((p) => p.invoiceId === id);
  const draft = inv.status === "draft";
  return html`
    ${head(draft ? "Draft invoice" : inv.no, html`${statusBadge(inv)} ${inv.emailedAt ? html`<span class="muted"> · Emailed ${fmtTime(inv.emailedAt)}</span>` : ""}`,
      draft
        ? html`<a class="btn" href="#/invoices/${id}/edit">Edit</a><button class="btn danger" data-act="inv-delete" data-id="${id}">Delete draft</button><button class="btn primary" data-act="inv-issue" data-id="${id}">Issue invoice</button>`
        : html`${c.gstin && !inv.irn ? html`<button class="btn" data-act="inv-irn" data-id="${id}">Generate IRN</button>` : ""}<button class="btn" data-act="print">Download PDF</button><button class="btn" data-act="inv-email" data-id="${id}">Email</button>${outstanding(inv) > 0 ? html`<button class="btn primary" data-act="inv-pay" data-id="${id}">Record payment</button>` : ""}`)}
    <article class="doc" style="font-family:var(--font-body)">
      <div class="doc-head">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div class="ws-logo" style="width:48px;height:48px;font-size:17px" aria-hidden="true">${t.brand.logo ? html`<img src="${t.brand.logo}" alt="">` : t.brand.initials}</div>
          <div><div style="font-weight:700;font-size:16px">${t.name}</div><div class="muted">${t.address}</div><div class="muted">GSTIN ${t.gstin}</div></div>
        </div>
        <div><div class="doc-title">${draft ? "DRAFT INVOICE" : "TAX INVOICE"}</div>
          <div style="text-align:right" class="muted">${draft ? "Not yet numbered" : html`No. <strong style="color:var(--fg)">${inv.no}</strong>`}<br>Date ${fmtDate(inv.date)} · Due ${fmtDate(inv.due)}</div></div>
      </div>
      <div class="parties">
        <div><div class="label">Bill to</div><strong>${c.name}</strong><br>${c.city}, ${stateName(c.state)}<br>${c.gstin ? `GSTIN ${c.gstin}` : "Unregistered buyer"}</div>
        <div><div class="label">Place of supply</div>${stateName(inv.placeOfSupply)} (${inv.placeOfSupply})<br><span class="muted">${inter ? "Inter-state supply: IGST" : "Intra-state supply: CGST + SGST"}</span></div>
        ${inv.irn ? html`<div><div class="label">E-invoice IRN</div><div class="irn">${inv.irn}</div><div class="faint" style="font-size:11.5px;margin-top:4px">Demo IRN: not registered with the GST portal.</div></div>` : ""}
      </div>
      <div class="table-wrap" style="border-radius:8px"><table class="t"><thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST</th></tr></thead>
        <tbody>${inv.lines.map((l, i) => html`<tr><td>${i + 1}</td><td>${l.name}</td><td>${l.hsn}</td><td class="num">${l.qty} ${l.unit ?? ""}</td><td class="num">${inr(l.rate)}</td><td class="num">${inr(Math.round(l.qty * l.rate))}</td><td class="num">${l.gstRate}%</td></tr>`)}</tbody></table></div>
      <div class="totals" style="margin-top:14px">${totalsBlock(inv.totals, inter)}${!draft && payments.length ? html`<div><span>Received</span><span class="num">${inr(-L.amountPaid(state, id))}</span></div><div class="grand"><span>Balance due</span><span class="num">${inr(outstanding(inv))}</span></div>` : ""}</div>
      ${inv.notes ? html`<p class="muted" style="margin-top:14px;white-space:pre-wrap">${inv.notes}</p>` : ""}
      <p class="faint" style="margin-top:18px;font-size:12px">Sample invoice generated by the Avyntro demo.</p>
    </article>
    ${payments.length ? html`<section class="card no-print" style="margin-top:16px"><h2 style="margin-bottom:8px">Payments</h2><ul class="list">${payments.map((p) => html`<li><span>${fmtDate(p.date)} · ${p.mode}${p.ref ? html` <span class="faint">· ${p.ref}</span>` : ""}</span><strong class="num">${inr(p.amount)}</strong></li>`)}</ul></section>` : ""}`;
});

// ---------- Items ----------
page(/^items$/, "items", () => html`
  ${head("Item master", "Save products and services once; they autocomplete on every invoice.", html`<a class="btn" href="#/items/import">Import catalogue</a><button class="btn primary" data-act="item-edit" data-id="">Add item</button>`)}
  <div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th>HSN/SAC</th><th>Unit</th><th class="num">GST</th><th class="num">Price</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${state.items.map((i) => html`<tr><td>${i.name}</td><td class="mono">${i.hsn}</td><td>${i.unit}</td><td class="num">${i.gstRate}%</td><td class="num">${inr(i.price)}</td><td><button class="linkbtn" data-act="item-edit" data-id="${i.id}">Edit</button></td></tr>`)}</tbody></table></div>`, "items");

page(/^items\/import$/, "items", () => {
  const rows = ui.importRows;
  return html`
    ${head("Import a catalogue", "Upload your product list as a PDF or Word file. You review every row before anything is saved.", html`<a class="btn" href="#/items">Back to items</a>`)}
    ${!rows
      ? html`<section class="card form">
          <h2>1. Upload your catalogue</h2>
          <label class="f">Catalogue file <span class="hint">PDF, Word (.docx), or a text/CSV list with name, HSN, price and GST%</span>
            <input type="file" accept=".pdf,.doc,.docx,.txt,.csv" data-live="catalogue-file"></label>
          <div class="actions"><span class="muted">No file handy?</span><button class="btn" data-act="catalogue-sample">Use a sample catalogue</button></div>
          <p class="callout warn">In this demo, PDF and Word files are replaced by a sample catalogue so you can try the review step; the real Avyntro reads the products out of your file. Text and CSV files are read as-is.</p>
        </section>`
      : html`<section class="card">
          <div class="card-head"><h2>2. Review before importing</h2><span class="muted">${ui.importNote}</span></div>
          <p class="muted" style="margin-bottom:12px">Fix anything flagged, untick rows you don't want, then import. Rows with problems can't be imported until they're fixed.</p>
          <div class="table-wrap"><table class="t lines"><thead><tr><th>Import</th><th style="min-width:200px">Name</th><th>HSN/SAC</th><th>Price (₹)</th><th>GST %</th><th>Check</th></tr></thead>
          <tbody>${rows.map((r, i) => html`<tr data-row="${i}">
            <td><input type="checkbox" name="include" aria-label="Import ${r.name}" ${chk(r.include)} ${r.issues.length ? raw("disabled") : ""} data-live="import-row"></td>
            <td><input name="name" value="${r.name}" aria-label="Name" data-live="import-row"></td>
            <td><input name="hsn" value="${r.hsn}" aria-label="HSN" style="width:100px" data-live="import-row"></td>
            <td><input name="price" type="number" step="0.01" value="${r.price}" aria-label="Price" style="width:110px" data-live="import-row"></td>
            <td><select name="gstRate" aria-label="GST rate" data-live="import-row">${[...new Set([...L.GST_RATES, r.gstRate])].map((g) => html`<option value="${g}" ${sel(g === r.gstRate)}>${g}%</option>`)}</select></td>
            <td>${r.issues.length ? html`<span class="badge bad">${r.issues[0]}</span>` : html`<span class="badge ok">Ready</span>`}</td></tr>`)}</tbody></table></div>
          <div class="actions" style="margin-top:14px"><button class="btn primary" data-act="catalogue-import">Import ${rows.filter((r) => r.include && !r.issues.length).length} items</button><button class="btn" data-act="catalogue-cancel">Start over</button></div>
        </section>`}`;
}, "items");

// ---------- Clients ----------
page(/^clients$/, "clients", () => html`
  ${head("Clients", "Client records with interaction history, next to their invoices.", html`<button class="btn primary" data-act="client-add">Add client</button>`)}
  <div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>GSTIN</th><th>State</th><th class="num">Outstanding</th><th>Last interaction</th></tr></thead>
  <tbody>${state.clients.map((c) => {
    const due = state.invoices.filter((i) => i.clientId === c.id && i.status !== "draft").reduce((s, i) => s + outstanding(i), 0);
    const last = [...c.interactions].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return html`<tr><td><a href="#/clients/${c.id}">${c.name}</a><br><span class="faint" style="font-size:12.5px">${c.contact}</span></td><td class="mono">${c.gstin || "—"}</td><td>${stateName(c.state)}</td><td class="num">${inr(due)}</td><td>${last ? html`${fmtDate(last.date)} <span class="faint">· ${last.type}</span>` : "—"}</td></tr>`;
  })}</tbody></table></div>`, "clients");

page(/^clients\/([^/]+)$/, "clients", (id) => {
  const c = client(id);
  if (!c) return html`<div class="card empty">Client not found.</div>`;
  const invs = state.invoices.filter((i) => i.clientId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const due = invs.filter((i) => i.status !== "draft").reduce((s, i) => s + outstanding(i), 0);
  return html`
    ${head(c.name, html`${c.gstin ? `GSTIN ${c.gstin}` : "Unregistered (B2C)"} · ${c.city}, ${stateName(c.state)}`, html`<a class="btn" href="#/clients">All clients</a><a class="btn primary" href="#/invoices/new" data-act="inv-for-client" data-id="${id}">New invoice</a>`)}
    <div class="tiles"><div class="tile"><div class="label">Outstanding</div><div class="value">${inr(due)}</div></div><div class="tile"><div class="label">Invoices</div><div class="value">${invs.filter((i) => i.status !== "draft").length}</div></div><div class="tile"><div class="label">Contact</div><div style="margin-top:4px">${c.contact}<br><span class="muted">${c.email || "No email"} · ${c.phone}</span></div></div></div>
    <div class="grid two">
      <section class="card"><h2 style="margin-bottom:12px">Interaction history</h2>
        <form class="form" data-form="interaction" data-id="${id}" style="margin-bottom:16px">
          <div class="form-row"><label class="f">Type <select name="type">${["Call", "Meeting", "Email", "WhatsApp", "Site visit"].map((t) => html`<option>${t}</option>`)}</select></label><label class="f">Date <input type="date" name="date" value="${TODAY}" max="${TODAY}" required></label></div>
          <label class="f">What happened <textarea name="note" rows="2" required maxlength="500"></textarea></label>
          <div><button class="btn primary small">Log interaction</button></div>
        </form>
        ${c.interactions.length ? html`<ol class="timeline">${[...c.interactions].sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => html`<li><strong>${x.type}</strong> <span class="faint">· ${fmtDate(x.date)}</span><br>${x.note}</li>`)}</ol>` : html`<p class="empty">No interactions logged yet.</p>`}
      </section>
      <section class="card"><h2 style="margin-bottom:8px">Invoices</h2>
        ${invs.length ? html`<ul class="list">${invs.map((i) => html`<li><span><a href="#/invoices/${i.id}">${i.status === "draft" ? "Draft" : i.no}</a> <span class="faint">· ${fmtDate(i.date)}</span></span><span>${inr(i.totals.total)} ${statusBadge(i)}</span></li>`)}</ul>` : html`<p class="empty">No invoices yet.</p>`}
      </section>
    </div>`;
}, "clients");

// ---------- GST ----------
page(/^gst$/, "gst", () => {
  const q = query();
  const tab = ["gstr1", "liability", "notices", "gstins"].includes(q.tab) ? q.tab : "gstr1";
  const labels = { gstr1: "GSTR-1 data", liability: "Liability", notices: "Notices", gstins: "GSTINs" };
  return html`
    ${head("GST compliance", "Built from the invoices and bills already in your books.")}
    <nav class="tabs" aria-label="GST sections">${Object.entries(labels).map(([k, v]) => html`<a href="#/gst?tab=${k}" ${tab === k ? raw('aria-current="page"') : ""}>${v}</a>`)}</nav>
    ${tab === "gstr1" ? gstr1View(q.month) : tab === "liability" ? liabilityView() : tab === "notices" ? noticesView() : gstinsView()}`;
}, "gst");

function gstr1View(monthParam) {
  const months = lastMonths(6);
  const month = months.includes(monthParam) ? monthParam : months[months.length - 2];
  const r = L.gstr1(state, month);
  const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0);
  return html`
    <div class="actions" style="margin-bottom:14px"><label class="check">Return period
      <select data-live="gstr1-month">${months.map((m) => html`<option value="${m}" ${sel(m === month)}>${fmtMonth(m)}</option>`)}</select></label>
      <span class="spacer" style="flex:1"></span><button class="btn" data-act="gstr1-export" data-month="${month}">Export JSON</button></div>
    <div class="tiles">
      <div class="tile"><div class="label">Invoices in period</div><div class="value">${r.count}</div></div>
      <div class="tile"><div class="label">B2B taxable value</div><div class="value">${inr(sum(r.b2b, "taxable"))}</div></div>
      <div class="tile"><div class="label">B2C taxable value</div><div class="value">${inr(sum(r.b2cs, "taxable"))}</div></div>
      <div class="tile"><div class="label">Tax on outward supplies</div><div class="value">${inr(sum(r.b2b, "cgst") + sum(r.b2b, "sgst") + sum(r.b2b, "igst") + sum(r.b2cs, "cgst") + sum(r.b2cs, "sgst") + sum(r.b2cs, "igst"))}</div></div>
    </div>
    <section class="card"><h2 style="margin-bottom:8px">B2B invoices (table 4A)</h2>
      ${r.b2b.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Recipient GSTIN</th><th>Invoice</th><th>Date</th><th>POS</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead>
        <tbody>${r.b2b.map((x) => html`<tr><td class="mono">${x.gstin}<br><span class="faint" style="font-family:var(--font-body)">${x.name}</span></td><td>${x.invoiceNo}</td><td>${fmtDate(x.date)}</td><td>${x.pos}</td><td class="num">${x.rate}%</td><td class="num">${inr(x.taxable)}</td><td class="num">${inr(x.igst)}</td><td class="num">${inr(x.cgst)}</td><td class="num">${inr(x.sgst)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No B2B invoices in this period.</p>`}
    </section>
    <div class="grid two" style="margin-top:16px">
      <section class="card"><h2 style="margin-bottom:8px">B2C small (table 7)</h2>
        ${r.b2cs.length ? html`<table class="t"><thead><tr><th>POS</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">Tax</th></tr></thead><tbody>${r.b2cs.map((x) => html`<tr><td>${stateName(x.pos)}</td><td class="num">${x.rate}%</td><td class="num">${inr(x.taxable)}</td><td class="num">${inr(x.cgst + x.sgst + x.igst)}</td></tr>`)}</tbody></table>` : html`<p class="empty">No B2C sales in this period.</p>`}
      </section>
      <section class="card"><h2 style="margin-bottom:8px">HSN summary (table 12)</h2>
        <table class="t"><thead><tr><th>HSN/SAC</th><th class="num">Qty</th><th class="num">Taxable</th><th class="num">Tax</th></tr></thead><tbody>${r.hsn.map((x) => html`<tr><td><span class="mono">${x.hsn}</span> <span class="faint">${x.rate}%</span></td><td class="num">${x.qty}</td><td class="num">${inr(x.taxable)}</td><td class="num">${inr(x.tax)}</td></tr>`)}</tbody></table>
      </section>
    </div>`;
}

function liabilityView() {
  const months = lastMonths(6).reverse();
  const rows = months.map((m) => ({ m, ...L.gstLiability(state.journals, m) }));
  const cur = rows[0];
  return html`
    <div class="tiles">
      <div class="tile"><div class="label">Output tax · ${fmtMonth(cur.m)}</div><div class="value">${inr(cur.totalOutput)}</div></div>
      <div class="tile"><div class="label">Input tax credit</div><div class="value">${inr(cur.totalInput)}</div></div>
      <div class="tile"><div class="label">${cur.net >= 0 ? "Net payable" : "Credit carried forward"}</div><div class="value">${inr(Math.abs(cur.net))}</div><div class="note">GSTR-3B due ${fmtDate(cur.dueDate)}</div></div>
    </div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Period</th><th class="num">Output CGST</th><th class="num">Output SGST</th><th class="num">Output IGST</th><th class="num">Input credit</th><th class="num">Net payable</th><th>3B due</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><td>${fmtMonth(r.m)}</td><td class="num">${inr(r.output.cgst)}</td><td class="num">${inr(r.output.sgst)}</td><td class="num">${inr(r.output.igst)}</td><td class="num">${inr(r.totalInput)}</td><td class="num"><strong>${inr(r.net)}</strong></td><td>${fmtDate(r.dueDate)}</td></tr>`)}</tbody></table></div>
    <p class="muted" style="margin-top:10px;font-size:13px">Calculated from the ledger: output tax on sales minus input tax on purchase bills, before any carried-forward credit.</p>`;
}

const NOTICE_STATUSES = ["Open", "Reply drafted", "Replied", "Closed"];
function noticesView() {
  return html`
    <div class="table-wrap"><table class="t"><thead><tr><th>Form</th><th>Subject</th><th>GSTIN</th><th>Issued</th><th>Reply by</th><th>Status</th></tr></thead>
    <tbody>${state.notices.map((n) => {
      const late = n.status !== "Closed" && n.status !== "Replied" && n.due < TODAY;
      const soon = !late && n.status !== "Closed" && n.status !== "Replied" && n.due <= L.addDays(TODAY, 10);
      return html`<tr><td><strong>${n.form}</strong></td><td>${n.subject}</td><td class="mono">${n.gstin}</td><td>${fmtDate(n.issued)}</td><td>${fmtDate(n.due)} ${late ? html`<span class="badge bad">Past due</span>` : soon ? html`<span class="badge warn">Soon</span>` : ""}</td>
        <td><label class="sr-only" for="ns-${n.id}">Status</label><select id="ns-${n.id}" data-live="notice-status" data-id="${n.id}">${NOTICE_STATUSES.map((s) => html`<option ${sel(s === n.status)}>${s}</option>`)}</select></td></tr>`;
    })}</tbody></table></div>
    <section class="card" style="margin-top:16px"><h2 style="margin-bottom:12px">Record a new notice</h2>
      <form class="form" data-form="notice"><div class="form-row">
        <label class="f">Form <input name="form" required placeholder="e.g. ASMT-10" maxlength="20"></label>
        <label class="f">GSTIN <select name="gstin">${state.gstins.map((g) => html`<option value="${g.gstin}">${g.gstin} (${stateName(g.state)})</option>`)}</select></label>
        <label class="f">Issued <input type="date" name="issued" value="${TODAY}" required></label>
        <label class="f">Reply by <input type="date" name="due" value="${L.addDays(TODAY, 15)}" required></label></div>
        <label class="f">Subject <input name="subject" required maxlength="160"></label>
        <div><button class="btn primary">Add notice</button></div></form></section>`;
}

function gstinsView() {
  return html`
    <div class="table-wrap"><table class="t"><thead><tr><th>GSTIN</th><th>State</th><th>Label</th><th></th></tr></thead>
    <tbody>${state.gstins.map((g) => html`<tr><td class="mono">${g.gstin}</td><td>${stateName(g.state)}</td><td>${g.label}</td><td>${g.primary ? html`<span class="badge brand">Primary</span>` : html`<button class="linkbtn" data-act="gstin-primary" data-gstin="${g.gstin}">Make primary</button>`}</td></tr>`)}</tbody></table></div>
    <section class="card" style="margin-top:16px"><h2 style="margin-bottom:12px">Add a GSTIN</h2>
      <form class="form" data-form="gstin" novalidate><div class="form-row">
        <label class="f">GSTIN <input name="gstin" required maxlength="15" style="text-transform:uppercase" placeholder="15 characters" autocomplete="off"><span class="hint">Checked for format and check digit. Try your own business's GSTIN.</span></label>
        <label class="f">Label <input name="label" required maxlength="80" placeholder="e.g. Pune warehouse"></label></div>
        <p class="err" id="gstin-err" role="alert"></p>
        <div><button class="btn primary">Add GSTIN</button></div></form></section>`;
}

// ---------- Bank reconciliation ----------
page(/^bank$/, "bank", () => html`
  ${head("Bank reconciliation", "Upload a statement; Avyntro matches each line to your books and you approve the session.")}
  <section class="card form">
    <h2>Upload a statement</h2>
    <label class="f">Statement file (CSV) <span class="hint">Columns: date (YYYY-MM-DD), description, amount (money in positive, money out negative)</span>
      <input type="file" accept=".csv,text/csv" data-live="statement-file"></label>
    <div class="actions"><span class="muted">Or try it with</span><button class="btn" data-act="statement-sample">this month's sample HDFC statement</button></div>
  </section>
  <section class="card"><h2 style="margin-bottom:8px">Reconciliation sessions</h2>
    ${state.bankSessions.length
      ? html`<ul class="list">${state.bankSessions.map((s) => html`<li><span><a href="#/bank/${s.id}">${s.fileName}</a> <span class="faint">· uploaded ${fmtTime(s.uploadedAt)}</span></span><span>${s.lines.length} lines ${s.status === "approved" ? html`<span class="badge ok">Approved</span>` : html`<span class="badge warn">Awaiting review</span>`}</span></li>`)}</ul>`
      : html`<p class="empty">No statements uploaded yet.</p>`}
  </section>`, "bank");

const BANK_ACCOUNTS_IN = ["4100", "3000", "2200"];
const BANK_ACCOUNTS_OUT = ["5500", "5400", "5300", "5200", "5000", "5100", "2000"];
page(/^bank\/([^/]+)$/, "bank", (id) => {
  const s = state.bankSessions.find((x) => x.id === id);
  if (!s) return html`<div class="card empty">Session not found.</div>`;
  const review = s.status === "review";
  const matched = s.lines.filter((l) => l.match && !l.ignored).length;
  const toCreate = s.lines.filter((l) => !l.match && l.newAccount && !l.ignored).length;
  const open = s.lines.filter((l) => !l.match && !l.newAccount && !l.ignored).length;
  return html`
    ${head(s.fileName, review ? "Check the suggested matches, decide what to do with the rest, then approve." : html`Approved by ${s.approvedBy} on ${fmtTime(s.approvedAt)}.`, html`<a class="btn" href="#/bank">All sessions</a>`)}
    <div class="tiles"><div class="tile"><div class="label">Matched</div><div class="value">${matched}</div></div><div class="tile"><div class="label">New entries to create</div><div class="value">${toCreate}</div></div><div class="tile"><div class="label">Still unmatched</div><div class="value">${open}</div><div class="note">Left unreconciled for later</div></div></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Match in your books</th>${review ? html`<th><span class="sr-only">Ignore</span></th>` : ""}</tr></thead>
    <tbody>${s.lines.map((l, i) => html`<tr ${l.ignored ? raw('style="opacity:.5"') : ""}>
      <td>${fmtDate(l.date)}</td><td>${l.description}</td><td class="num ${l.amount < 0 ? "neg" : ""}">${inr(l.amount, { sign: true })}</td>
      <td>${l.match
        ? html`${l.match.label} <span class="badge ${l.match.confidence === "high" ? "ok" : "warn"}">${l.match.confidence} confidence</span>${l.match.kind === "invoice" ? html`<br><span class="faint" style="font-size:12.5px">Approving records this receipt against the invoice</span>` : ""}`
        : review
          ? html`<label class="sr-only" for="na-${i}">Create entry for line ${i + 1}</label><select id="na-${i}" data-live="bank-account" data-session="${id}" data-i="${i}" ${l.ignored ? raw("disabled") : ""}><option value="">No match: choose an account to create an entry…</option>${(l.amount > 0 ? BANK_ACCOUNTS_IN : BANK_ACCOUNTS_OUT).map((a) => html`<option value="${a}" ${sel(l.newAccount === a)}>${L.accountName(a)}</option>`)}</select>`
          : l.newAccount ? html`New entry: ${L.accountName(l.newAccount)}` : html`<span class="faint">Not reconciled</span>`}</td>
      ${review ? html`<td><button class="btn small" data-act="bank-ignore" data-session="${id}" data-i="${i}">${l.ignored ? "Undo" : "Ignore"}</button></td>` : ""}</tr>`)}</tbody></table></div>
    ${review ? html`<div class="actions" style="margin-top:14px"><button class="btn primary" data-act="bank-approve" data-session="${id}">Approve session</button><span class="muted">${open ? `${open} unmatched line${open === 1 ? "" : "s"} will stay unreconciled.` : "Everything is accounted for."}</span></div>` : ""}`;
}, "bank");

// ---------- Journal ----------
page(/^journal$/, "journal", () => {
  const q = query();
  const src = ["all", "manual", "invoice", "payment", "expense", "bank", "reversal"].includes(q.source) ? q.source : "all";
  let rows = state.journals.filter((j) => src === "all" || j.source === src).sort((a, b) => (a.date === b.date ? (a.no < b.no ? 1 : -1) : a.date < b.date ? 1 : -1));
  const total = rows.length;
  if (!ui.journalAll) rows = rows.slice(0, 60);
  return html`
    ${head("Journal entries", "Every module posts here. Entries must balance; mistakes are corrected by reversal, never edited.", html`<a class="btn" href="#/reports?tab=tb">Trial balance</a><a class="btn primary" href="#/journal/new">New entry</a>`)}
    <nav class="tabs" aria-label="Filter by source">${["all", "manual", "invoice", "payment", "expense", "bank", "reversal"].map((t) => html`<a href="#/journal?source=${t}" ${src === t ? raw('aria-current="page"') : ""}>${t[0].toUpperCase() + t.slice(1)}</a>`)}</nav>
    <div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>No.</th><th>Narration</th><th>Lines</th><th class="num">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows.map((j) => {
      const amt = j.lines.reduce((s, l) => s + l.debit, 0);
      return html`<tr><td>${fmtDate(j.date)}</td><td class="mono">${j.no}</td><td>${j.narration} ${j.reversedBy ? html`<span class="badge warn">Reversed</span>` : ""}${j.reversalOf ? html`<span class="badge">Reversal</span>` : ""}</td>
        <td style="font-size:12.5px">${j.lines.map((l) => html`<div>${L.accountName(l.account)} <span class="faint">${l.debit ? `Dr ${inr(l.debit)}` : `Cr ${inr(l.credit)}`}</span></div>`)}</td>
        <td class="num">${inr(amt)}</td><td>${!j.reversedBy && !j.reversalOf ? html`<button class="linkbtn" data-act="journal-reverse" data-id="${j.id}">Reverse</button>` : ""}</td></tr>`;
    })}</tbody></table></div>
    ${!ui.journalAll && total > 60 ? html`<div style="margin-top:12px"><button class="btn" data-act="journal-all">Show all ${total} entries</button></div>` : ""}`;
}, "accounting");

page(/^journal\/new$/, "journal", () => {
  if (!ui.journal) ui.journal = { date: TODAY, narration: "", lines: [{ account: "", debit: 0, credit: 0 }, { account: "", debit: 0, credit: 0 }] };
  const j = ui.journal;
  return html`
    ${head("New journal entry", "Debits must equal credits before you can post.")}
    <form class="card form" data-form="journal" novalidate>
      <div class="form-row"><label class="f">Date <input type="date" name="date" value="${j.date}" required></label><label class="f" style="grid-column:span 2">Narration <input name="narration" value="${j.narration}" required maxlength="160" placeholder="e.g. Bank charges for September"></label></div>
      <div class="table-wrap"><table class="t lines"><thead><tr><th style="min-width:240px">Account</th><th style="width:150px">Debit (₹)</th><th style="width:150px">Credit (₹)</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${j.lines.map((l, i) => html`<tr data-jline="${i}"><td><select name="account" aria-label="Account ${i + 1}" data-live="journal"><option value="">Choose account…</option>${L.ACCOUNTS.map((a) => html`<option value="${a.code}" ${sel(a.code === l.account)}>${a.code} · ${a.name}</option>`)}</select></td>
          <td><input name="debit" type="number" min="0" step="0.01" value="${l.debit ? rupees(l.debit) : ""}" aria-label="Debit ${i + 1}" data-live="journal"></td>
          <td><input name="credit" type="number" min="0" step="0.01" value="${l.credit ? rupees(l.credit) : ""}" aria-label="Credit ${i + 1}" data-live="journal"></td>
          <td><button type="button" class="btn small danger" data-act="journal-remove-line" data-i="${i}" ${j.lines.length <= 2 ? raw("disabled") : ""} aria-label="Remove line ${i + 1}">✕</button></td></tr>`)}</tbody>
        <tfoot><tr><td>Totals</td><td id="j-dr" class="num"></td><td id="j-cr" class="num"></td><td></td></tr></tfoot></table></div>
      <div><button type="button" class="btn small" data-act="journal-add-line">+ Add line</button></div>
      <p id="j-status" role="status"></p>
      <div class="actions"><button class="btn primary" id="j-post">Post entry</button><a class="btn" href="#/journal">Cancel</a></div>
    </form>`;
}, "accounting");

function readJournalForm(form) {
  const j = ui.journal;
  j.date = form.date.value;
  j.narration = form.narration.value;
  form.querySelectorAll("tr[data-jline]").forEach((tr) => {
    const l = j.lines[Number(tr.dataset.jline)];
    l.account = tr.querySelector('[name="account"]').value;
    l.debit = L.toPaise(tr.querySelector('[name="debit"]').value || 0);
    l.credit = L.toPaise(tr.querySelector('[name="credit"]').value || 0);
  });
  const dr = j.lines.reduce((s, l) => s + l.debit, 0);
  const cr = j.lines.reduce((s, l) => s + l.credit, 0);
  document.getElementById("j-dr").textContent = inr(dr);
  document.getElementById("j-cr").textContent = inr(cr);
  const problem = L.journalProblems(j.lines);
  const status = document.getElementById("j-status");
  status.className = problem ? "err" : "muted";
  status.textContent = problem ? problem : "Balanced: ready to post.";
  document.getElementById("j-post").disabled = !!problem;
}

// ---------- Reports ----------
page(/^reports$/, "reports", () => {
  const q = query();
  const tab = ["pl", "bs", "cf", "tb"].includes(q.tab) ? q.tab : "pl";
  const fy = L.financialYear(TODAY);
  const month = TODAY.slice(0, 7);
  const prev = lastMonths(2)[0];
  const periods = {
    fy: { label: `${fy.label} to date`, from: fy.start, to: TODAY },
    month: { label: `This month (${fmtMonth(month)})`, from: `${month}-01`, to: TODAY },
    last: { label: `Last month (${fmtMonth(prev)})`, from: `${prev}-01`, to: monthEnd(prev) },
    all: { label: "Since the books started", from: "0000-01-01", to: TODAY },
  };
  const pkey = periods[q.period] ? q.period : "fy";
  const p = periods[pkey];
  const labels = { pl: "Profit & loss", bs: "Balance sheet", cf: "Cash flow", tb: "Trial balance" };
  return html`
    ${head("Financial reports", "Straight from the double-entry ledger.", html`<button class="btn" data-act="report-export" data-tab="${tab}" data-period="${pkey}">Export CSV</button><button class="btn" data-act="print">Print / PDF</button>`)}
    <nav class="tabs" aria-label="Reports">${Object.entries(labels).map(([k, v]) => html`<a href="#/reports?tab=${k}&period=${pkey}" ${tab === k ? raw('aria-current="page"') : ""}>${v}</a>`)}</nav>
    <div class="actions" style="margin-bottom:14px"><label class="check">${tab === "bs" || tab === "tb" ? "As of the end of" : "Period"}
      <select data-live="report-period" data-tab="${tab}">${Object.entries(periods).map(([k, v]) => html`<option value="${k}" ${sel(k === pkey)}>${v.label}</option>`)}</select></label></div>
    <section class="card">${tab === "pl" ? plView(p) : tab === "bs" ? bsView(p) : tab === "cf" ? cfView(p) : tbView(p)}</section>`;
}, "accounting");

function reportData(tab, p) {
  if (tab === "pl") {
    const r = L.profitAndLoss(state.journals, p.from, p.to);
    return [["Section", "Account", "Amount"], ...r.income.map((x) => ["Income", x.name, rupees(x.amount)]), ["Income", "Total income", rupees(r.totalIncome)], ...r.expenses.map((x) => ["Expenses", x.name, rupees(x.amount)]), ["Expenses", "Total expenses", rupees(r.totalExpenses)], ["", "Net profit", rupees(r.net)]];
  }
  if (tab === "bs") {
    const r = L.balanceSheet(state.journals, p.to);
    return [["Section", "Account", "Amount"], ...r.assets.map((x) => ["Assets", x.name, rupees(x.amount)]), ["Assets", "Total assets", rupees(r.totalAssets)], ...r.liabilities.map((x) => ["Liabilities", x.name, rupees(x.amount)]), ...r.equity.map((x) => ["Equity", x.name, rupees(x.amount)]), ["", "Total liabilities & equity", rupees(r.totalLiabEquity)]];
  }
  if (tab === "cf") {
    const r = L.cashFlow(state.journals, p.from, p.to);
    return [["Section", "Date", "Narration", "Amount"], ["", "", "Opening cash & bank", rupees(r.opening)], ...["operating", "investing", "financing"].flatMap((k) => r.sections[k].map((x) => [k, x.date, x.narration, rupees(x.amount)])), ["", "", "Closing cash & bank", rupees(r.closing)]];
  }
  const r = L.trialBalance(state.journals, p.to);
  return [["Code", "Account", "Debit", "Credit"], ...r.rows.map((x) => [x.code, x.name, rupees(x.debit), rupees(x.credit)]), ["", "Totals", rupees(r.totalDebit), rupees(r.totalCredit)]];
}

function plView(p) {
  const r = L.profitAndLoss(state.journals, p.from, p.to);
  return html`<h2 style="margin-bottom:4px">Profit &amp; loss</h2><p class="muted" style="margin-bottom:12px">${fmtDate(p.from === "0000-01-01" ? state.journals[0].date : p.from)} to ${fmtDate(p.to)}</p>
    <table class="t"><tbody>
      <tr class="section"><td>Income</td><td class="num"></td></tr>${r.income.map((x) => html`<tr><td class="indent">${x.name}</td><td class="num">${inr(x.amount)}</td></tr>`)}<tr><td><strong>Total income</strong></td><td class="num"><strong>${inr(r.totalIncome)}</strong></td></tr>
      <tr class="section"><td>Expenses</td><td class="num"></td></tr>${r.expenses.map((x) => html`<tr><td class="indent">${x.name}</td><td class="num">${inr(x.amount)}</td></tr>`)}<tr><td><strong>Total expenses</strong></td><td class="num"><strong>${inr(r.totalExpenses)}</strong></td></tr>
    </tbody><tfoot><tr><td>${r.net >= 0 ? "Net profit" : "Net loss"}</td><td class="num ${r.net < 0 ? "neg" : ""}">${inr(r.net)}</td></tr></tfoot></table>`;
}
function bsView(p) {
  const r = L.balanceSheet(state.journals, p.to);
  const rows = (list) => list.map((x) => html`<tr><td class="indent">${x.name}</td><td class="num">${inr(x.amount)}</td></tr>`);
  return html`<h2 style="margin-bottom:4px">Balance sheet</h2><p class="muted" style="margin-bottom:12px">As of ${fmtDate(p.to)} ${r.balanced ? html`<span class="badge ok">Balanced</span>` : html`<span class="badge bad">Out of balance</span>`}</p>
    <div class="grid two"><table class="t"><tbody><tr class="section"><td>Assets</td><td></td></tr>${rows(r.assets)}</tbody><tfoot><tr><td>Total assets</td><td class="num">${inr(r.totalAssets)}</td></tr></tfoot></table>
    <table class="t"><tbody><tr class="section"><td>Liabilities</td><td></td></tr>${rows(r.liabilities)}<tr class="section"><td>Equity</td><td></td></tr>${rows(r.equity)}</tbody><tfoot><tr><td>Total liabilities &amp; equity</td><td class="num">${inr(r.totalLiabEquity)}</td></tr></tfoot></table></div>`;
}
function cfView(p) {
  const r = L.cashFlow(state.journals, p.from, p.to);
  const names = { operating: "Operating activities", investing: "Investing activities", financing: "Financing activities" };
  return html`<h2 style="margin-bottom:4px">Cash flow (direct method)</h2><p class="muted" style="margin-bottom:12px">${fmtDate(p.from === "0000-01-01" ? state.journals[0].date : p.from)} to ${fmtDate(p.to)} · cash in hand and bank</p>
    <table class="t"><tbody><tr><td><strong>Opening cash &amp; bank</strong></td><td class="num"><strong>${inr(r.opening)}</strong></td></tr>
    ${["operating", "investing", "financing"].map((k) => {
      const ins = r.sections[k].filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
      const outs = r.sections[k].filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0);
      return html`<tr class="section"><td>${names[k]}</td><td></td></tr><tr><td class="indent">Cash received</td><td class="num">${inr(ins)}</td></tr><tr><td class="indent">Cash paid</td><td class="num">${inr(outs)}</td></tr><tr><td class="indent"><strong>Net cash from ${k}</strong></td><td class="num"><strong>${inr(r.totals[k])}</strong></td></tr>`;
    })}</tbody><tfoot><tr><td>Closing cash &amp; bank</td><td class="num">${inr(r.closing)}</td></tr></tfoot></table>`;
}
function tbView(p) {
  const r = L.trialBalance(state.journals, p.to);
  return html`<h2 style="margin-bottom:4px">Trial balance</h2><p class="muted" style="margin-bottom:12px">As of ${fmtDate(p.to)} ${r.balanced ? html`<span class="badge ok">Debits equal credits</span>` : html`<span class="badge bad">Out of balance</span>`}</p>
    <table class="t"><thead><tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${r.rows.map((x) => html`<tr><td class="mono">${x.code}</td><td>${x.name}</td><td class="num">${x.debit ? inr(x.debit) : ""}</td><td class="num">${x.credit ? inr(x.credit) : ""}</td></tr>`)}</tbody>
    <tfoot><tr><td></td><td>Totals</td><td class="num">${inr(r.totalDebit)}</td><td class="num">${inr(r.totalCredit)}</td></tr></tfoot></table>`;
}

// ---------- Settings (white-label) ----------
const BRAND_PRESETS = [["#0E6E63", "Avyntro teal"], ["#1D4ED8", "Royal blue"], ["#7C3AED", "Violet"], ["#B42318", "Brick red"], ["#B45309", "Saffron"], ["#1E2A33", "Charcoal"]];
const FONTS = ["Source Sans 3", "Inter", "Poppins", "Space Grotesk", "System"];
page(/^settings$/, "settings", () => {
  const t = state.tenant;
  return html`
    ${head("Branding & email", "White-label the workspace: your logo, colour and font on screens, invoices and emails.")}
    <form class="card form" data-form="branding">
      <h2>Branding</h2>
      <div class="form-row">
        <label class="f">Logo <span class="hint">PNG, JPG or SVG, up to 300 KB</span><input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" data-live="logo-file"></label>
        <label class="f">Initials (used when there's no logo) <input name="initials" value="${t.brand.initials}" maxlength="3" required data-live="brand"></label>
      </div>
      ${t.brand.logo ? html`<div><button type="button" class="btn small" data-act="logo-remove">Remove logo</button></div>` : ""}
      <fieldset style="border:0;padding:0;margin:0"><legend style="font-size:13px;font-weight:600;margin-bottom:6px">Brand colour</legend>
        <div class="actions">${BRAND_PRESETS.map(([c, n]) => html`<label class="check" title="${n}"><input type="radio" name="color" value="${c}" ${chk(t.brand.color.toLowerCase() === c.toLowerCase())} data-live="brand"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${c}"></span><span class="sr-only">${n}</span></label>`)}
          <label class="check">Custom <input type="color" name="custom" value="${t.brand.color}" data-live="brand" aria-label="Custom brand colour"></label></div></fieldset>
      <label class="f" style="max-width:280px">Font <select name="font" data-live="brand">${FONTS.map((f) => html`<option ${sel(f === t.brand.font)}>${f}</option>`)}</select></label>
      <p class="muted" style="font-size:13px">Changes preview live across the app. Save to keep them.</p>
      <div class="actions"><button class="btn primary">Save branding</button></div>
    </form>
    <form class="card form" data-form="smtp">
      <h2>Send invoice emails from your own server (SMTP)</h2>
      <p class="muted" style="font-size:13.5px">Invoices then arrive from your own address. Leave blank to use Avyntro's mail service.</p>
      <div class="form-row"><label class="f">SMTP host <input name="host" value="${t.smtp.host}" placeholder="smtp.gmail.com"></label><label class="f">Port <input name="port" value="${t.smtp.port}" inputmode="numeric" maxlength="5"></label></div>
      <div class="form-row"><label class="f">Username <input name="user" value="${t.smtp.user}" autocomplete="off"></label><label class="f">Password <input name="pass" type="password" placeholder="Not stored in the demo" autocomplete="new-password"></label><label class="f">From address <input name="from" type="email" value="${t.smtp.from}" placeholder="accounts@yourcompany.in"></label></div>
      <p class="err" id="smtp-err" role="alert"></p>
      <div class="actions"><button class="btn primary" name="mode" value="save">Save email settings</button><button class="btn" name="mode" value="test">Send test email</button></div>
    </form>
    <form class="card form" data-form="workspace">
      <h2>Workspace details</h2>
      <div class="form-row"><label class="f">Business name <input name="name" value="${t.name}" required maxlength="80"></label><label class="f">Invoice prefix <input name="prefix" value="${t.invoicePrefix}" required maxlength="6" pattern="[A-Za-z0-9]+" style="text-transform:uppercase"></label></div>
      <label class="f">Address on invoices <input name="address" value="${t.address}" required maxlength="160"></label>
      <div class="actions"><button class="btn primary">Save details</button></div>
    </form>`;
});

function applyBrand(brand = state.tenant.brand) {
  const r = document.documentElement.style;
  r.setProperty("--brand", brand.color);
  r.setProperty("--font-body", brand.font === "System" ? "system-ui, -apple-system, sans-serif" : `'${brand.font}', system-ui, sans-serif`);
}

// ---------- Team ----------
page(/^team$/, "team", () => html`
  ${head("Team", "Invite colleagues and give each a role. Roles decide what they can see and change.")}
  <div class="table-wrap"><table class="t"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${state.team.map((m) => html`<tr><td>${m.name || html`<span class="faint">Invitation pending</span>`}<br><span class="muted" style="font-size:12.5px">${m.email}</span></td>
    <td>${m.role === "Owner" ? "Owner" : html`<label class="sr-only" for="role-${m.id}">Role</label><select id="role-${m.id}" data-live="member-role" data-id="${m.id}">${Object.keys(S.ROLES).filter((r) => r !== "Owner").map((r) => html`<option ${sel(r === m.role)}>${r}</option>`)}</select>`}</td>
    <td>${m.status === "Active" ? html`<span class="badge ok">Active</span>` : html`<span class="badge warn">Invited ${fmtDate(m.invitedAt)}</span>`}</td>
    <td>${m.lastActive ? fmtDate(m.lastActive) : "—"}</td>
    <td class="actions">${m.status === "Invited" ? html`<button class="btn small" data-act="invite-copy" data-id="${m.id}">Copy invite link</button><button class="btn small" data-act="invite-accept" data-id="${m.id}">Simulate acceptance</button>` : ""}${m.role !== "Owner" ? html`<button class="btn small danger" data-act="member-remove" data-id="${m.id}">Remove</button>` : ""}</td></tr>`)}</tbody></table></div>
  <div class="grid two" style="margin-top:16px">
    <form class="card form" data-form="invite" novalidate><h2>Invite someone</h2>
      <label class="f">Work email <input type="email" name="email" required maxlength="120"></label>
      <label class="f">Role <select name="role">${Object.keys(S.ROLES).filter((r) => r !== "Owner").map((r) => html`<option ${sel(r === "Accountant")}>${r}</option>`)}</select></label>
      <p class="err" id="invite-err" role="alert"></p>
      <div><button class="btn primary">Send invite</button></div>
      <p class="faint" style="font-size:12.5px">Demo: the invitation is created but no email is sent.</p></form>
    <section class="card"><h2 style="margin-bottom:8px">What each role can do</h2><table class="t"><tbody>${Object.entries(S.ROLES).map(([r, d]) => html`<tr><td><strong>${r}</strong></td><td>${d}</td></tr>`)}</tbody></table></section>
  </div>`);

// ---------- Audit log ----------
page(/^audit$/, "audit", () => {
  const q = query();
  const platform = q.scope === "platform";
  const users = [...new Set(state.audit.filter((a) => platform || a.tenantId === state.activeTenantId).map((a) => a.user))];
  const rows = state.audit.filter((a) => (platform || a.tenantId === state.activeTenantId) && (!ui.auditUser || a.user === ui.auditUser) && (!ui.auditQuery || `${ACTION_TEXT[a.action] ?? a.action} ${a.detail}`.toLowerCase().includes(ui.auditQuery.toLowerCase())));
  return html`
    ${head("Audit log", platform ? "Activity across every workspace on the platform (super admin only)." : "Who did what, and when, in this workspace.")}
    <nav class="tabs" aria-label="Scope"><a href="#/audit" ${!platform ? raw('aria-current="page"') : ""}>This workspace</a><a href="#/audit?scope=platform" ${platform ? raw('aria-current="page"') : ""}>All workspaces</a></nav>
    <div class="form-row" style="margin-bottom:12px;max-width:640px"><label class="f">Search <input type="search" data-live="audit-q" value="${ui.auditQuery}" placeholder="e.g. invoice, GSTIN, role"></label>
      <label class="f">Person <select data-live="audit-user"><option value="">Everyone</option>${users.map((u) => html`<option ${sel(u === ui.auditUser)}>${u}</option>`)}</select></label></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>Who</th>${platform ? html`<th>Workspace</th>` : ""}<th>What</th></tr></thead>
    <tbody>${rows.slice(0, 200).map((a) => html`<tr><td style="white-space:nowrap">${fmtTime(a.at)}</td><td>${a.user}</td>${platform ? html`<td>${state.tenants.find((t) => t.id === a.tenantId)?.name ?? "Platform"}</td>` : ""}<td>${describeAction(a)}</td></tr>`)}</tbody></table></div>
    ${rows.length ? "" : html`<div class="card empty">No matching activity.</div>`}`;
});

// ---------- Super admin ----------
page(/^admin$/, "admin", () => html`
  ${head("Super admin", "Manage every workspace on the platform: switch modules on or off and sign in as a workspace to help with support.", html`<a class="btn" href="#/audit?scope=platform">Platform audit log</a>`)}
  <div class="table-wrap"><table class="t"><thead><tr><th>Workspace</th><th>Plan</th><th>Users</th><th>Modules</th><th><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${state.tenants.map((t) => html`<tr><td><strong>${t.name}</strong><br><span class="faint" style="font-size:12.5px">${t.city} · since ${fmtDate(t.createdAt)}</span></td><td>${t.plan}</td><td>${t.users}</td>
    <td><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px 14px">${S.MODULES.map((m) => html`<label class="toggle"><input type="checkbox" data-live="module-toggle" data-tenant="${t.id}" data-module="${m.key}" ${chk(t.modules[m.key])}><span class="track"></span>${m.label}</label>`)}</div></td>
    <td>${state.activeTenantId === t.id ? html`<span class="badge brand">${state.impersonating ? "Signed in" : "Your workspace"}</span>` : html`<button class="btn small" data-act="impersonate" data-tenant="${t.id}">Sign in as workspace</button>`}</td></tr>`)}</tbody></table></div>
  <p class="muted" style="margin-top:10px;font-size:13px">Turning a module off hides it for everyone in that workspace; their data is kept. In this demo only ${state.tenant.name} has sample books.</p>`);

function impersonatedView() {
  const t = state.tenants.find((x) => x.id === state.impersonating);
  return html`${head(t.name, `${t.plan} plan · ${t.users} users · ${t.city}`)}
    <div class="card"><p>You're signed in to this workspace as a super admin. In this demo it has no sample books, so there's nothing to show beyond its setup:</p>
      <ul>${S.MODULES.map((m) => html`<li>${m.label}: ${t.modules[m.key] ? "on" : "off"}</li>`)}</ul>
      <div class="actions"><button class="btn primary" data-act="exit-impersonation">Exit and return to super admin</button></div></div>`;
}

// ---------- Roadmap ----------
const ROADMAP = [
  ["ERP", [["Multi-currency", "Invoice in USD, EUR and more; rate saved per transaction; reports in INR; automatic forex gain/loss."], ["Recurring billing", "Weekly to yearly subscription invoices that create themselves, with pause and resume."], ["Fixed assets", "Asset register with straight-line or WDV depreciation posted to the ledger, and disposals."], ["Budgets", "Budget by account and month (April–March) with a colour-coded variance report."], ["Cost centres", "Tag invoices, journals and expenses to cost centres or projects; P&L per centre."], ["Barcode scanning", "Scan with your camera on GRNs, delivery notes and POs; EAN-13 labels."]]],
  ["Platform", [["Two-factor sign-in", "Authenticator-app codes with one-time backup codes."], ["Documents", "Attach files to any record, with a searchable library."], ["eSign", "Aadhaar-based eSignature via Digio for invoices, POs and offer letters."], ["WhatsApp notifications", "Approved-template messages for invoices, reminders, POs, tickets and leave."], ["Dashboard builder", "Build dashboards from ready-made charts and tables."]]],
  ["Projects", [["Gantt chart", "Timeline of tasks with dependencies, drag-to-reschedule and critical path."]]],
];
page(/^roadmap$/, "roadmap", () => html`
  ${head("Coming soon", "Being built now on the same ledger. These aren't in the product yet.", html`<a class="btn amber" href="../coming-soon.html#notify-form">Get notified</a>`)}
  ${ROADMAP.map(([g, items]) => html`<h2 style="margin:18px 0 10px">${g}</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${items.map(([n, d]) => html`<div class="soon-card"><h3>${n}</h3><p>${d}</p></div>`)}</div>`)}`);

// ---------- dialogs ----------
function dialog(title, bodyHtml, { submitLabel = "Save", formName, data = {} } = {}) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.setAttribute("aria-labelledby", "dlg-title");
  d.innerHTML = String(html`<form data-form="${formName}" ${raw(Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" "))} novalidate>
    <div class="dlg-body"><h2 id="dlg-title">${title}</h2>${bodyHtml}<p class="err" id="dlg-err" role="alert"></p></div>
    <div class="dlg-foot"><button type="button" class="btn" data-act="dlg-close">Cancel</button><button class="btn primary">${submitLabel}</button></div></form>`);
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  d.querySelector("input, select, textarea")?.focus();
}
const dlgError = (msg) => {
  const e = document.getElementById("dlg-err");
  if (e) e.textContent = msg;
};
const closeDialog = () => document.querySelector("dialog")?.close();

// ---------- actions ----------
const ACTIONS = {
  reset: () => {
    if (confirm("Reset the demo to its original sample data? Your changes in this browser will be lost.")) resetDemo();
  },
  menu: (el) => {
    const s = document.getElementById("sidebar");
    const open = s.classList.toggle("open");
    el.setAttribute("aria-expanded", String(open));
  },
  print: () => window.print(),
  "dlg-close": () => closeDialog(),
  "inv-add-line": () => {
    readInvoiceForm(document.querySelector('form[data-form="invoice"]'));
    ui.inv.lines.push(blankLine());
    render();
    document.querySelectorAll('tr[data-line] [name="name"]').item(ui.inv.lines.length - 1)?.focus();
  },
  "inv-remove-line": (el) => {
    readInvoiceForm(document.querySelector('form[data-form="invoice"]'));
    ui.inv.lines.splice(Number(el.dataset.i), 1);
    render();
  },
  "inv-for-client": (el, e) => {
    e.preventDefault();
    ui.inv = { editing: null, clientId: el.dataset.id, date: TODAY, dueDays: 30, notes: "", lines: [blankLine()] };
    go("#/invoices/new");
  },
  "inv-issue": (el) => {
    S.issueInvoice(state, el.dataset.id);
    const inv = state.invoices.find((i) => i.id === el.dataset.id);
    save();
    render();
    toast(`Issued as ${inv.no} and posted to the ledger.`);
  },
  "inv-delete": (el) => {
    if (!confirm("Delete this draft?")) return;
    state.invoices = state.invoices.filter((i) => i.id !== el.dataset.id);
    act("invoice.draft_deleted");
    save();
    go("#/invoices");
  },
  "inv-irn": (el) => {
    const inv = state.invoices.find((i) => i.id === el.dataset.id);
    inv.irn = L.demoIrn(state.tenant.gstin, inv.no, inv.date);
    act("invoice.irn_generated", inv.no);
    save();
    render();
    toast("IRN generated (demo: not sent to the GST portal).");
  },
  "inv-email": (el) => {
    const inv = state.invoices.find((i) => i.id === el.dataset.id);
    const c = client(inv.clientId);
    const via = state.tenant.smtp.host ? `your SMTP server (${state.tenant.smtp.host})` : "Avyntro's mail service";
    dialog(`Email ${inv.no}`, html`
      <label class="f">To <input type="email" name="to" value="${c.email}" required></label>
      <label class="f">Subject <input name="subject" value="Invoice ${inv.no} from ${state.tenant.name}" required></label>
      <label class="f">Message <textarea name="body" rows="4">Dear ${c.contact},\n\nPlease find attached invoice ${inv.no} for ${inr(inv.totals.total)}, due on ${fmtDate(inv.due)}.\n\nRegards,\n${state.tenant.name}</textarea></label>
      <p class="muted" style="font-size:13px">The PDF is attached automatically and sent through ${via}. In the demo, nothing is actually sent.</p>`, { submitLabel: "Send email", formName: "email", data: { id: inv.id } });
  },
  "inv-pay": (el) => {
    const inv = state.invoices.find((i) => i.id === el.dataset.id);
    dialog(`Record payment for ${inv.no}`, html`
      <div class="form-row"><label class="f">Amount (₹) <input type="number" name="amount" step="0.01" min="0.01" value="${rupees(outstanding(inv))}" required></label><label class="f">Date <input type="date" name="date" value="${TODAY}" min="${inv.date}" required></label></div>
      <div class="form-row"><label class="f">Received by <select name="mode"><option>Bank transfer</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></label><label class="f">Reference <input name="ref" maxlength="40" placeholder="UTR / cheque no."></label></div>
      <p class="muted" style="font-size:13px">Outstanding: ${inr(outstanding(inv))}. Cash goes to Cash in hand; everything else to the HDFC account.</p>`, { submitLabel: "Record payment", formName: "payment", data: { id: inv.id } });
  },
  "item-edit": (el) => {
    const it = state.items.find((i) => i.id === el.dataset.id) ?? { id: "", name: "", hsn: "", gstRate: 18, price: 0, unit: "pcs" };
    dialog(it.id ? "Edit item" : "Add item", html`
      <label class="f">Name <input name="name" value="${it.name}" required maxlength="80"></label>
      <div class="form-row"><label class="f">HSN/SAC <input name="hsn" value="${it.hsn}" required inputmode="numeric" maxlength="8"></label><label class="f">Unit <input name="unit" value="${it.unit}" required maxlength="10"></label></div>
      <div class="form-row"><label class="f">Price (₹) <input type="number" name="price" step="0.01" min="0.01" value="${it.price ? rupees(it.price) : ""}" required></label><label class="f">GST <select name="gstRate">${L.GST_RATES.map((r) => html`<option value="${r}" ${sel(r === it.gstRate)}>${r}%</option>`)}</select></label></div>`, { formName: "item", data: { id: it.id } });
  },
  "catalogue-sample": () => startImport(S.SAMPLE_CATALOGUE, "Sample catalogue (7 rows)"),
  "catalogue-cancel": () => {
    ui.importRows = null;
    render();
  },
  "catalogue-import": () => {
    const rows = ui.importRows.filter((r) => r.include && !r.issues.length);
    if (!rows.length) return toast("Nothing selected to import.");
    for (const r of rows) state.items.push({ id: S.newId(state, "I"), name: r.name, hsn: r.hsn, gstRate: r.gstRate, price: L.toPaise(r.price), unit: "pcs" });
    act("items.imported", `${rows.length} items`);
    ui.importRows = null;
    save();
    go("#/items");
    toast(`${rows.length} items added to your item master.`);
  },
  "client-add": () => {
    dialog("Add client", html`
      <label class="f">Business name <input name="name" required maxlength="80"></label>
      <label class="f">GSTIN <span class="hint">Leave blank for an unregistered buyer</span><input name="gstin" maxlength="15" style="text-transform:uppercase" autocomplete="off"></label>
      <div class="form-row"><label class="f">State <span class="hint">Taken from the GSTIN if given</span><select name="state">${Object.entries(L.GST_STATES).map(([k, v]) => html`<option value="${k}" ${sel(k === "09")}>${v}</option>`)}</select></label><label class="f">City <input name="city" required maxlength="40"></label></div>
      <div class="form-row"><label class="f">Contact person <input name="contact" required maxlength="60"></label><label class="f">Email <input type="email" name="email" maxlength="80"></label></div>
      <label class="f">Phone <input name="phone" maxlength="20" inputmode="tel"></label>`, { formName: "client" });
  },
  "gstin-primary": (el) => {
    for (const g of state.gstins) g.primary = g.gstin === el.dataset.gstin;
    act("gstin.primary_changed", el.dataset.gstin);
    save();
    render();
  },
  "statement-sample": () => {
    const lines = L.parseStatementCsv(S.sampleStatement(state, TODAY));
    const s = S.startReconciliation(state, lines, `HDFC statement ${fmtMonth(TODAY.slice(0, 7))} (sample).csv`);
    save();
    go(`#/bank/${s.id}`);
  },
  "bank-ignore": (el) => {
    const s = state.bankSessions.find((x) => x.id === el.dataset.session);
    const l = s.lines[Number(el.dataset.i)];
    l.ignored = !l.ignored;
    save();
    render();
  },
  "bank-approve": (el) => {
    try {
      const r = S.approveReconciliation(state, el.dataset.session);
      save();
      render();
      toast(`Approved: ${r.matched} matched, ${r.created} new entries posted.`);
    } catch (err) {
      toast(err.message);
    }
  },
  "journal-add-line": () => {
    readJournalForm(document.querySelector('form[data-form="journal"]'));
    ui.journal.lines.push({ account: "", debit: 0, credit: 0 });
    render();
  },
  "journal-remove-line": (el) => {
    readJournalForm(document.querySelector('form[data-form="journal"]'));
    ui.journal.lines.splice(Number(el.dataset.i), 1);
    render();
  },
  "journal-all": () => {
    ui.journalAll = true;
    render();
  },
  "journal-reverse": (el) => {
    const j = state.journals.find((x) => x.id === el.dataset.id);
    dialog(`Reverse ${j.no}?`, html`<p>${j.narration}</p><p class="muted" style="font-size:13.5px">A new entry with the debits and credits swapped will be posted. The original stays in the books, marked as reversed.</p>
      <label class="f">Reversal date <input type="date" name="date" value="${TODAY}" min="${j.date}" required></label>`, { submitLabel: "Post reversal", formName: "reverse", data: { id: j.id } });
  },
  "report-export": (el) => {
    const label = { pl: "profit-and-loss", bs: "balance-sheet", cf: "cash-flow", tb: "trial-balance" }[el.dataset.tab];
    const p = currentReportPeriod(el.dataset.period);
    download(`${label}-${p.to}.csv`, csv(reportData(el.dataset.tab, p)));
    act("reports.exported", label);
    save();
  },
  "gstr1-export": (el) => {
    const r = L.gstr1(state, el.dataset.month);
    const fp = `${el.dataset.month.slice(5, 7)}${el.dataset.month.slice(0, 4)}`;
    const payload = {
      gstin: state.tenant.gstin, fp,
      b2b: r.b2b.map((x) => ({ ctin: x.gstin, inum: x.invoiceNo, idt: x.date.split("-").reverse().join("-"), val: x.value / 100, pos: x.pos, rt: x.rate, txval: x.taxable / 100, iamt: x.igst / 100, camt: x.cgst / 100, samt: x.sgst / 100 })),
      b2cs: r.b2cs.map((x) => ({ pos: x.pos, rt: x.rate, txval: x.taxable / 100, iamt: x.igst / 100, camt: x.cgst / 100, samt: x.sgst / 100 })),
      hsn: r.hsn.map((x) => ({ hsn_sc: x.hsn, desc: x.description, qty: x.qty, rt: x.rate, txval: x.taxable / 100, tax: x.tax / 100 })),
      _note: "Demo export in a simplified GSTR-1 layout. Not for filing.",
    };
    download(`GSTR1-${fp}-demo.json`, JSON.stringify(payload, null, 2), "application/json");
    act("gstr1.exported", fmtMonth(el.dataset.month));
    save();
  },
  "logo-remove": () => {
    state.tenant.brand.logo = null;
    act("settings.branding_updated", "Logo removed");
    save();
    render();
  },
  "invite-copy": async (el) => {
    const m = state.team.find((x) => x.id === el.dataset.id);
    const link = `https://app.avyntro.com/invite/${btoa(m.email).replace(/=+$/, "")}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied (demo link).");
    } catch {
      prompt("Copy the invite link (demo link):", link);
    }
  },
  "invite-accept": (el) => {
    const m = state.team.find((x) => x.id === el.dataset.id);
    m.status = "Active";
    m.name = m.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    m.lastActive = TODAY;
    act("user.invite_accepted", `${m.email} as ${m.role}`);
    save();
    render();
  },
  "member-remove": (el) => {
    const m = state.team.find((x) => x.id === el.dataset.id);
    if (!confirm(`Remove ${m.name || m.email} from the workspace?`)) return;
    state.team = state.team.filter((x) => x.id !== m.id);
    act("user.removed", m.email);
    save();
    render();
  },
  impersonate: (el) => {
    const t = state.tenants.find((x) => x.id === el.dataset.tenant);
    state.impersonating = t.id;
    state.activeTenantId = t.id;
    S.audit(state, "admin.impersonation_started", t.name, { user: "Super admin", tenantId: t.id });
    save();
    go("#/dashboard");
  },
  "exit-impersonation": () => {
    const t = state.tenants.find((x) => x.id === state.impersonating);
    S.audit(state, "admin.impersonation_ended", t?.name ?? "", { user: "Super admin", tenantId: t?.id });
    state.impersonating = null;
    state.activeTenantId = "T1";
    save();
    go("#/admin");
  },
};

function currentReportPeriod(key) {
  const fy = L.financialYear(TODAY);
  const month = TODAY.slice(0, 7);
  const prev = lastMonths(2)[0];
  return ({ fy: { from: fy.start, to: TODAY }, month: { from: `${month}-01`, to: TODAY }, last: { from: `${prev}-01`, to: monthEnd(prev) }, all: { from: "0000-01-01", to: TODAY } })[key] ?? { from: fy.start, to: TODAY };
}

function startImport(text, note) {
  ui.importRows = L.reviewCatalogueRows(L.parseCatalogueText(text), state.items);
  ui.importNote = note;
  if (!ui.importRows.length) {
    ui.importRows = null;
    toast("No products found. Use one product per line: name, HSN, price, GST%.");
  }
  render();
}

// ---------- forms ----------
const FORMS = {
  invoice: (form, data, submitter) => {
    readInvoiceForm(form);
    const f = ui.inv;
    const err = document.getElementById("inv-err");
    const lines = f.lines.filter((l) => l.name || l.rate);
    if (lines.some((l) => !l.name || !(l.qty > 0) || !(l.rate > 0))) return (err.textContent = "Each line needs an item name, quantity and rate.");
    if (lines.some((l) => !/^\d{4,8}$/.test(l.hsn))) return (err.textContent = "Each line needs a 4 to 8 digit HSN/SAC code.");
    if (!lines.length) return (err.textContent = "Add at least one line.");
    const draft = submitter?.value === "draft";
    let inv;
    if (f.editing) {
      state.invoices = state.invoices.filter((i) => i.id !== f.editing);
    }
    inv = S.createInvoice(state, { clientId: f.clientId, date: f.date, dueDays: f.dueDays, lines, notes: f.notes, draft });
    ui.inv = null;
    save();
    go(`#/invoices/${inv.id}`);
    toast(draft ? "Draft saved." : `Invoice ${inv.no} issued and posted to the ledger.`);
  },
  email: (form) => {
    if (!form.to.value || !form.to.checkValidity()) return dlgError("Enter a valid email address.");
    const inv = state.invoices.find((i) => i.id === form.dataset.id);
    inv.emailedAt = new Date().toISOString();
    act("invoice.emailed", `${inv.no} to ${form.to.value}`);
    save();
    closeDialog();
    render();
    toast("Email recorded as sent (demo: nothing was actually sent).");
  },
  payment: (form) => {
    try {
      S.recordPayment(state, { invoiceId: form.dataset.id, date: form.date.value, amount: L.toPaise(form.amount.value), mode: form.mode.value, ref: form.ref.value.trim() });
    } catch (err) {
      return dlgError(err.message);
    }
    save();
    closeDialog();
    render();
    toast("Payment recorded and posted to the ledger.");
  },
  item: (form) => {
    const name = form.name.value.trim();
    const hsn = form.hsn.value.trim();
    const price = L.toPaise(form.price.value);
    if (!name) return dlgError("Enter a name.");
    if (!/^\d{4}(\d{2})?(\d{2})?$/.test(hsn)) return dlgError("HSN/SAC should be 4, 6 or 8 digits.");
    if (!(price > 0)) return dlgError("Enter a price.");
    if (state.items.some((i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== form.dataset.id)) return dlgError("An item with this name already exists.");
    const data = { name, hsn, price, gstRate: Number(form.gstRate.value), unit: form.unit.value.trim() || "pcs" };
    if (form.dataset.id) Object.assign(state.items.find((i) => i.id === form.dataset.id), data);
    else state.items.push({ id: S.newId(state, "I"), ...data });
    act("item.saved", name);
    save();
    closeDialog();
    render();
  },
  client: (form) => {
    const gstin = form.gstin.value.trim().toUpperCase();
    if (!form.name.value.trim() || !form.city.value.trim() || !form.contact.value.trim()) return dlgError("Name, city and contact person are required.");
    if (gstin) {
      const problem = L.validateGstin(gstin);
      if (problem) return dlgError(problem);
    }
    if (form.email.value && !form.email.checkValidity()) return dlgError("Enter a valid email address.");
    const c = { id: S.newId(state, "C"), name: form.name.value.trim(), gstin, state: gstin ? gstin.slice(0, 2) : form.state.value, city: form.city.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(), contact: form.contact.value.trim(), interactions: [] };
    state.clients.push(c);
    act("client.added", c.name);
    save();
    closeDialog();
    go(`#/clients/${c.id}`);
  },
  interaction: (form) => {
    const c = client(form.dataset.id);
    const note = form.note.value.trim();
    if (!note) return form.note.reportValidity();
    c.interactions.push({ date: form.date.value || TODAY, type: form.type.value, note });
    act("client.interaction_logged", `${form.type.value} with ${c.name}`);
    save();
    render();
  },
  notice: (form) => {
    if (!form.form.value.trim() || !form.subject.value.trim()) return form.reportValidity();
    state.notices.unshift({ id: S.newId(state, "N"), gstin: form.gstin.value, form: form.form.value.trim().toUpperCase(), subject: form.subject.value.trim(), issued: form.issued.value, due: form.due.value, status: "Open" });
    act("notice.added", form.form.value.trim().toUpperCase());
    save();
    render();
  },
  gstin: (form) => {
    const g = form.gstin.value.trim().toUpperCase();
    const err = document.getElementById("gstin-err");
    const problem = L.validateGstin(g);
    if (problem) return (err.textContent = problem);
    if (state.gstins.some((x) => x.gstin === g)) return (err.textContent = "That GSTIN is already added.");
    if (!form.label.value.trim()) return (err.textContent = "Add a label so you can tell registrations apart.");
    state.gstins.push({ gstin: g, state: g.slice(0, 2), label: form.label.value.trim(), primary: false });
    act("gstin.added", g);
    save();
    render();
    toast("GSTIN added.");
  },
  journal: (form) => {
    readJournalForm(form);
    const j = ui.journal;
    if (!j.narration.trim()) return (document.getElementById("j-status").textContent = "Add a narration.");
    try {
      const posted = S.postJournal(state, { date: j.date, narration: j.narration.trim(), lines: j.lines, source: "manual" });
      act("journal.posted", `${posted.no}: ${posted.narration}`);
    } catch (err) {
      return (document.getElementById("j-status").textContent = err.message);
    }
    ui.journal = null;
    save();
    go("#/journal");
    toast("Entry posted.");
  },
  reverse: (form) => {
    try {
      S.reverseJournal(state, form.dataset.id, form.date.value || TODAY);
    } catch (err) {
      return dlgError(err.message);
    }
    save();
    closeDialog();
    render();
    toast("Reversal posted.");
  },
  branding: (form) => {
    const b = state.tenant.brand;
    b.initials = form.initials.value.trim().toUpperCase().slice(0, 3) || b.initials;
    b.font = form.font.value;
    b.color = ui.previewColor ?? b.color;
    act("settings.branding_updated", `Colour ${b.color}, font ${b.font}`);
    save();
    render();
    toast("Branding saved.");
  },
  smtp: (form, data, submitter) => {
    const err = document.getElementById("smtp-err");
    const host = form.host.value.trim();
    const port = form.port.value.trim();
    const from = form.from.value.trim();
    if (host && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return (err.textContent = "Enter a valid host name, e.g. smtp.gmail.com.");
    if (host && !/^\d{2,5}$/.test(port)) return (err.textContent = "Enter a port number, usually 587 or 465.");
    if (from && !form.from.checkValidity()) return (err.textContent = "Enter a valid from address.");
    if (submitter?.value === "test") {
      err.textContent = "";
      return toast(host ? `Settings look valid. In the demo no test email is sent to ${host}.` : "Using Avyntro's mail service. In the demo no test email is sent.");
    }
    Object.assign(state.tenant.smtp, { host, port, user: form.user.value.trim(), from });
    act("settings.smtp_updated", host || "Avyntro mail service");
    save();
    render();
    toast("Email settings saved. The password is never stored in the demo.");
  },
  workspace: (form) => {
    if (!form.checkValidity()) return form.reportValidity();
    Object.assign(state.tenant, { name: form.name.value.trim(), invoicePrefix: form.prefix.value.trim().toUpperCase(), address: form.address.value.trim() });
    state.tenants[0].name = state.tenant.name;
    act("settings.workspace_updated", state.tenant.name);
    save();
    render();
    toast("Workspace details saved. New invoice numbers use the new prefix.");
  },
  invite: (form) => {
    const email = form.email.value.trim().toLowerCase();
    const err = document.getElementById("invite-err");
    if (!email || !form.email.checkValidity()) return (err.textContent = "Enter a valid email address.");
    if (state.team.some((m) => m.email === email)) return (err.textContent = "That person is already in the team or invited.");
    state.team.push({ id: S.newId(state, "U"), name: "", email, role: form.role.value, status: "Invited", lastActive: null, invitedAt: TODAY });
    act("user.invited", `${email} as ${form.role.value}`);
    save();
    render();
    toast("Invitation created.");
  },
};

// ---------- live inputs ----------
function onLive(el) {
  const kind = el.dataset.live;
  if (kind === "inv") return readInvoiceForm(el.form);
  if (kind === "journal") return readJournalForm(el.form);
  if (kind === "inv-search") {
    ui.invSearch = el.value;
    document.getElementById("inv-table").innerHTML = String(invoiceTable(query().status ?? "all"));
    return;
  }
  if (kind === "gstr1-month") return go(`#/gst?tab=gstr1&month=${el.value}`);
  if (kind === "report-period") return go(`#/reports?tab=${el.dataset.tab}&period=${el.value}`);
  if (kind === "notice-status") {
    const n = state.notices.find((x) => x.id === el.dataset.id);
    n.status = el.value;
    act("notice.status_changed", `${n.form}: ${el.value}`);
    save();
    return render();
  }
  if (kind === "bank-account") {
    const s = state.bankSessions.find((x) => x.id === el.dataset.session);
    s.lines[Number(el.dataset.i)].newAccount = el.value || null;
    save();
    return render();
  }
  if (kind === "import-row") {
    const tr = el.closest("tr");
    const r = ui.importRows[Number(tr.dataset.row)];
    if (el.name === "include") r.include = el.checked;
    else {
      r.name = tr.querySelector('[name="name"]').value.trim();
      r.hsn = tr.querySelector('[name="hsn"]').value.replace(/\D/g, "");
      r.price = Number(tr.querySelector('[name="price"]').value) || 0;
      r.gstRate = Number(tr.querySelector('[name="gstRate"]').value);
      const [checked] = L.reviewCatalogueRows([r], state.items);
      r.issues = checked.issues;
      if (!r.issues.length && el.name !== "include") r.include = true;
    }
    return render();
  }
  if (kind === "catalogue-file") {
    const file = el.files?.[0];
    if (!file) return;
    if (/\.(txt|csv)$/i.test(file.name)) {
      file.text().then((t) => startImport(t, `${file.name}`));
    } else {
      startImport(S.SAMPLE_CATALOGUE, `${file.name}: read as the sample catalogue in this demo`);
    }
    return;
  }
  if (kind === "statement-file") {
    const file = el.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) return toast("That file is too large for the demo (2 MB max).");
    file.text().then((t) => {
      const lines = L.parseStatementCsv(t);
      if (!lines.length) return toast("No statement lines found. Expected columns: date (YYYY-MM-DD), description, amount.");
      const s = S.startReconciliation(state, lines, file.name);
      save();
      go(`#/bank/${s.id}`);
    });
    return;
  }
  if (kind === "logo-file") {
    const file = el.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) return toast("Use a PNG, JPG or SVG image.");
    if (file.size > 300_000) return toast("Logo must be 300 KB or smaller.");
    const reader = new FileReader();
    reader.onload = () => {
      state.tenant.brand.logo = reader.result;
      act("settings.branding_updated", "Logo uploaded");
      save();
      render();
    };
    reader.readAsDataURL(file);
    return;
  }
  if (kind === "brand") {
    const form = el.form;
    const color = el.name === "custom" ? el.value : form.querySelector('[name="color"]:checked')?.value ?? form.custom.value;
    if (el.name === "custom") form.querySelectorAll('[name="color"]').forEach((r) => (r.checked = false));
    ui.previewColor = color;
    applyBrand({ color, font: form.font.value });
    return;
  }
  if (kind === "member-role") {
    const m = state.team.find((x) => x.id === el.dataset.id);
    m.role = el.value;
    act("user.role_changed", `${m.email} → ${el.value}`);
    save();
    return toast(`${m.name || m.email} is now ${el.value}.`);
  }
  if (kind === "audit-q") {
    ui.auditQuery = el.value;
    clearTimeout(onLive.t);
    onLive.t = setTimeout(() => {
      render();
      const input = document.querySelector('[data-live="audit-q"]');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, 250);
    return;
  }
  if (kind === "audit-user") {
    ui.auditUser = el.value;
    return render();
  }
  if (kind === "module-toggle") {
    const t = state.tenants.find((x) => x.id === el.dataset.tenant);
    t.modules[el.dataset.module] = el.checked;
    if (t.id === "T1") state.tenant.modules = t.modules;
    const label = S.MODULES.find((m) => m.key === el.dataset.module).label;
    S.audit(state, el.checked ? "module.enabled" : "module.disabled", `${label} for ${t.name}`, { user: "Super admin", tenantId: t.id });
    save();
    return render();
  }
}

// ---------- render ----------
function render() {
  const path = (location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard").replace(/\/$/, "");
  let section = "dashboard";
  let body = null;
  if (state.impersonating && !["admin", "audit"].includes(path)) {
    section = "dashboard";
    body = impersonatedView();
  } else {
    for (const p of PAGES) {
      const m = path.match(p.pattern);
      if (!m) continue;
      section = p.section;
      body = p.module && !moduleOn(p.module) ? moduleOff(NAV.find((n) => n.module === p.module)?.label ?? "This module") : p.fn(...m.slice(1));
      break;
    }
  }
  if (!body) body = html`<div class="card empty"><h1 style="margin-bottom:8px">Page not found</h1><a href="#/dashboard">Go to the dashboard</a></div>`;
  applyBrand(ui.previewColor && section === "settings" ? { ...state.tenant.brand, color: ui.previewColor } : state.tenant.brand);
  if (section !== "settings") ui.previewColor = null;
  document.getElementById("app").innerHTML = String(shell(section, body));
  document.title = `${(document.querySelector(".page-head h1")?.textContent ?? "Demo").trim()} · Avyntro demo`;
  if (section === "journal" && ui.journal && document.querySelector('form[data-form="journal"]')) readJournalForm(document.querySelector('form[data-form="journal"]'));
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !ACTIONS[el.dataset.act]) return;
  if (el.tagName === "BUTTON" && el.type !== "submit") e.preventDefault();
  try {
    ACTIONS[el.dataset.act](el, e);
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form || !FORMS[form.dataset.form]) return;
  e.preventDefault();
  try {
    FORMS[form.dataset.form](form, new FormData(form), e.submitter);
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("input", (e) => {
  const el = e.target.closest("[data-live]");
  if (el && !["SELECT"].includes(el.tagName) && el.type !== "file" && el.type !== "checkbox" && el.type !== "radio") onLive(el);
});
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-live]");
  if (el && (el.tagName === "SELECT" || el.type === "file" || el.type === "checkbox" || el.type === "radio" || el.type === "color" || el.type === "date")) onLive(el);
});
window.addEventListener("hashchange", () => {
  render();
  document.getElementById("content")?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

state = load();
save();
render();
