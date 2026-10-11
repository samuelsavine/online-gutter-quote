# EZ Gutter Quote — Online Gutter Quote Mockup

**Live demo:** https://samuelsavine.github.io/online-gutter-quote/

**Team portal (demo roles):** https://samuelsavine.github.io/online-gutter-quote/portal.html

A customer-facing questionnaire (MVP v1.0) that produces a preliminary gutter installation estimate online — no tape measure, no ladder, no in-home sales presentation — plus a prototype contractor marketplace behind it.

### Demo accounts (no passwords)

| Email | Role |
|---|---|
| admin@ezgutter.com | Admin — settings, contractor verification, compliance exports |
| sales@ezgutter.com | Sales associate — jobs + message center |
| maria@capefeargutters.com | Licensed contractor (all job sizes) |
| deshawn@coastalrain.com | Unlicensed contractor (capped at regional threshold) |

Prototype data lives in your browser's localStorage — each visitor gets their own sandbox. To reset the demo, clear site data (or run `localStorage.removeItem("ezgq.db.v1")` in the console).

## What's implemented

### Landing page
- Modern dark-themed hero with CTA that reveals the questionnaire.

### Progressive questionnaire
- One question per screen with slide animations and auto-advance on single-choice answers.
- Progress bar with step counter and a back button that respects answer history.
- Inline validation for address, ZIP, email, and phone.

### Conditional logic
- "Existing gutter problems" shown only for replacement projects.
- Underground drainage reveals a reconnect follow-up only on "Yes".
- "None of these / Not sure" chips are mutually exclusive with other selections.
- Every lead is prompted (optionally) to upload house/gutter photos for a faster, more accurate quote.

### Satellite gutter measurement (all free, US-based services)
After the address step, the home is located and its outline is pre-drawn on satellite imagery for the user to confirm or adjust:

| Function | Service | Provider |
|---|---|---|
| Geocoding | [Census Bureau geocoder](https://geocoding.geo.census.gov/) | US government |
| Building footprints | [FEMA USA Structures](https://gii.dhs.gov/usa-structures) | US government (hosted on Esri ArcGIS) |
| Satellite imagery | Esri World Imagery | Esri (Redlands, CA) |
| Map/editing UI | [Leaflet](https://leafletjs.com/) | Open source, no server calls |

- Auto-fetched footprint rendered as an editable polygon: drag corner handles, click to add corners, double-click to remove.
- Live linear-footage readout (haversine perimeter), feeding per-foot pricing.
- Manual tracing fallback when no footprint is found; skippable entirely (falls back to flat baseline pricing).
- Verified coverage in the Wilmington, NC pilot region.

### Pricing & quote screens
- Preliminary estimate range (explicitly non-binding), footage-based when a trace was confirmed.
- "Show me pricing both ways" renders gutters-only and with-guards ranges.
- Contact details and an installation timeframe (calendar range with presets) are required **before** the estimate is shown.
- Optional photo upload step for a faster, more accurate quote.

### Marketplace prototype (simulated backend — localStorage, swappable for a real API)
- **Qualified-lead deposit:** simulated Stripe test-mode checkout (card 4242…) collects an admin-configurable deposit that posts the job and is credited to the final price.
- **Contractor & team portal** ([portal.html](portal.html)): demo sign-in (admin, sales, licensed + unlicensed contractors — emails listed on the login screen).
  - Job board shows payout net of the platform commission plus full job details; unlicensed contractors are locked out of jobs above the per-region license threshold (admin-editable).
  - Accept a job → auto-notifies the customer, generates the contract, offers an .ics calendar download.
  - Contractor profile: rate structure ($/ft + modifiers) and credential uploads (license, workers' comp, insurance, W-9) with admin verification.
  - Admin: all jobs, contractor/doc verification, platform settings (deposit, commission, regional thresholds), compliance tab.
- **Contract proof-of-concept** ([contract.html](contract.html)): merged job/contractor/customer fields, typed signatures, print-to-PDF. Placeholder terms pending legal review.
- **Customer job tracker** ([job.html](job.html)): status timeline, contract signing, final payment with automatic platform/contractor split, and on-platform messaging with the contractor.
- **Messaging:** customer↔contractor (after acceptance) and contractor↔admin threads, all stored on-platform.
- **Compliance:** every contact, job, message, payment, settings change, and signature is written to an audit log with actor + timestamp; exportable as CSV/JSON.
- **CRM-ready data:** contacts and jobs are shaped to map 1:1 onto HubSpot contacts/deals; one-click HubSpot-importable CSV exports.

### Compliance details
- Marketing consent is separate, optional, and never prechecked; operational quote communications are explained separately.
- Algorithmic estimates are never presented as guaranteed prices before verification.

## Not yet implemented
- Automated measurement from uploaded photos (upload UI is a stub; no model runs). Researched options: Hover API for production-grade photo→measurement, or a scale cross-check against the satellite trace. Single photos carry no absolute scale, so a free pipeline requires a reference dimension or a GPU photogrammetry backend.
- Real backend: all marketplace data lives in the browser's localStorage (per-device, resettable). The data layer ([store.js](store.js)), payments adapter ([payments.js](payments.js)), and session handling are isolated so a real API/auth/Stripe Connect swap replaces internals, not app code.
- Live Stripe (current checkout is a test-mode simulation) and live HubSpot sync (schema + exports are ready).
- Address autocomplete.

## Running locally

Static site, no build step:

```
git clone https://github.com/samuelsavine/online-gutter-quote.git
```

Open `index.html` in a browser (the portal is `portal.html`). Payments use the simulated test card `4242 4242 4242 4242`.
