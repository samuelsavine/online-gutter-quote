# FastFreePricing — Home Improvement Pricing Prototype

**Live demo:** https://samuelsavine.github.io/online-gutter-quote/

**Business & team portal:** https://samuelsavine.github.io/online-gutter-quote/portal.html

Homeowners get a **free price estimate** for one or more home-improvement projects based on national/regional average pricing, then can buy an **expert Advanced Report** by uploading photos of each project area. Service businesses get a profile (pre-built from license records or self-created) and can upgrade to **Associate** to access leads.

### Demo accounts (no passwords)

| Email | Role |
|---|---|
| admin@fastfreepricing.com | Admin — submissions, report queue, businesses + CSV import, price book, settings, compliance |
| sales@fastfreepricing.com | Sales — submissions, businesses |
| expert@fastfreepricing.com | Expert — Advanced Report queue and editor |
| maria@capefearexteriors.com | Associate business — lead board + lead unlocks |
| deshawn@coastalrain.com | Level 1 business — profile only, lead-count teaser |

Unclaimed imported listings (e.g. search “Seaside” or `NC-PL-30441`) can be claimed from the portal sign-in screen.

Prototype data lives in your browser's localStorage — each visitor gets their own sandbox. Reset it from **Admin → Settings**.

## Homeowner flow

1. **Choose services** — any of the 19 services in [home_improvement_questionnaire.txt](home_improvement_questionnaire.txt); multiple per request.
2. **Universal questions** (G1–G7) asked once: address, property type, ownership, timeline, objective, priority, access restrictions.
3. **Per-service questions** (10 each + optional free text), one per screen. “Not sure” is always allowed and widens the range instead of forcing false precision.
4. **Satellite measurement** offered where size drives price: gutters (perimeter), roofing (roof area × pitch), siding (wall area), fences (line length), decks and concrete (area).
5. Optional photos (G8), delivery preference (G9), contact details + consent (G10).
6. **Free estimate** per project plus a combined range, with a non-binding disclaimer. Adjacent services are cross-sold only after the estimate (“Add Roofing” appends a project to the same request).
7. **Advanced Report** upsell: required photo slots per project (2 required each), optional notes, then checkout (**payment placeholder**). The homeowner tracks status and reads the published report at `report.html`.

## Business & team portal ([portal.html](portal.html))

- **Level 1 businesses** — profile with services offered and states served. Created by self sign-up, or pre-built from a license-record CSV import and later claimed.
- **Associates** (membership, **payment placeholder**) — lead board filtered to their services and states; each lead shows city/ZIP, timeline, and estimate range. Contact details, full answers, and photos unlock per lead (**payment placeholder**). Only homeowners who opted in to sharing appear as leads.
- **Experts** — queue of purchased Advanced Reports: review answers and photos, set per-project ranges, add line items and notes, save drafts, publish to the homeowner.
- **Admins** — all of the above plus CSV import (license number/type → services mapping, duplicate skipping), business verification, **price book** (per-service unit prices and per-state multipliers), pricing settings (report, membership, lead unlock), and compliance exports.

## Pricing engine

Each service has a pricing model in [catalog.js](catalog.js): base unit range (per linear ft / sq ft / unit / job), answer-based multipliers and add-ons, a minimum job size, a regional multiplier by state, and adjustments from universal answers (e.g. historic property, premium priority).

> ⚠ **All price values are placeholders.** They're admin-editable in the price book and must be replaced with vetted data before launch.

Pricing-data research: no free API provides consumer-facing remodeling prices. Cost vs Value (Zonda/JLC) is copyrighted, has no API, and covers ~20 fixed-scope projects; RSMeans (from $396/yr) has unit costs and location factors for 970 locations but needs an enterprise license to show derived prices publicly; Angi/HomeAdvisor/Homewyse prohibit scraping. The price book is structured so licensed data can be loaded into it later.

## Data model (CRM-ready)

- `submissions` — contact, address, universal answers, `projects[]` (service, answers, estimate), optional `advanced` (photos, payment reference, expert report). Exports as HubSpot contacts plus one deal per project.
- `businesses` — profile, license, services, states served, tier, unlocked leads, source (`seed` / `import` / `self`), claimed/verified flags.
- `audit` — every submission, purchase, report publish, lead unlock, import, claim, and settings change, with actor and timestamp.

All data access goes through [store.js](store.js), so moving to a cloud database replaces only that file's read/write internals.

## Satellite measurement stack (free, US-based)

| Function | Service |
|---|---|
| Geocoding | Esri World Geocoder → US Census geocoder fallback |
| Building footprints | FEMA USA Structures → Esri-hosted OpenStreetMap buildings fallback |
| Imagery | Esri World Imagery |
| Map UI | Leaflet |

## Not yet implemented

- Cloud database, real authentication, and business ownership verification for claims.
- Payment processing: Advanced Report, Associate membership, and lead unlocks all use [payments.js](payments.js) placeholders (planned: Stripe Checkout one-time and subscription).
- Notifications (email/text) for estimate delivery and report publication.
- Full-resolution photo storage (prototype keeps small thumbnails in localStorage).
- Licensed pricing data.

## Future implementation plan

- **Mapillary street-level imagery** — free, crowdsourced street-level views beside the satellite map (progressive enhancement; coverage varies).
- **Photogrammetry** — COLMAP from homeowner photos/video, scaled to the satellite trace, to help experts measure.
- **Paid imagery** — Nearmap (5.5–7.5 cm, measurement rights included) when volume justifies it.

## Running locally

Static site, no build step:

```
git clone https://github.com/samuelsavine/online-gutter-quote.git
```

Open `index.html` in a browser (the portal is `portal.html`).
