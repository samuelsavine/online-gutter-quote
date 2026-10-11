"use strict";

/* ========================================================================
   State
   ======================================================================== */
const state = {
  address: {},
  latLng: null,
  gutterFeet: null,
  traceSkipped: false,
  photoCount: 0,
  projectType: null,
  protection: null,
  height: null,
  problems: [],
  fascia: null,
  downspouts: null,
  underground: null,
  reconnect: null,
  special: [],
  contact: {},
  consentMarketing: false,
  timeframe: { start: null, end: null },
};

/* ========================================================================
   Step flow — ordered list with conditional visibility
   ======================================================================== */
const isReplacement = () =>
  state.projectType === "replace-all" || state.projectType === "replace-some";

// Escalation: visible rot, 3+ stories, access obstacles, unusual roof conditions
const needsPhotoReview = () => {
  const roofFlags = ["metal-roof", "steep-roof", "over-30ft", "difficult-access"];
  return (
    state.fascia === "some-damage" ||
    state.fascia === "significant" ||
    state.height === "3-plus" ||
    state.special.some((s) => roofFlags.includes(s))
  );
};

const FLOW = [
  { id: "address" },
  { id: "measure" },
  { id: "projectType" },
  { id: "protection" },
  { id: "height" },
  { id: "problems", when: isReplacement },
  { id: "fascia" },
  { id: "downspouts" },
  { id: "underground" },
  { id: "special" },
  { id: "photos" },
  { id: "contact" },
  { id: "timeframe" },
  { id: "estimate", noProgress: true },
  { id: "done", noProgress: true },
];

// Steps counted in the progress bar (questions only)
const progressSteps = () => FLOW.filter((s) => !s.noProgress && (!s.when || s.when()));
const visibleFlow = () => FLOW.filter((s) => !s.when || s.when());

let currentId = "address";
const history = [];

/* ========================================================================
   DOM helpers
   ======================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const stepEl = (id) => $(`.step[data-step="${id}"]`);

/* ========================================================================
   Navigation
   ======================================================================== */
function showStep(id, { back = false } = {}) {
  $$(".step").forEach((el) => el.classList.remove("active", "anim-back"));
  const el = stepEl(id);
  el.classList.add("active");
  if (back) el.classList.add("anim-back");
  currentId = id;

  if (id === "measure") initMeasureStep();
  if (id === "timeframe") initTimeframeStep();
  if (id === "estimate") renderEstimate();

  updateProgress();
  $("#backBtn").disabled = history.length === 0 || id === "done";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goNext() {
  if (!validateStep(currentId)) return;
  const flow = visibleFlow();
  const idx = flow.findIndex((s) => s.id === currentId);
  if (idx < flow.length - 1) {
    history.push(currentId);
    showStep(flow[idx + 1].id);
  }
}

function goBack() {
  if (!history.length) return;
  showStep(history.pop(), { back: true });
}

function updateProgress() {
  const steps = progressSteps();
  const idx = steps.findIndex((s) => s.id === currentId);
  let pct;
  let label;
  if (idx >= 0) {
    pct = (idx / steps.length) * 100;
    label = `Step ${idx + 1} of ${steps.length}`;
  } else {
    // Interstitial screens (estimate, done) count as complete-ish
    const passed = history.filter((h) => steps.some((s) => s.id === h)).length;
    pct = currentId === "done" ? 100 : (passed / steps.length) * 100;
    label = pct >= 100 ? "Complete" : `${Math.round(pct)}%`;
  }
  $("#progressFill").style.width = `${pct}%`;
  $("#progressLabel").textContent = label;
  $("#progressBar").setAttribute("aria-valuenow", Math.round(pct));
}

/* ========================================================================
   Validation
   ======================================================================== */
function markInvalid(input, bad) {
  input.classList.toggle("invalid", bad);
  if (bad) input.addEventListener("input", () => input.classList.remove("invalid"), { once: true });
}

function validateStep(id) {
  switch (id) {
    case "address": {
      const fields = [$("#addrStreet"), $("#addrCity"), $("#addrState"), $("#addrZip")];
      let ok = true;
      fields.forEach((f) => {
        const bad = !f.value.trim();
        markInvalid(f, bad);
        if (bad) ok = false;
      });
      const zip = $("#addrZip");
      if (ok && !/^\d{5}(-\d{4})?$/.test(zip.value.trim())) {
        markInvalid(zip, true);
        ok = false;
      }
      if (ok) {
        state.address = {
          street: $("#addrStreet").value.trim(),
          city: $("#addrCity").value.trim(),
          state: $("#addrState").value.trim().toUpperCase(),
          zip: zip.value.trim(),
        };
      }
      return ok;
    }
    case "measure": {
      state.gutterFeet = trace.points.length >= 3 ? Math.round(tracePerimeterFeet()) : null;
      return true;
    }
    case "problems":
      return true; // optional multi-select
    case "underground": {
      if (!state.underground) return false;
      if (state.underground === "yes" && !state.reconnect) return false;
      return true;
    }
    case "special":
      return true;
    case "timeframe": {
      const start = $("#tfStart"), end = $("#tfEnd");
      const today = new Date().toISOString().slice(0, 10);
      const startBad = !start.value || start.value < today;
      const endBad = !end.value || end.value < start.value;
      markInvalid(start, startBad);
      markInvalid(end, endBad);
      if (startBad || endBad) return false;
      state.timeframe = { start: start.value, end: end.value };
      return true;
    }
    case "contact": {
      const first = $("#firstName"), last = $("#lastName"), email = $("#email"), phone = $("#phone");
      let ok = true;
      [first, last].forEach((f) => {
        const bad = !f.value.trim();
        markInvalid(f, bad);
        if (bad) ok = false;
      });
      const emailBad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      markInvalid(email, emailBad);
      if (emailBad) ok = false;
      const phoneBad = (phone.value.replace(/\D/g, "").length < 10);
      markInvalid(phone, phoneBad);
      if (phoneBad) ok = false;
      if (ok) {
        state.contact = {
          firstName: first.value.trim(),
          lastName: last.value.trim(),
          email: email.value.trim(),
          phone: phone.value.trim(),
        };
        state.consentMarketing = $("#consentMarketing").checked;
      }
      return ok;
    }
    default: {
      // radio steps require a selection
      const group = $(`.step[data-step="${id}"] [data-type="radio"]`);
      if (group) return !!state[group.dataset.field];
      return true;
    }
  }
}

/* ========================================================================
   Option groups (radios & checkboxes)
   ======================================================================== */
$$(".options").forEach((group) => {
  const field = group.dataset.field;
  const type = group.dataset.type;
  const exclusive = (group.dataset.exclusive || "").split(",").filter(Boolean);

  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".option");
    if (!btn) return;
    const value = btn.dataset.value;

    if (type === "radio") {
      $$(".option", group).forEach((o) => o.classList.remove("selected"));
      btn.classList.add("selected");
      state[field] = value;

      if (field === "underground") {
        $("#undergroundFollowup").classList.toggle("hidden", value !== "yes");
        if (value !== "yes") {
          state.reconnect = null;
          $$('#undergroundFollowup .option').forEach((o) => o.classList.remove("selected"));
        }
      }

      if (group.hasAttribute("data-autoadvance")) {
        setTimeout(goNext, 280);
      }
    } else {
      // checkbox
      const selected = new Set(state[field]);
      if (selected.has(value)) {
        selected.delete(value);
        btn.classList.remove("selected");
      } else {
        if (exclusive.includes(value)) {
          selected.clear();
          $$(".option", group).forEach((o) => o.classList.remove("selected"));
        } else {
          exclusive.forEach((ex) => {
            selected.delete(ex);
            const exBtn = $(`.option[data-value="${ex}"]`, group);
            if (exBtn) exBtn.classList.remove("selected");
          });
        }
        selected.add(value);
        btn.classList.add("selected");
      }
      state[field] = [...selected];
    }
  });
});

/* ========================================================================
   Gutter trace — satellite map + auto footprint + editable outline
   ======================================================================== */
const trace = { map: null, points: [], polygon: null, markers: [], geocoded: null };

const FT_PER_M = 3.28084;

function haversineMeters(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function tracePerimeterFeet() {
  const pts = trace.points;
  if (pts.length < 2) return 0;
  let m = 0;
  for (let i = 0; i < pts.length; i++) {
    m += haversineMeters(pts[i], pts[(i + 1) % pts.length]);
  }
  return m * FT_PER_M;
}

function setMapStatus(text) {
  const el = $("#mapStatus");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

// Strip unit designators that confuse exact-match geocoders
function cleanStreet(street) {
  return street.replace(/\s+(apt|apartment|unit|suite|ste|#|lot|trlr)\.?\s*\S*$/i, "").trim();
}

async function esriGeocode(oneline) {
  const params = new URLSearchParams({
    f: "json", singleLine: oneline, maxLocations: "1", countryCode: "USA", outFields: "Addr_type",
  });
  const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const c = data.candidates?.[0];
  if (!c || c.score < 80) return null;
  return { lat: c.location.y, lng: c.location.x, rooftop: c.attributes?.Addr_type === "PointAddress" };
}

async function censusGeocode(oneline) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(oneline)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const match = data.result?.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, rooftop: false };
}

async function geocodeAddress() {
  const { street, city, state: st, zip } = state.address;
  const attempts = [
    () => esriGeocode(`${street}, ${city}, ${st} ${zip}`),
    () => esriGeocode(`${cleanStreet(street)}, ${city}, ${st} ${zip}`),
    () => censusGeocode(`${street}, ${city}, ${st} ${zip}`),
    () => censusGeocode(`${cleanStreet(street)}, ${city}, ${st} ${zip}`),
    () => censusGeocode(`${cleanStreet(street)}, ${zip}`),
    () => esriGeocode(`${zip}`).then((r) => r && { ...r, zipOnly: true }),
  ];
  for (const attempt of attempts) {
    const hit = await attempt().catch(() => null);
    if (hit) return hit;
  }
  throw new Error("address not found");
}

// FEMA USA Structures (US government dataset, hosted on Esri ArcGIS)
const FOOTPRINT_URL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query";

async function fetchFootprint(lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    f: "geojson",
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMeters),
    units: "esriSRUnit_Meter",
    outFields: "OBJECTID",
    returnGeometry: "true",
  });
  const res = await fetch(`${FOOTPRINT_URL}?${params}`);
  if (!res.ok) throw new Error("footprint query failed");
  const data = await res.json();
  const polys = (data.features || []).filter((f) => f.geometry?.type === "Polygon");
  if (!polys.length) return null;
  // Nearest building by centroid distance
  let best = null, bestDist = Infinity;
  for (const f of polys) {
    const ring = f.geometry.coordinates[0];
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const d = haversineMeters({ lat, lng }, { lat: cy, lng: cx });
    if (d < bestDist) { bestDist = d; best = ring; }
  }
  const pts = best.map((p) => ({ lat: p[1], lng: p[0] }));
  if (pts.length > 1 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) {
    pts.pop();
  }
  return pts;
}

function updateTraceUI() {
  const ft = Math.round(tracePerimeterFeet());
  const badge = $("#footageBadge");
  badge.classList.toggle("hidden", trace.points.length < 3);
  $("#footageValue").textContent = ft.toLocaleString("en-US");
  redrawTrace();
}

function redrawTrace() {
  const { map } = trace;
  if (trace.polygon) { trace.polygon.remove(); trace.polygon = null; }
  trace.markers.forEach((m) => m.remove());
  trace.markers = [];
  if (!map) return;

  if (trace.points.length >= 2) {
    trace.polygon = L.polygon(trace.points, {
      color: "#38bdf8", weight: 3, fillColor: "#38bdf8", fillOpacity: 0.12,
    }).addTo(map);
  }

  trace.points.forEach((pt, i) => {
    const marker = L.marker(pt, {
      draggable: true,
      icon: L.divIcon({ className: "vertex-handle", iconSize: [14, 14] }),
    }).addTo(map);
    marker.on("drag", (e) => {
      trace.points[i] = e.target.getLatLng();
      if (trace.polygon) trace.polygon.setLatLngs(trace.points);
      const ft = Math.round(tracePerimeterFeet());
      $("#footageValue").textContent = ft.toLocaleString("en-US");
    });
    marker.on("dragend", updateTraceUI);
    marker.on("dblclick", () => {
      trace.points.splice(i, 1);
      updateTraceUI();
    });
    trace.markers.push(marker);
  });
}

async function initMeasureStep() {
  const mapDiv = $("#traceMap");

  if (!trace.map) {
    trace.map = L.map(mapDiv, { zoomControl: true, attributionControl: true, doubleClickZoom: false });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri" }
    ).addTo(trace.map);
    trace.map.on("click", (e) => {
      trace.points.push(e.latlng);
      updateTraceUI();
    });
  }
  // Leaflet needs a size recalc after the step becomes visible
  setTimeout(() => trace.map.invalidateSize(), 50);

  const addrKey = JSON.stringify(state.address);
  if (trace.geocoded === addrKey) return; // same address, keep existing trace
  trace.geocoded = addrKey;
  trace.points = [];
  updateTraceUI();

  setMapStatus("Locating your home…");
  try {
    const loc = await geocodeAddress();
    state.latLng = { lat: loc.lat, lng: loc.lng };

    if (loc.zipOnly) {
      trace.map.setView([loc.lat, loc.lng], 15);
      setMapStatus("");
      $("#measureHint").textContent =
        "We found your ZIP area but not the exact address. Zoom to your home and click the corners of your roofline — or skip this step.";
      return;
    }

    trace.map.setView([loc.lat, loc.lng], 20);
    setMapStatus("Looking up your home’s outline…");
    // Street-interpolated points can sit well away from the structure
    const radius = loc.rooftop ? 40 : 100;
    const footprint = await fetchFootprint(loc.lat, loc.lng, radius).catch(() => null);
    if (footprint) {
      trace.points = footprint;
      trace.map.fitBounds(L.latLngBounds(footprint).pad(0.4));
      $("#measureHint").textContent =
        "We found your home’s outline. Drag the corner handles to match where gutters go, click the map to add corners, double-click a handle to remove it.";
    } else {
      $("#measureHint").textContent =
        "We couldn’t auto-detect your home’s outline. Click the corners of your roofline on the map to trace where gutters go.";
    }
    setMapStatus("");
    updateTraceUI();
  } catch {
    setMapStatus("");
    trace.map.setView([39.5, -98.35], 4); // US overview fallback
    $("#measureHint").textContent =
      "We couldn’t locate that address automatically. Zoom to your home and click the corners of your roofline — or skip this step.";
  }
}

$("#undoPointBtn").addEventListener("click", () => {
  trace.points.pop();
  updateTraceUI();
});

$("#clearTraceBtn").addEventListener("click", () => {
  trace.points = [];
  updateTraceUI();
});

/* ========================================================================
   Pricing — preliminary heuristic, never presented as final
   ======================================================================== */
function estimateRange() {
  // Per-foot pricing when the user confirmed a trace; flat baseline otherwise
  let low, high;
  const heightMult = { "1-story": 1, "2-story": 1.35, "3-plus": 1.7, combo: 1.3 }[state.height] || 1.2;

  if (state.gutterFeet) {
    low = state.gutterFeet * 9 * heightMult;
    high = state.gutterFeet * 13 * heightMult;
  } else {
    low = 1400 * heightMult;
    high = 2400 * heightMult;
    if (state.projectType === "replace-some") { low *= 0.55; high *= 0.7; }
  }

  if (state.fascia === "some-damage") { high += 500; }
  if (state.fascia === "significant") { low += 400; high += 1200; }

  if (state.downspouts === "improve") { high += 350; }
  if (state.underground === "yes" && state.reconnect === "yes") { low += 150; high += 450; }

  const specialAdders = { "screened-porch": 250, "pool-enclosure": 300, "metal-roof": 400, "steep-roof": 350, "over-30ft": 600, "difficult-access": 300 };
  state.special.forEach((s) => { if (specialAdders[s]) high += specialAdders[s]; });

  const round50 = (n) => Math.round(n / 50) * 50;
  const guardsLow = round50(low * 1.45), guardsHigh = round50(high * 1.5);
  low = round50(low);
  high = round50(high);

  return { low, high, guardsLow, guardsHigh };
}

const fmt = (n) => "$" + n.toLocaleString("en-US");

function renderEstimate() {
  const { low, high, guardsLow, guardsHigh } = estimateRange();
  const alt = $("#estimateAlt");

  const photoNote = state.photoCount > 0 ? " Your photos will speed up verification." : "";
  $("#estimateBasis").textContent = state.gutterFeet
    ? `Based on your confirmed outline (~${state.gutterFeet} ft of gutter run):${photoNote}`
    : `Based on the information you provided:${photoNote}`;

  if (state.protection === "gutters-guards") {
    $("#estimateRange").textContent = `${fmt(guardsLow)}–${fmt(guardsHigh)}`;
    alt.classList.add("hidden");
  } else if (state.protection === "both-pricing") {
    $("#estimateRange").textContent = `${fmt(low)}–${fmt(high)}`;
    alt.textContent = `With gutter guards: ${fmt(guardsLow)}–${fmt(guardsHigh)}`;
    alt.classList.remove("hidden");
  } else {
    $("#estimateRange").textContent = `${fmt(low)}–${fmt(high)}`;
    alt.classList.add("hidden");
  }

  const deposit = Store.settings().depositAmount;
  $("#depositExplain").textContent =
    `Lock in your estimate and get matched with a vetted local contractor with a refundable $${deposit} deposit.`;
  $("#depositBtn").textContent = `Reserve my quote — $${deposit} deposit`;
}

/* ========================================================================
   Timeframe
   ======================================================================== */
function initTimeframeStep() {
  const today = new Date().toISOString().slice(0, 10);
  $("#tfStart").min = today;
  $("#tfEnd").min = today;
  if (!$("#tfStart").value) $("#tfStart").value = today;
}

$("#tfPresets").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-days]");
  if (!btn) return;
  $$("#tfPresets .option").forEach((o) => o.classList.remove("selected"));
  btn.classList.add("selected");
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + parseInt(btn.dataset.days, 10));
  $("#tfStart").value = start.toISOString().slice(0, 10);
  $("#tfEnd").value = end.toISOString().slice(0, 10);
});

/* ========================================================================
   Deposit → qualified lead → job posted to contractor board
   ======================================================================== */
function customerJobAmount() {
  const { low, high, guardsLow, guardsHigh } = estimateRange();
  const withGuards = state.protection === "gutters-guards";
  return withGuards
    ? Math.round((guardsLow + guardsHigh) / 2 / 50) * 50
    : Math.round((low + high) / 2 / 50) * 50;
}

async function handleDeposit() {
  const deposit = Store.settings().depositAmount;
  const result = await Payments.checkout({
    amount: deposit,
    description: `Refundable deposit — gutter installation at ${state.address.street}`,
    lineItems: [{ label: "Qualified-lead deposit (credited to job)", amount: deposit }],
  });
  if (result.status !== "succeeded") return;

  const actor = state.contact.email;
  const contact = Store.addContact(
    { ...state.contact, address: state.address, marketingConsent: state.consentMarketing },
    actor
  );
  const { low, high } = estimateRange();
  const region = Store.regionFor(state.address);
  const job = Store.addJob({
    contactId: contact.id,
    address: state.address,
    region: region ? region.code : null,
    details: {
      projectType: state.projectType,
      protection: state.protection,
      height: state.height,
      problems: state.problems,
      fascia: state.fascia,
      downspouts: state.downspouts,
      underground: state.underground,
      reconnect: state.reconnect,
      special: state.special,
    },
    gutterFeet: state.gutterFeet,
    photosProvided: state.photoCount > 0,
    photoCount: state.photoCount,
    estimateLow: low,
    estimateHigh: high,
    amount: customerJobAmount(),
    timeframe: state.timeframe,
  }, actor);
  Store.addPayment(job.id, {
    type: "deposit",
    amount: deposit,
    stripeId: result.id,
    split: Payments.computeSplit(job, "deposit"),
  }, actor);

  $("#trackJobLink").href = `job.html?job=${job.id}&email=${encodeURIComponent(contact.email)}`;
  history.push(currentId);
  showStep("done");
}

/* ========================================================================
   Photo slots
   ======================================================================== */
$$(".photo-slot input").forEach((input) => {
  input.addEventListener("change", () => {
    const slot = input.closest(".photo-slot");
    if (input.files.length && !slot.classList.contains("filled")) {
      slot.classList.add("filled");
      slot.querySelector(".photo-icon").textContent = "✅";
      state.photoCount++;
    }
  });
});

/* ========================================================================
   Wiring
   ======================================================================== */
$$("[data-start]").forEach((btn) =>
  btn.addEventListener("click", () => {
    $("#hero").classList.add("hidden");
    $("#quiz").classList.remove("hidden");
    showStep("address");
  })
);

$$("[data-next]").forEach((btn) => btn.addEventListener("click", goNext));
$("#backBtn").addEventListener("click", goBack);
$("#depositBtn").addEventListener("click", handleDeposit);

$("#skipMeasureBtn").addEventListener("click", () => {
  state.traceSkipped = true;
  trace.points = [];
  updateTraceUI();
  goNext();
});

// Enter advances text-input steps
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("input[type='text'], input[type='email'], input[type='tel']")) {
    e.preventDefault();
    goNext();
  }
});
