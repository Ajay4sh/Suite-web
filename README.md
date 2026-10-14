# Avyntro marketing site

Static marketing site for Avyntro (manufacturing ERP + HRMS). Plain HTML/CSS/JS, no build step.

## Deploy on Vercel

1. Go to https://vercel.com/new
2. Import this GitHub repository.
3. Framework preset: **Other**. Leave Build Command and Output Directory blank — this is a static site served as-is.
4. Deploy. Vercel will give you a `*.vercel.app` URL immediately.

To connect a custom domain later: Project → Settings → Domains → add `avyntro.com`, then add the DNS records Vercel shows you at your domain registrar.

## Notes

- `index.html` is the home page; `erp.html`, `hrms.html`, `platform.html`, `coming-soon.html`, `about.html`, `contact.html`, `request-access.html`, `privacy.html`, `terms.html` are the other pages.
- `erp.html` and `platform.html` list only features that are live in the product. Features still being built (multi-currency, recurring billing, fixed assets, budgets, cost centres, barcode scanning, 2FA, documents, eSign, WhatsApp, dashboard builder, Gantt) are marked **Soon** there and on `coming-soon.html`. Move a feature out of "Soon" only once it ships.

## Interactive demo (`demo/`)

`demo/index.html` is a clickable ERP demo for prospects, built on a fictional business ("Shree Ganesh Engineering Works") with six months of sample data. It runs entirely in the browser: no server, no sign-up, and anything a visitor changes is saved only in their own browser ("Reset sample data" restores it). It is **not connected to the real product**.

What works in it: GST invoices (CGST/SGST vs IGST by place of supply, item autocomplete, printable PDF, demo IRN, email preview, payments), item master and catalogue import with a review step, clients with interaction history, GSTR-1 data, GST liability, notices and GSTINs (with check-digit validation), bank reconciliation with auto-matching and session approval, double-entry journals with reversal, P&L, balance sheet, cash flow and trial balance, white-label branding and SMTP settings, team invites and roles, audit log, and super-admin module toggles and workspace sign-in.

Honest limits shown in the demo itself: IRNs are not sent to the GST portal, no emails are sent, and PDF/Word catalogue uploads are replaced by a sample catalogue (text/CSV files are read for real).

- `demo/ledger.js` – accounting engine (money in paise, GST, reports, matching)
- `demo/store.js` – actions and the sample data
- `demo/app.js`, `demo/demo.css` – the screens
- Tests: `node --test demo/tests/ledger.test.mjs` (needs Node 22+)
## SEO and AI visibility

- Canonical domain is `https://avyntro.com`. Every page has its own title, meta description, canonical URL, Open Graph/Twitter tags and JSON-LD (Organization, WebSite, plus SoftwareApplication and FAQPage on the home page and BreadcrumbList elsewhere). If the domain changes, search-and-replace `https://avyntro.com` across the HTML, `robots.txt`, `sitemap.xml` and `llms.txt`.
- The FAQPage JSON-LD on `index.html` mirrors the visible FAQ. If you edit the FAQ, re-run the same edit in the JSON-LD (or regenerate it) so they stay identical.
- `robots.txt` allows search engines and AI assistant crawlers. To opt out of one, change its `Allow: /` to `Disallow: /`.
- `sitemap.xml` lists the public pages; update `lastmod` when a page changes. `privacy.html`, `terms.html`, `404.html` and `demo/` are `noindex` and left out. Remove `noindex` from privacy/terms once real legal copy is published.
- `llms.txt` is a plain summary of the product for AI assistants. Keep it factual and move features from "Coming soon" to "Live today" only once they ship.
- Screenshots in `assets/img/demo-*.jpg` are taken from the demo; `og-avyntro.jpg` (1200×630) is the social share image.

- `styles.css` is a single deliberate light theme (no dark-mode variant) — do not reintroduce a `prefers-color-scheme: dark` block.
- The "Request Early Access" and "Contact" forms in `site.js` are currently **not wired to any backend** — submitting shows a message pointing the visitor to email `info@avyntro.com` directly. To make them actually receive submissions, swap in a form backend (e.g. Formspree, Web3Forms, or a small serverless function that emails you) and update `wireDbForm`/`getDb` in `site.js` accordingly.
- `privacy.html` and `terms.html` are explicit placeholders — real legal copy needs to be drafted and reviewed before this goes fully public.
