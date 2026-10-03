# Avyntro marketing site

Static marketing site for Avyntro (manufacturing ERP + HRMS). Plain HTML/CSS/JS, no build step.

## Deploy on Vercel

1. Go to https://vercel.com/new
2. Import this GitHub repository.
3. Framework preset: **Other**. Leave Build Command and Output Directory blank — this is a static site served as-is.
4. Deploy. Vercel will give you a `*.vercel.app` URL immediately.

To connect a custom domain later: Project → Settings → Domains → add `avyntro.com`, then add the DNS records Vercel shows you at your domain registrar.

## Notes

- `index.html` is the home page; `erp.html`, `hrms.html`, `coming-soon.html`, `about.html`, `contact.html`, `request-access.html`, `privacy.html`, `terms.html` are the other pages.
- `styles.css` is a single deliberate light theme (no dark-mode variant) — do not reintroduce a `prefers-color-scheme: dark` block.
- The "Request Early Access" and "Contact" forms in `site.js` are currently **not wired to any backend** — submitting shows a message pointing the visitor to email `info@avyntro.com` directly. To make them actually receive submissions, swap in a form backend (e.g. Formspree, Web3Forms, or a small serverless function that emails you) and update `wireDbForm`/`getDb` in `site.js` accordingly.
- `privacy.html` and `terms.html` are explicit placeholders — real legal copy needs to be drafted and reviewed before this goes fully public.
