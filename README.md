# FastFreePricing — Home Improvement Pricing Prototype (Phase 1)

**Live demo:** https://samuelsavine.github.io/online-gutter-quote/
**Homeowner dashboard:** https://samuelsavine.github.io/online-gutter-quote/account.html
**Pro & team portal:** https://samuelsavine.github.io/online-gutter-quote/portal.html

Homeowners get a **free Good / Better / Best price range** for a home project. They can then unlock a **paid report** (currently $99 list → $0 launch price). The paid report includes a refined price, a detailed questionnaire, name-your-price tips, contractor-quote comparison, and pro matching. Contractors join through staff invitation or self sign-up, are approved by an admin, and buy leads manually or automatically.

> This is a **static prototype**: all data lives in your browser's localStorage, so each visitor gets their own sandbox. Reset it from **Admin → Settings → Reset all**.

### Demo accounts (no passwords)

| Email | Where | Role |
|---|---|---|
| admin@fastfreepricing.com | portal.html | Admin: everything, including **Pricing formula** |
| sales@fastfreepricing.com | portal.html | Sales: overview, projects, contractors |
| expert@fastfreepricing.com | portal.html | Expert: projects |
| maria@capefearexteriors.com | portal.html | Approved member contractor, auto-buy on |
| deshawn@coastalrain.com | portal.html | Invited contractor (runs through onboarding) |
| any homeowner email you used in the wizard | account.html | Homeowner dashboard |

## Homeowner flow (index.html → account.html)

1. Pick a category, enter an address, and confirm the house on a satellite map. The pin can be dragged, and a Google Earth link is provided.
2. Answer the general questions (property type, timeline, …) and the **short** category questionnaire. "Not sure" is always allowed and widens the range.
3. Contractor opt-in is **A/B tested**: variant A asks before the free price, variant B after. The split is set in Settings and results show in Overview.
4. The **free report** shows Good/Better/Best ranges, a summary, and citations (Cost vs Value, Homewyse, admin-entered sources). It also offers the paid report ($99 struck through → $0).
5. Unlock flow: photos (with a guide; skippable), account, then an **ownership check**. A mismatch requires a reason.
6. The **dashboard** shows the refined price with rationale, a detailed questionnaire, name-your-price (budget slider with tips), quote comparison (flags price, quantity, removal, and warranty gaps), photos, pro matching, cost vs value, and print-to-PDF.

## Portal (portal.html)

- **Pricing formula (admin only):** for each category, set the unit, the minimum, and per-tier rates. You can attach a modifier to every questionnaire answer:
  - **× Multiply** scales the price.
  - **+ Add $** adds a fixed amount.
  - **= Value** turns the answer into a number.

  Variables can act as **quantity**, **per-unit cost**, or **scale** (value ÷ reference)^exponent. The page has a live formula readout and a tester, and every save is audited.
  `Price[tier] = max(min × region, (rate × qty × scale × Πmult + Σadd + Σper-unit) × region × general)`
- **Questionnaires:** add, edit, reorder, and delete questions and options, and set short vs detailed stage.
- **Categories:** name, icon, active flag, sources (`Label | url`), ROI note, and photo guide.
- **Contractors:** invite, approve, or reject. Onboarding covers the welcome tour, business details, credential upload, and terms.
- **Leads (contractor):** buy manually or use auto-buy with a monthly cap; max buyers per lead applies. Contractors can report a bad lead, and an admin approves or denies the refund.
- **Billing:** receivables aging plus a membership placeholder (card surcharge setting; ACH has no surcharge).
- **Overview:** projects, leads, and revenue by period; category traction; top ZIPs; A/B results.
- **Settings and Compliance:** prices, spreads, GA4 ID, A/B split; CSV/JSON exports; audit log.

## Integrations status

| Integration | Status |
|---|---|
| Geocoding / footprints / imagery | Esri + Census, FEMA + OSM buildings, Esri World Imagery (free, US-based) |
| Google Earth | Link-out only. Google imagery and 3D Tiles may not be used for measuring or derived data. |
| Ownership (Regrid) | **Simulated.** The Regrid token must stay on a server, so a backend proxy is needed before going live. |
| GA4 | Loads only after a Measurement ID (`G-XXXXXXX`) is entered in Settings |
| Payments, OAuth, email PDF, AI summary/quote extraction | Placeholders |

> ⚠ **All rates and modifiers are placeholders**. Replace them with vetted data in the Pricing formula page. Cost vs Value and Homewyse are copyrighted and have no API, so figures are entered by admins with citations.

## Files

`catalog.js` (seed categories/questions) · `pricing.js` (formula engine) · `store.js` (data layer, the only file to swap for a cloud DB) · `services.js` (analytics, ownership) · `report.js` · `measure.js` · `payments.js` · `app.js` / `account.js` / `portal.js`.

## Phase 2

Full business dashboards, invoicing/ACH, blog, a real backend (auth, OAuth, email, Regrid proxy), AI summaries, and quote extraction.

## Running locally

A static site with no build step. Open `index.html` in a browser.
