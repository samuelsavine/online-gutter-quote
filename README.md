# EZ Gutter Quote — Online Gutter Quote Mockup

**Live demo:** https://samuelsavine.github.io/online-gutter-quote/

A customer-facing questionnaire (MVP v1.0) that produces a preliminary gutter installation estimate online — no tape measure, no ladder, no in-home sales presentation.

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
- Photo verification step triggers on escalation flags (visible rot/fascia damage, 3+ stories, metal/steep roof, gutters over 30 ft, difficult access) — or when the user opts into the photo "boost accuracy" path.

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
- Final quote screen with scope, exclusions, warranty, installer identity, payment terms, and flags for conditions requiring site verification.

### Compliance details
- Marketing consent is separate, optional, and never prechecked; operational quote communications are explained separately.
- Algorithmic estimates are never presented as guaranteed prices before verification.

## Not yet implemented
- Automated measurement from uploaded photos (upload UI is a stub; no model runs). Researched options: Hover API for production-grade photo→measurement, or a scale cross-check against the satellite trace. Single photos carry no absolute scale, so a free pipeline requires a reference dimension or a GPU photogrammetry backend.
- Backend/CRM: no data is persisted or sent anywhere — this is a front-end mockup.
- Address autocomplete.

## Running locally

Static site, no build step:

```
git clone https://github.com/samuelsavine/online-gutter-quote.git
```

Open `index.html` in a browser.
