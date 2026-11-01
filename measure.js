"use strict";

/* ========================================================================
   Satellite measurement tool (Esri imagery + Census/Esri geocoding +
   FEMA/OSM footprints). Usage:
     const r = await Measure.open({ address, mode });   // r = {value, unit} | null
   Modes: perimeter (lf) · line (lf) · area (sqft) · roof (sqft) · wall (sqft)
   ======================================================================== */

const Measure = (() => {
  const FT_PER_M = 3.28084;
  const MODES = {
    perimeter: { unit: "lf", closed: true, auto: true, title: "Trace where the gutters go", hint: "Drag corners to match the roofline edges. Click the map to add corners; double-click a corner to remove it." },
    line: { unit: "lf", closed: false, auto: false, title: "Trace the fence line", hint: "Click along the fence path. Use “Add section” for a separate run; double-click a point to remove it." },
    area: { unit: "sqft", closed: true, auto: false, title: "Outline the project area", hint: "Click the corners of the deck, patio, or driveway area." },
    roof: { unit: "sqft", closed: true, auto: true, title: "Confirm the roof outline", hint: "Adjust the outline to the roof edges (including overhangs). Pick the roof pitch below." },
    wall: { unit: "sqft", closed: true, auto: true, title: "Confirm the house outline", hint: "Adjust the outline to the exterior walls. Wall area is estimated from perimeter × stories." },
  };
  const PITCH = { Low: 1.05, Moderate: 1.15, Steep: 1.35 };
  const STORY_FT = 9;

  const geoCache = {};
  let st = null;

  /* ---------- geometry ---------- */
  function haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function lengthM(pts, closed) {
    if (pts.length < 2) return 0;
    let m = 0;
    for (let i = 0; i < pts.length - 1; i++) m += haversine(pts[i], pts[i + 1]);
    if (closed && pts.length >= 3) m += haversine(pts[pts.length - 1], pts[0]);
    return m;
  }
  function areaM2(pts) {
    if (pts.length < 3) return 0;
    const lat0 = pts[0].lat * Math.PI / 180;
    const xy = pts.map((p) => [p.lng * 111320 * Math.cos(lat0), p.lat * 110540]);
    let s = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }

  function computeValue() {
    const m = MODES[st.mode];
    const polys = st.polys.filter((p) => p.length >= (m.closed ? 3 : 2));
    if (!polys.length) return 0;
    const perimFt = polys.reduce((s, p) => s + lengthM(p, m.closed), 0) * FT_PER_M;
    const areaFt2 = polys.reduce((s, p) => s + areaM2(p), 0) * FT_PER_M * FT_PER_M;
    switch (st.mode) {
      case "perimeter":
      case "line": return Math.round(perimFt);
      case "area": return Math.round(areaFt2);
      case "roof": return Math.round(areaFt2 * PITCH[st.pitch]);
      case "wall": return Math.round(perimFt * STORY_FT * st.stories * 0.85); // ~15% windows/doors
    }
    return 0;
  }

  /* ---------- geocoding + footprints ---------- */
  const cleanStreet = (s) => s.replace(/\s+(apt|apartment|unit|suite|ste|#|lot|trlr)\.?\s*\S*$/i, "").trim();

  async function esriGeocode(oneline) {
    const params = new URLSearchParams({ f: "json", singleLine: oneline, maxLocations: "1", countryCode: "USA", outFields: "Addr_type" });
    const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
    if (!res.ok) return null;
    const c = (await res.json()).candidates?.[0];
    if (!c || c.score < 80) return null;
    return { lat: c.location.y, lng: c.location.x, rooftop: c.attributes?.Addr_type === "PointAddress" };
  }
  async function censusGeocode(oneline) {
    const res = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(oneline)}&benchmark=Public_AR_Current&format=json`);
    if (!res.ok) return null;
    const m = (await res.json()).result?.addressMatches?.[0];
    return m ? { lat: m.coordinates.y, lng: m.coordinates.x, rooftop: false } : null;
  }
  async function geocode(a) {
    const key = JSON.stringify(a);
    if (geoCache[key]) return geoCache[key];
    const full = `${a.street}, ${a.city}, ${a.state} ${a.zip}`;
    const clean = `${cleanStreet(a.street)}, ${a.city}, ${a.state} ${a.zip}`;
    const attempts = [
      () => esriGeocode(full), () => esriGeocode(clean), () => censusGeocode(full), () => censusGeocode(clean),
      () => esriGeocode(a.zip).then((r) => r && { ...r, zipOnly: true }),
    ];
    for (const at of attempts) {
      const hit = await at().catch(() => null);
      if (hit) { geoCache[key] = hit; return hit; }
    }
    return null;
  }

  // FEMA USA Structures first (US gov), then Esri-hosted live OSM buildings for newer homes
  const FOOTPRINT_SOURCES = [
    "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query",
    "https://services6.arcgis.com/Do88DoK2xjTUCXd1/arcgis/rest/services/OSM_NA_Buildings/FeatureServer/0/query",
  ];
  async function footprint(lat, lng, radius) {
    const params = new URLSearchParams({
      f: "geojson", geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects", distance: String(radius), units: "esriSRUnit_Meter",
      outFields: "OBJECTID", returnGeometry: "true",
    });
    for (const src of FOOTPRINT_SOURCES) {
      try {
        const res = await fetch(`${src}?${params}`);
        if (!res.ok) continue;
        const polys = ((await res.json()).features || []).filter((f) => f.geometry?.type === "Polygon");
        if (!polys.length) continue;
        let best = null, bestD = Infinity;
        for (const f of polys) {
          const ring = f.geometry.coordinates[0];
          const c = { lat: ring.reduce((s, p) => s + p[1], 0) / ring.length, lng: ring.reduce((s, p) => s + p[0], 0) / ring.length };
          const d = haversine({ lat, lng }, c);
          if (d < bestD) { bestD = d; best = ring; }
        }
        const pts = best.map((p) => ({ lat: p[1], lng: p[0] }));
        const f0 = pts[0], fl = pts[pts.length - 1];
        if (pts.length > 1 && f0.lat === fl.lat && f0.lng === fl.lng) pts.pop();
        return pts;
      } catch { /* next source */ }
    }
    return null;
  }

  /* ---------- UI ---------- */
  function buildModal(mode) {
    const m = MODES[mode];
    const el = document.createElement("div");
    el.className = "measure-overlay";
    el.innerHTML = `
      <div class="measure-modal" role="dialog" aria-modal="true" aria-label="${m.title}">
        <div class="measure-head">
          <h3>${m.title}</h3>
          <button class="btn btn-ghost btn-sm" data-act="cancel">Close</button>
        </div>
        <p class="step-hint measure-hint">${m.hint}</p>
        <div class="map-wrap measure-map-wrap">
          <div class="measure-map"></div>
          <div class="map-overlay">Locating the property…</div>
          <div class="footage-badge hidden"><span class="mv">0</span> ${m.unit === "lf" ? "linear ft" : "sq ft"}</div>
        </div>
        <div class="map-controls">
          <button class="btn btn-ghost btn-sm" data-act="add">+ Add section</button>
          <button class="btn btn-ghost btn-sm" data-act="undo">Undo point</button>
          <button class="btn btn-ghost btn-sm" data-act="clear">Clear</button>
          ${mode === "roof" ? `<label class="inline-select">Roof pitch
            <select data-act="pitch">${Object.keys(PITCH).map((p) => `<option ${p === "Moderate" ? "selected" : ""}>${p}</option>`).join("")}</select></label>` : ""}
          ${mode === "wall" ? `<label class="inline-select">Stories
            <select data-act="stories"><option>1</option><option selected>2</option><option>3</option></select></label>` : ""}
        </div>
        <button class="btn btn-primary" data-act="use">Use this measurement</button>
      </div>`;
    return el;
  }

  function setStatus(text) {
    const o = st.el.querySelector(".map-overlay");
    o.textContent = text;
    o.classList.toggle("hidden", !text);
  }

  function refresh() {
    const v = computeValue();
    const badge = st.el.querySelector(".footage-badge");
    badge.classList.toggle("hidden", !v);
    st.el.querySelector(".mv").textContent = v.toLocaleString("en-US");
    redraw();
  }

  function redraw() {
    const closed = MODES[st.mode].closed;
    st.layers.forEach((l) => l.remove());
    st.layers = [];
    st.polys.forEach((pts, pi) => {
      const active = pi === st.active;
      const color = active ? "#38bdf8" : "#818cf8";
      if (pts.length >= 2) {
        const shape = closed
          ? L.polygon(pts, { color, weight: 3, fillColor: color, fillOpacity: 0.12 })
          : L.polyline(pts, { color, weight: 4 });
        shape.addTo(st.map).on("click", (e) => { L.DomEvent.stop(e); st.active = pi; redraw(); });
        st.layers.push(shape);
      }
      pts.forEach((pt, i) => {
        const mk = L.marker(pt, {
          draggable: true,
          icon: L.divIcon({ className: `vertex-handle${active ? "" : " vertex-dim"}`, iconSize: [14, 14] }),
        }).addTo(st.map);
        mk.on("dragend", (e) => { pts[i] = e.target.getLatLng(); refresh(); });
        mk.on("dblclick", (e) => { L.DomEvent.stop(e); pts.splice(i, 1); refresh(); });
        st.layers.push(mk);
      });
    });
  }

  async function locate() {
    const m = MODES[st.mode];
    const loc = st.address ? await geocode(st.address) : null;
    if (!loc) {
      st.map.setView([39.5, -98.35], 4);
      setStatus("");
      st.el.querySelector(".measure-hint").textContent = "We couldn’t locate the address. Zoom to the property and click to trace.";
      return;
    }
    st.map.setView([loc.lat, loc.lng], loc.zipOnly ? 15 : 20);
    if (m.auto && !loc.zipOnly) {
      setStatus("Looking up the building outline…");
      const fp = await footprint(loc.lat, loc.lng, loc.rooftop ? 40 : 100).catch(() => null);
      if (fp) {
        st.polys = [fp];
        st.map.fitBounds(L.latLngBounds(fp).pad(0.4));
      } else {
        st.el.querySelector(".measure-hint").textContent = "No outline found for this building — click the corners to trace it.";
      }
    }
    setStatus("");
    refresh();
  }

  function open({ address, mode }) {
    return new Promise((resolve) => {
      const el = buildModal(mode);
      document.body.appendChild(el);
      st = { el, mode, address, polys: [[]], active: 0, layers: [], pitch: "Moderate", stories: 2 };
      st.map = L.map(el.querySelector(".measure-map"), { doubleClickZoom: false });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri" }).addTo(st.map);
      st.map.on("click", (e) => { st.polys[st.active].push(e.latlng); refresh(); });
      setTimeout(() => st.map.invalidateSize(), 50);

      const finish = (result) => { st.map.remove(); el.remove(); st = null; resolve(result); };
      el.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "cancel") finish(null);
        if (act === "use") {
          const v = computeValue();
          if (v > 0) finish({ value: v, unit: MODES[mode].unit, mode });
        }
        if (act === "add") { st.polys.push([]); st.active = st.polys.length - 1; refresh(); }
        if (act === "undo") { st.polys[st.active].pop(); refresh(); }
        if (act === "clear") { st.polys = [[]]; st.active = 0; refresh(); }
      });
      el.addEventListener("change", (e) => {
        if (e.target.dataset.act === "pitch") { st.pitch = e.target.value; refresh(); }
        if (e.target.dataset.act === "stories") { st.stories = parseInt(e.target.value, 10); refresh(); }
      });
      locate();
    });
  }

  return { open, geocode };
})();
