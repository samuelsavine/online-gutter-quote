"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const GENERAL_QS = UNIVERSAL.filter((q) => ["G2", "G3", "G4"].includes(q.id)).map((q) => ({
  id: q.id, text: q.t, type: q.type, options: q.o.map((label) => ({ id: slug(label), label, mod: { type: "none" } })),
}));

const state = {
  categoryId: null, address: {}, latLng: null, universal: {}, answers: {},
  optIn: null, contact: null, projectId: null, photos: [],
};
let steps = [];
let idx = 0;
const hist = [];

const cat = () => Store.category(state.categoryId);
const optionsOf = (q) => q.options.map((o) => o.label);

/* ---------- step list ---------- */
function buildSteps() {
  const c = cat();
  const variant = Analytics.variant();
  steps = [
    { kind: "category" },
    { kind: "address" },
    { kind: "confirm" },
    ...GENERAL_QS.map((q) => ({ kind: "question", q, general: true })),
    ...(c ? c.questions.filter((q) => q.stage === "short").map((q) => ({ kind: "question", q })) : []),
    ...(variant === "A_before" ? [{ kind: "optin" }] : []),
    { kind: "report" },
  ];
}

/* ---------- navigation ---------- */
function show(i, back = false) {
  idx = i;
  const step = steps[idx];
  const view = $("#stepView");
  view.className = `step ${back ? "anim-back" : "anim"}`;
  view.innerHTML = "";
  RENDER[step.kind](view, step);
  progress();
  $("#backBtn").disabled = !hist.length || ["report", "photos", "account", "ownership"].includes(step.kind);
  window.scrollTo({ top: 0, behavior: "smooth" });
  Analytics.track("step_view", { step: step.q ? step.q.id : step.kind, categoryId: state.categoryId });
}
function next() { hist.push(idx); if (steps[idx].kind === "category") buildSteps(); show(idx + 1); }
function back() { if (hist.length) show(hist.pop(), true); }
function goKind(kind) { hist.push(idx); steps.push({ kind }); show(steps.length - 1); }

function progress() {
  const reportAt = steps.findIndex((s) => s.kind === "report");
  const pct = reportAt > 0 ? Math.min(100, Math.round((Math.min(idx, reportAt) / reportAt) * 100)) : 0;
  $("#progressFill").style.width = `${pct}%`;
  $("#progressBar").setAttribute("aria-valuenow", pct);
  $("#progressLabel").textContent = idx >= reportAt ? "Your price" : `${pct}%`;
}

/* ---------- helpers ---------- */
const head = (tag, title, hint = "") => {
  const c = cat();
  return `${c ? `<div class="step-cat">${c.icon} ${escHtml(c.name)}</div>` : ""}
    <span class="step-tag">${escHtml(tag)}</span><h2>${escHtml(title)}</h2>${hint ? `<p class="hint">${hint}</p>` : ""}`;
};
const nextBtn = (label = "Continue") => `<button class="btn btn-primary" data-go>${label}</button>`;
function invalid(el, bad) { el.classList.toggle("invalid", bad); if (bad) el.addEventListener("input", () => el.classList.remove("invalid"), { once: true }); }
const answerOf = (step) => (step.general ? state.universal : state.answers)[step.q.id];
const setAnswer = (step, v) => { (step.general ? state.universal : state.answers)[step.q.id] = v; };
const EXCLUSIVE = /^(none|no|no repairs)$|unsure|unknown|not sure/i;

/* ---------- renderers ---------- */
const RENDER = {
  category(view) {
    view.innerHTML = `${head("Step 1", "What project are you pricing?")}
      <div class="category-grid">${Store.activeCategories().map((c) => `
        <button class="category-tile ${state.categoryId === c.id ? "selected" : ""}" data-cat="${c.id}">
          <span class="category-icon">${c.icon}</span><span>${escHtml(c.name)}</span></button>`).join("")}</div>`;
    $$("[data-cat]", view).forEach((b) => b.addEventListener("click", () => {
      if (state.categoryId !== b.dataset.cat) state.answers = {};
      state.categoryId = b.dataset.cat;
      Analytics.track("category_select", { categoryId: state.categoryId });
      next();
    }));
  },

  address(view) {
    const a = state.address;
    view.innerHTML = `${head("Your home", "Where is the project?")}
      <div class="field"><label for="aStreet">Street address</label><input id="aStreet" autocomplete="street-address" value="${escHtml(a.street || "")}" /></div>
      <div class="row">
        <div class="field"><label for="aCity">City</label><input id="aCity" autocomplete="address-level2" value="${escHtml(a.city || "")}" /></div>
        <div class="field sm"><label for="aState">State</label><input id="aState" maxlength="2" autocomplete="address-level1" value="${escHtml(a.state || "")}" /></div>
        <div class="field sm"><label for="aZip">ZIP</label><input id="aZip" inputmode="numeric" maxlength="10" autocomplete="postal-code" value="${escHtml(a.zip || "")}" /></div>
      </div>${nextBtn()}`;
    $("[data-go]", view).addEventListener("click", () => {
      const v = (id) => $(id, view).value.trim();
      const f = { street: v("#aStreet"), city: v("#aCity"), state: v("#aState").toUpperCase(), zip: v("#aZip") };
      const bad = { "#aStreet": !f.street, "#aCity": !f.city, "#aState": !/^[A-Z]{2}$/.test(f.state), "#aZip": !/^\d{5}(-\d{4})?$/.test(f.zip) };
      Object.entries(bad).forEach(([s, b]) => invalid($(s, view), b));
      if (Object.values(bad).some(Boolean)) return;
      if (JSON.stringify(f) !== JSON.stringify(state.address)) state.latLng = null;
      state.address = f;
      next();
    });
  },

  confirm(view) {
    const a = state.address;
    const earthUrl = `https://earth.google.com/web/search/${encodeURIComponent(`${a.street}, ${a.city}, ${a.state} ${a.zip}`)}`;
    view.innerHTML = `${head("Confirm", "Is this your home?", "Drag the pin if it’s not on your house.")}
      <div class="confirm-map" id="confirmMap"><div class="map-status">Finding your home…</div></div>
      <p class="hint">Want to measure it yourself? <a href="${earthUrl}" target="_blank" rel="noopener noreferrer">Open your home in Google Earth</a>
        and use its ruler tool — then enter the number when we ask.</p>
      ${nextBtn("Yes, that’s my home")}`;
    $("[data-go]", view).addEventListener("click", next);
    (async () => {
      const loc = state.latLng || await Measure.geocode(a);
      const el = $("#confirmMap");
      if (!el) return;
      el.innerHTML = "";
      const center = loc ? [loc.lat, loc.lng] : [39.5, -98.35];
      const map = L.map(el, { zoomControl: true }).setView(center, loc ? 19 : 4);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri" }).addTo(map);
      const pin = L.marker(center, { draggable: true }).addTo(map);
      state.latLng = { lat: center[0], lng: center[1] };
      pin.on("dragend", () => { const p = pin.getLatLng(); state.latLng = { lat: p.lat, lng: p.lng }; });
    })();
  },

  question(view, step) {
    const q = step.q;
    view.innerHTML = `${head(step.general ? "About your home" : "Your project", q.text)}<div class="q-body"></div>`;
    QUESTION[q.type](view.querySelector(".q-body"), step, answerOf(step));
  },

  optin(view) {
    view.innerHTML = `${head("Optional", "Want vetted local pros to contact you?", "We’ll share your project with up to 3 local businesses who service it. You can still see your free price either way.")}
      ${optinForm()}`;
    bindOptin(view, next);
  },

  report(view) {
    const c = cat();
    const project = saveProject();
    const result = project.free;
    const s = Store.settings();
    const showOptinCard = Analytics.variant() === "B_after" && state.optIn === null;
    view.className = "step report-step";
    view.innerHTML = `
      <div class="card report-card">
        <div class="step-cat">${c.icon} ${escHtml(c.name)}</div>
        <h2>Your free price</h2>
        ${Report.tierCards(c, result)}
        ${Report.summary(c, project, result)}
        ${Report.disclaimer}
      </div>

      ${showOptinCard ? `<div class="card optin-card" id="optinCard">
        <h3>Want vetted local pros to contact you?</h3>
        <p class="hint">We’ll share your project with up to 3 local businesses who service it.</p>
        ${optinForm()}</div>` : ""}

      <div class="card upsell-card">
        <span class="badge badge-accent">Limited-time launch special</span>
        <h3>Unlock your full Project Report</h3>
        <div class="price-strike"><s>${fmtUsd(s.paidTierListPrice)}</s> <strong>${s.paidTierPrice ? fmtUsd(s.paidTierPrice) : "$0"}</strong></div>
        <ul class="check-list">
          <li>Refined Good / Better / Best ranges with the reasoning behind each number</li>
          <li>Detailed questionnaire tailored to your home</li>
          <li>Upload contractor quotes and see how they compare</li>
          <li>“Name your price” — what fits your budget</li>
          <li>Matching with vetted local pros</li>
          <li>Downloadable PDF report and 1 year of access</li>
        </ul>
        <button class="btn btn-primary btn-lg" id="unlockBtn">Unlock for free</button>
      </div>

      <div class="locked-preview" aria-hidden="true">
        <div class="lock-row"><span>🔒 Refined range with rationale</span><span class="blur">$4,350–$4,900</span></div>
        <div class="lock-row"><span>🔒 Contractor quote comparison</span><span class="blur">3 quotes analyzed</span></div>
        <div class="lock-row"><span>🔒 Cost vs. value</span><span class="blur">ROI 68%</span></div>
      </div>

      <div class="card">${Report.sources(c)}</div>`;

    if (showOptinCard) bindOptin($("#optinCard"), () => { $("#optinCard").innerHTML = `<p class="ok">✓ Thanks — local pros may reach out about this project.</p>`; });
    $("#unlockBtn").addEventListener("click", () => {
      Analytics.track("upsell_click", { categoryId: c.id });
      goKind("photos");
    });
    Analytics.track("free_price_shown", { categoryId: c.id, zip: state.address.zip });
  },

  photos(view) {
    const c = cat();
    view.innerHTML = `${head("Optional", "Add photos of your project", "Photos help our team evaluate and measure. You can skip this and add them later.")}
      <div class="photo-guide">
        <div><span>🏠</span><strong>Wide shot</strong><p>Stand back so the whole area is in frame.</p></div>
        <div><span>🔍</span><strong>Close-ups</strong><p>Any damage, wear, or problem spots.</p></div>
        <div><span>📏</span><strong>Scale</strong><p>Include a tape measure or door for size.</p></div>
        <div><span>🚫</span><strong>Stay safe</strong><p>Never climb a ladder or roof.</p></div>
      </div>
      <p class="hint">Suggested for ${escHtml(c.name)}: ${c.photos.map(escHtml).join(" · ")}</p>
      <label class="photo-drop"><input type="file" accept="image/*" multiple hidden /><span>📷 Upload or take photos</span></label>
      <div class="thumbs">${state.photos.map((p) => `<img src="${p.dataUrl}" alt="" />`).join("")}</div>
      ${nextBtn("Continue")} <button class="btn btn-ghost" data-skip>Skip for now</button>`;
    $("input[type=file]", view).addEventListener("change", async (e) => {
      for (const f of [...e.target.files].slice(0, 8 - state.photos.length)) {
        try { state.photos.push({ name: f.name, dataUrl: await imageToThumb(f), addedAt: new Date().toISOString() }); } catch { /* skip */ }
      }
      $(".thumbs", view).innerHTML = state.photos.map((p) => `<img src="${p.dataUrl}" alt="" />`).join("");
    });
    const go = () => { Analytics.track("photos_step", { count: state.photos.length }); goKind("account"); };
    $("[data-go]", view).addEventListener("click", go);
    $("[data-skip]", view).addEventListener("click", go);
  },

  account(view) {
    const c = state.contact || {};
    view.innerHTML = `${head("Save your report", "Create your free account", "Your report, tools, and saved quotes stay available for a year.")}
      <div class="oauth-row">
        <button class="btn btn-oauth" disabled title="Coming soon">Continue with Google</button>
        <button class="btn btn-oauth" disabled title="Coming soon">Continue with Apple</button>
      </div>
      <div class="divider"><span>or with email</span></div>
      <div class="row">
        <div class="field"><label for="hFirst">First name</label><input id="hFirst" autocomplete="given-name" value="${escHtml(c.firstName || "")}" /></div>
        <div class="field"><label for="hLast">Last name</label><input id="hLast" autocomplete="family-name" value="${escHtml(c.lastName || "")}" /></div>
      </div>
      <div class="field"><label for="hEmail">Email</label><input id="hEmail" type="email" autocomplete="email" value="${escHtml(c.email || "")}" /></div>
      <div class="field"><label for="hPhone">Mobile phone (optional)</label><input id="hPhone" type="tel" autocomplete="tel" value="${escHtml(c.phone || "")}" /></div>
      <label class="consent"><input type="checkbox" id="hMarketing" /> <span>Optional: send me tips and offers by email or text. Not required.</span></label>
      ${nextBtn("Create account")}`;
    $("[data-go]", view).addEventListener("click", () => {
      const v = (id) => $(id, view).value.trim();
      const d = { firstName: v("#hFirst"), lastName: v("#hLast"), email: v("#hEmail").toLowerCase(), phone: v("#hPhone") };
      const bad = { "#hFirst": !d.firstName, "#hLast": !d.lastName, "#hEmail": !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) };
      Object.entries(bad).forEach(([s, b]) => invalid($(s, view), b));
      if (Object.values(bad).some(Boolean)) return;
      const h = Store.homeownerByEmail(d.email) || Store.createHomeowner({ ...d, marketingConsent: $("#hMarketing", view).checked });
      Session.loginHomeowner(h.email);
      Store.updateProject(state.projectId, { homeownerId: h.id, stage: "clt", photos: state.photos }, h.email, "project.unlock");
      Analytics.track("account_created", { categoryId: state.categoryId });
      state.homeowner = h;
      goKind("ownership");
    });
  },

  ownership(view) {
    const h = state.homeowner;
    view.innerHTML = `${head("Verify", "Confirming the property", "We check public parcel records so pros know your request is genuine.")}
      <div class="card verify-card"><p class="map-status">Checking county parcel records…</p></div>`;
    Ownership.verify(state.address, h.firstName, h.lastName).then((res) => {
      const box = $(".verify-card", view);
      if (!box) return;
      if (res.status === "verified") {
        Store.updateProject(state.projectId, { ownership: res }, h.email, "ownership.verified");
        box.innerHTML = `<p class="ok">✓ Ownership confirmed (${escHtml(res.source)}).</p>${nextBtn("Go to my report")}`;
        $("[data-go]", box).addEventListener("click", finish);
        return;
      }
      box.innerHTML = `<p class="warn">The parcel record lists <strong>${escHtml(res.parcelOwner)}</strong>, which doesn’t match your name.</p>
        <div class="field"><label for="why">Help us understand</label>
          <select id="why"><option value="">Choose one…</option>
            <option>I recently purchased the home</option><option>The home is owned by a trust or LLC I control</option>
            <option>I’m a family member of the owner</option><option>I’m a renter with the owner’s permission</option>
            <option>I manage the property</option><option>Other</option></select></div>
        <div class="field"><label for="whyText">Details (optional)</label><textarea id="whyText" rows="2"></textarea></div>
        ${nextBtn("Submit and continue")}`;
      $("[data-go]", box).addEventListener("click", () => {
        const why = $("#why", box);
        invalid(why, !why.value);
        if (!why.value) return;
        Store.updateProject(state.projectId, { ownership: { ...res, status: "explained", reason: why.value, details: $("#whyText", box).value.trim() } }, h.email, "ownership.explained");
        finish();
      });
    });
  },
};

/* ---------- question types ---------- */
const QUESTION = {
  single(body, step, cur) {
    body.innerHTML = `<div class="options">${optionsOf(step.q).map((o) => `
      <button class="option ${cur === o ? "selected" : ""}" data-v="${escHtml(o)}">${escHtml(o)}</button>`).join("")}</div>`;
    $$(".option", body).forEach((b) => b.addEventListener("click", () => {
      $$(".option", body).forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      setAnswer(step, b.dataset.v);
      setTimeout(next, 200);
    }));
  },
  multi(body, step, cur) {
    const sel = new Set(Array.isArray(cur) ? cur : []);
    body.innerHTML = `<p class="hint">Select all that apply.</p>
      <div class="options chips">${optionsOf(step.q).map((o) => `<button class="option chip ${sel.has(o) ? "selected" : ""}" data-v="${escHtml(o)}">${escHtml(o)}</button>`).join("")}</div>
      <p class="error hidden">Choose at least one.</p>${nextBtn()}`;
    $$(".option", body).forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.v;
      if (sel.has(v)) sel.delete(v);
      else {
        if (EXCLUSIVE.test(v)) sel.clear(); else [...sel].filter((x) => EXCLUSIVE.test(x)).forEach((x) => sel.delete(x));
        sel.add(v);
      }
      $$(".option", body).forEach((x) => x.classList.toggle("selected", sel.has(x.dataset.v)));
    }));
    $("[data-go]", body).addEventListener("click", () => {
      if (!sel.size) { $(".error", body).classList.remove("hidden"); return; }
      setAnswer(step, [...sel]); next();
    });
  },
  number(body, step, cur) {
    const q = step.q;
    const c = cat();
    const unit = q.role === "quantity" && c.unit !== "job" ? UNIT_LABEL[c.unit] : q.unit;
    body.innerHTML = `<div class="number-field"><input type="number" min="0" inputmode="numeric" value="${typeof cur === "number" ? cur : ""}" /><span>${escHtml(unit || "")}</span></div>
      <div class="options inline">
        ${q.trace ? `<button class="option pill" data-measure>📐 Measure on a satellite map</button>` : ""}
        <button class="option pill" data-unsure>Not sure</button>
      </div>${nextBtn()}`;
    const input = $("input", body);
    const m = $("[data-measure]", body);
    if (m) m.addEventListener("click", async () => {
      const r = await Measure.open({ address: state.address, mode: q.trace });
      if (r) { input.value = r.value; setAnswer(step, r.value); }
    });
    $("[data-unsure]", body).addEventListener("click", () => { setAnswer(step, "Not sure"); next(); });
    const go = () => { const n = parseFloat(input.value); invalid(input, !(n >= 0)); if (n >= 0) { setAnswer(step, n); next(); } };
    $("[data-go]", body).addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  },
  text(body, step, cur) {
    body.innerHTML = `<div class="field"><textarea rows="4" placeholder="Optional">${escHtml(cur || "")}</textarea></div>${nextBtn()}`;
    $("[data-go]", body).addEventListener("click", () => { setAnswer(step, $("textarea", body).value.trim()); next(); });
  },
};

/* ---------- contractor opt-in (REQ-14) ---------- */
function optinForm() {
  return `<div class="optin-form">
    <div class="options inline">
      <button class="option pill" data-optin="yes">Yes, connect me</button>
      <button class="option pill" data-optin="no">No thanks</button>
    </div>
    <div class="optin-fields hidden">
      <div class="row">
        <div class="field"><label>First name<input data-c="firstName" autocomplete="given-name" /></label></div>
        <div class="field"><label>Last name<input data-c="lastName" autocomplete="family-name" /></label></div>
      </div>
      <div class="row">
        <div class="field"><label>Email<input data-c="email" type="email" autocomplete="email" /></label></div>
        <div class="field"><label>Mobile<input data-c="phone" type="tel" autocomplete="tel" /></label></div>
      </div>
      <label class="consent"><input type="checkbox" data-consent /> <span>I agree that up to 3 local service businesses may contact me by phone, text, or email about this project. Consent isn’t required to get my price.</span></label>
      <button class="btn btn-primary" data-optin-submit>Connect me</button>
    </div>
  </div>`;
}

function bindOptin(root, done) {
  const fields = $(".optin-fields", root);
  $("[data-optin=no]", root).addEventListener("click", () => {
    state.optIn = false;
    Analytics.track("optin", { answer: "no", categoryId: state.categoryId });
    done();
  });
  $("[data-optin=yes]", root).addEventListener("click", () => fields.classList.remove("hidden"));
  $("[data-optin-submit]", root).addEventListener("click", () => {
    const d = Object.fromEntries($$("[data-c]", root).map((i) => [i.dataset.c, i.value.trim()]));
    const bad = !d.firstName || !d.lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.phone.replace(/\D/g, "").length < 10;
    const consent = $("[data-consent]", root);
    $$("[data-c]", root).forEach((i) => invalid(i, !i.value.trim()));
    if (bad || !consent.checked) { consent.parentElement.classList.toggle("invalid-text", !consent.checked); return; }
    state.optIn = true;
    state.contact = { ...d, email: d.email.toLowerCase(), consentAt: new Date().toISOString() };
    Analytics.track("optin", { answer: "yes", categoryId: state.categoryId });
    if (state.projectId) {
      Store.updateProject(state.projectId, { optIn: true, contact: state.contact }, d.email, "project.optin");
      Store.publishLead(state.projectId, d.email);
    }
    done();
  });
}

/* ---------- persistence ---------- */
function saveProject() {
  const c = cat();
  const ctx = { state: state.address.state, universal: state.universal, settings: Store.settings() };
  const free = Pricing.evaluate(c, state.answers, ctx);
  if (state.projectId) return Store.project(state.projectId);
  const p = Store.addProject({
    categoryId: c.id, address: state.address, latLng: state.latLng, universal: { ...state.universal },
    answers: { ...state.answers }, free, optIn: state.optIn, contact: state.contact, abVariant: Analytics.variant(),
  }, state.contact?.email || "anonymous");
  state.projectId = p.id;
  if (state.optIn) Store.publishLead(p.id, state.contact.email);
  return p;
}

function finish() {
  const p = Store.project(state.projectId);
  if (p.optIn && !p.isLead) Store.publishLead(p.id, state.homeowner.email);
  location.href = `account.html?project=${encodeURIComponent(p.id)}`;
}

/* ---------- landing ---------- */
function start(preselect) {
  $("#landing").classList.add("hidden");
  $("#wizard").classList.remove("hidden");
  if (preselect) {
    state.categoryId = preselect;
    Analytics.track("category_select", { categoryId: preselect });
    buildSteps();
    hist.push(0);
    show(1);
  } else {
    buildSteps();
    show(0);
  }
}

Analytics.initGa();
$("#categoryGrid").innerHTML = Store.activeCategories().map((c) => `
  <button class="category-tile" data-pre="${c.id}"><span class="category-icon">${c.icon}</span><span>${escHtml(c.name)}</span></button>`).join("");
$$("[data-pre]").forEach((b) => b.addEventListener("click", () => start(b.dataset.pre)));
$$("[data-start]").forEach((b) => b.addEventListener("click", () => start()));
$("#backBtn").addEventListener("click", back);
Analytics.track("landing_view");
