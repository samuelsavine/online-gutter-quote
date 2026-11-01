"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ========================================================================
   State
   ======================================================================== */
const state = {
  services: [],          // selected service ids, in selection order
  address: {},
  universal: {},         // G2–G7, G8 photos, G9 delivery
  answers: {},           // { serviceId: { q1: ..., q11: ... } }
  generalPhotos: [],     // optional G8 thumbnails
  contact: {},
  submissionId: null,
  addOnMode: false,      // cross-sell: only ask the new service's questions
};

let steps = [];
let idx = 0;
const history = [];

/* ========================================================================
   Step list — rebuilt whenever services change
   ======================================================================== */
function buildSteps() {
  if (state.addOnMode) {
    steps = [...serviceSteps(state.addOnService), { key: "quote", kind: "quote" }];
    return;
  }
  steps = [
    { key: "services", kind: "services" },
    { key: "address", kind: "address" },
    ...UNIVERSAL.map((qq) => ({ key: qq.id, kind: "question", q: qq })),
    ...state.services.flatMap(serviceSteps),
    { key: "G8", kind: "photos" },
    { key: "G9", kind: "question", q: DELIVERY_Q },
    { key: "contact", kind: "contact" },
    { key: "quote", kind: "quote" },
  ];
}

function serviceSteps(svcId) {
  const svc = SERVICES_BY_ID[svcId];
  return svc.questions.map((qq, i) => ({
    key: `${svcId}.${qq.id}`, kind: "question", q: qq, service: svc, num: i + 1, of: svc.questions.length,
  }));
}

const answerFor = (step) => (step.service ? (state.answers[step.service.id] || {})[step.q.id] : state.universal[step.q.id]);

function setAnswer(step, value) {
  if (step.service) {
    state.answers[step.service.id] = state.answers[step.service.id] || {};
    state.answers[step.service.id][step.q.id] = value;
  } else {
    state.universal[step.q.id] = value;
  }
}

/* ========================================================================
   Navigation
   ======================================================================== */
function show(i, back = false) {
  idx = i;
  const step = steps[idx];
  const view = $("#stepView");
  view.classList.remove("anim-back");
  void view.offsetWidth; // restart CSS animation
  view.classList.toggle("anim-back", back);
  view.innerHTML = "";
  RENDER[step.kind](view, step);
  updateProgress();
  const locked = step.kind === "quote" || step.kind === "advanced" || step.kind === "done";
  $("#backBtn").disabled = history.length === 0 || locked;
  window.scrollTo({ top: 0, behavior: "smooth" });
  const firstInput = $("input, textarea", view);
  if (firstInput && step.kind !== "services") firstInput.focus({ preventScroll: true });
}

function next() {
  history.push(idx);
  if (steps[idx].kind === "services") buildSteps();
  show(idx + 1);
}

function back() {
  if (!history.length) return;
  show(history.pop(), true);
}

function updateProgress() {
  const total = Math.max(1, steps.length - 1);
  const pct = Math.min(100, Math.round((idx / total) * 100));
  $("#progressFill").style.width = `${pct}%`;
  $("#progressBar").setAttribute("aria-valuenow", pct);
  const step = steps[idx];
  $("#progressLabel").textContent = step.service
    ? `${step.service.name} · ${step.num}/${step.of}`
    : step.kind === "quote" ? "Your estimate" : `${pct}%`;
}

/* ========================================================================
   Renderers
   ======================================================================== */
const tag = (text) => `<span class="step-tag">${escHtml(text)}</span>`;
const nextBtn = (label = "Continue") => `<button class="btn btn-primary btn-next" data-go>${label}</button>`;

const RENDER = {
  services(view) {
    view.innerHTML = `${tag("Your projects")}
      <h2>What would you like priced?</h2>
      <p class="step-hint">Select one or more services — we’ll ask a few questions about each.</p>
      <div class="service-grid">${SERVICES.map((s) => `
        <button class="service-tile ${state.services.includes(s.id) ? "selected" : ""}" data-svc="${s.id}">
          <span class="service-icon">${s.icon}</span><span>${escHtml(s.name)}</span>
        </button>`).join("")}</div>
      <p class="field-error hidden" id="svcErr">Choose at least one service.</p>
      ${nextBtn()}`;
    $$("[data-svc]", view).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.svc;
      state.services = state.services.includes(id) ? state.services.filter((x) => x !== id) : [...state.services, id];
      b.classList.toggle("selected");
    }));
    $("[data-go]", view).addEventListener("click", () => {
      if (!state.services.length) { $("#svcErr").classList.remove("hidden"); return; }
      next();
    });
  },

  address(view) {
    const a = state.address;
    view.innerHTML = `${tag("Property")}
      <h2>What is the project address?</h2>
      <div class="field"><label for="aStreet">Street address</label>
        <input id="aStreet" autocomplete="street-address" placeholder="123 Main Street" value="${escHtml(a.street || "")}" /></div>
      <div class="field-row">
        <div class="field"><label for="aCity">City</label>
          <input id="aCity" autocomplete="address-level2" value="${escHtml(a.city || "")}" /></div>
        <div class="field field-sm"><label for="aState">State</label>
          <input id="aState" autocomplete="address-level1" maxlength="2" placeholder="NC" value="${escHtml(a.state || "")}" /></div>
        <div class="field field-sm"><label for="aZip">ZIP</label>
          <input id="aZip" autocomplete="postal-code" inputmode="numeric" maxlength="10" value="${escHtml(a.zip || "")}" /></div>
      </div>
      ${nextBtn()}`;
    $("[data-go]", view).addEventListener("click", () => {
      const v = (id) => $(id, view).value.trim();
      const fields = { street: v("#aStreet"), city: v("#aCity"), state: v("#aState").toUpperCase(), zip: v("#aZip") };
      const bad = {
        "#aStreet": !fields.street, "#aCity": !fields.city,
        "#aState": !/^[A-Z]{2}$/.test(fields.state), "#aZip": !/^\d{5}(-\d{4})?$/.test(fields.zip),
      };
      Object.entries(bad).forEach(([sel, b]) => markInvalid($(sel, view), b));
      if (Object.values(bad).some(Boolean)) return;
      state.address = fields;
      next();
    });
  },

  question(view, step) {
    const qq = step.q;
    const heading = step.service ? `${step.service.icon} ${step.service.name}` : "About your project";
    view.innerHTML = `${tag(heading)}<h2>${escHtml(qq.t)}</h2><div class="q-body"></div>`;
    QUESTION[qq.type]($(".q-body", view), step, answerFor(step));
  },

  photos(view) {
    view.innerHTML = `${tag("Optional")}
      <h2>Can you upload photos of the project area?</h2>
      <p class="step-hint">Photos are optional for a free estimate. Wide views, close-ups of damage, and a
        measurement reference (like a tape measure) help most. <strong>Never climb a ladder or roof.</strong></p>
      <label class="photo-drop">
        <input type="file" accept="image/*" multiple hidden />
        <span class="photo-icon">📷</span><span>Upload or take photos</span>
      </label>
      <div class="thumb-row">${state.generalPhotos.map((p) => `<img src="${p.dataUrl}" alt="" />`).join("")}</div>
      ${nextBtn("Continue")}
      <button class="btn btn-ghost btn-skip" data-skip>Skip for now</button>`;
    $("input[type=file]", view).addEventListener("change", async (e) => {
      for (const f of [...e.target.files].slice(0, 6 - state.generalPhotos.length)) {
        try { state.generalPhotos.push({ name: f.name, dataUrl: await imageToThumb(f) }); } catch { /* skip non-images */ }
      }
      $(".thumb-row", view).innerHTML = state.generalPhotos.map((p) => `<img src="${p.dataUrl}" alt="" />`).join("");
    });
    const go = (choice) => { state.universal.G8 = state.generalPhotos.length ? "Uploaded" : choice; next(); };
    $("[data-go]", view).addEventListener("click", () => go("Skipped"));
    $("[data-skip]", view).addEventListener("click", () => go("Skipped"));
  },

  contact(view) {
    const c = state.contact;
    view.innerHTML = `${tag("Almost there")}
      <h2>Where should we send your estimate?</h2>
      <div class="field-row">
        <div class="field"><label for="cFirst">First name</label><input id="cFirst" autocomplete="given-name" value="${escHtml(c.firstName || "")}" /></div>
        <div class="field"><label for="cLast">Last name</label><input id="cLast" autocomplete="family-name" value="${escHtml(c.lastName || "")}" /></div>
      </div>
      <div class="field"><label for="cEmail">Email</label><input id="cEmail" type="email" autocomplete="email" value="${escHtml(c.email || "")}" /></div>
      <div class="field"><label for="cPhone">Mobile phone</label><input id="cPhone" type="tel" autocomplete="tel" inputmode="tel" value="${escHtml(c.phone || "")}" /></div>
      <div class="consent-box">
        <label class="consent"><input type="checkbox" checked disabled />
          <span>We’ll contact you about <strong>this estimate only</strong> (delivery, report status, and questions about your request).</span></label>
        <label class="consent"><input type="checkbox" id="cMarketing" ${c.marketingConsent ? "checked" : ""} />
          <span><strong>Optional:</strong> You may contact me by call or text with offers. Consent is not a condition of purchase. Msg &amp; data rates may apply. Reply STOP to opt out.</span></label>
        <label class="consent"><input type="checkbox" id="cShare" ${c.shareWithPros ? "checked" : ""} />
          <span><strong>Optional:</strong> Share my request with vetted local service businesses so they can contact me about this project.</span></label>
      </div>
      ${nextBtn("See my free estimate")}`;
    $("[data-go]", view).addEventListener("click", () => {
      const v = (id) => $(id, view).value.trim();
      const data = { firstName: v("#cFirst"), lastName: v("#cLast"), email: v("#cEmail"), phone: v("#cPhone") };
      const bad = {
        "#cFirst": !data.firstName, "#cLast": !data.lastName,
        "#cEmail": !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),
        "#cPhone": data.phone.replace(/\D/g, "").length < 10,
      };
      Object.entries(bad).forEach(([sel, b]) => markInvalid($(sel, view), b));
      if (Object.values(bad).some(Boolean)) return;
      state.contact = { ...data, marketingConsent: $("#cMarketing", view).checked, shareWithPros: $("#cShare", view).checked };
      next();
    });
  },

  quote(view) {
    const sub = saveSubmission();
    const total = sub.projects.reduce((t, p) => ({ low: t.low + p.estimate.low, high: t.high + p.estimate.high }), { low: 0, high: 0 });
    const price = Store.settings().advancedReportPrice;
    const related = [...new Set(sub.projects.flatMap((p) => SERVICES_BY_ID[p.serviceId].related))]
      .filter((id) => !sub.projects.some((p) => p.serviceId === id)).slice(0, 4);

    view.innerHTML = `
      <div class="estimate-card">
        <span class="step-tag tag-good">Your free estimate</span>
        <h2>${escHtml(sub.contact.firstName)}, here’s what your ${sub.projects.length > 1 ? "projects" : "project"} may cost</h2>
        <div class="quote-list">${sub.projects.map(projectRow).join("")}</div>
        ${sub.projects.length > 1 ? `<div class="quote-total"><span>Combined estimate</span><strong>${fmtUsd(total.low)}–${fmtUsd(total.high)}</strong></div>` : ""}
        <p class="estimate-disclaimer"><strong>This is a non-binding preliminary estimate and may be inaccurate.</strong>
          Ranges are based on national and ${escHtml(sub.address.state)} regional average pricing and your answers.
          Measurements, site conditions, permits, and contractor review can change the final price.</p>
      </div>

      <div class="estimate-card upsell-card">
        <span class="step-tag">Advanced Report</span>
        <h3>Want a more accurate number?</h3>
        <p class="estimate-sub">A pricing expert reviews your answers and photos of each project area and prepares a
          detailed, line-item Advanced Report with a narrower price range and notes on what drives your cost.</p>
        <button class="btn btn-primary btn-lg" id="buyReport">Get my Advanced Report — ${fmtUsd(price)}</button>
        <p class="estimate-disclaimer">You’ll upload photos of each project area before checkout.</p>
      </div>

      ${related.length ? `<div class="crosssell">
        <h3>Planning anything else?</h3>
        <div class="crosssell-row">${related.map((id) => `
          <button class="service-tile" data-addon="${id}"><span class="service-icon">${SERVICES_BY_ID[id].icon}</span>
          <span>Add ${escHtml(SERVICES_BY_ID[id].name)}</span></button>`).join("")}</div>
      </div>` : ""}

      <p class="estimate-disclaimer"><a href="${reportLink(sub)}">Save your estimate link</a></p>`;

    $("#buyReport").addEventListener("click", () => {
      history.push(idx);
      steps.push({ key: "advanced", kind: "advanced" });
      show(steps.length - 1);
    });
    $$("[data-addon]", view).forEach((b) => b.addEventListener("click", () => {
      state.addOnMode = true;
      state.addOnService = b.dataset.addon;
      buildSteps();
      history.length = 0;
      show(0);
    }));
  },

  advanced(view) {
    const sub = Store.submission(state.submissionId);
    const price = Store.settings().advancedReportPrice;
    state.reportPhotos = state.reportPhotos || {};
    view.innerHTML = `${tag("Advanced Report")}
      <h2>Upload photos of each project area</h2>
      <p class="step-hint">Our experts need at least <strong>2 photos per project</strong> (marked *). Include wide shots
        and close-ups. <strong>Never climb a ladder or roof</strong> — photos from the ground are fine.</p>
      ${sub.projects.map((p) => {
        const svc = SERVICES_BY_ID[p.serviceId];
        return `<div class="photo-project">
          <h3>${svc.icon} ${escHtml(svc.name)}</h3>
          <div class="photo-grid">${svc.photos.map((label, i) => `
            <label class="photo-slot" data-svc="${svc.id}" data-slot="${i}">
              <input type="file" accept="image/*" hidden />
              <span class="photo-icon">📷</span><span>${escHtml(label)}${i < 2 ? " *" : ""}</span>
            </label>`).join("")}</div>
        </div>`;
      }).join("")}
      <div class="field"><label for="rNotes">Anything the expert should know? (optional)</label>
        <textarea id="rNotes" rows="3"></textarea></div>
      <p class="field-error hidden" id="photoErr">Please add the required photos (*) for each project.</p>
      <button class="btn btn-primary btn-lg" id="payReport">Continue to payment — ${fmtUsd(price)}</button>`;

    $$(".photo-slot", view).forEach((slot) => {
      const key = `${slot.dataset.svc}:${slot.dataset.slot}`;
      if (state.reportPhotos[key]) fillSlot(slot, state.reportPhotos[key].dataUrl);
      $("input", slot).addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const dataUrl = await imageToThumb(f);
          state.reportPhotos[key] = { name: f.name, dataUrl, slot: Number(slot.dataset.slot), serviceId: slot.dataset.svc };
          fillSlot(slot, dataUrl);
        } catch { /* ignore non-images */ }
      });
    });

    $("#payReport").addEventListener("click", async () => {
      const missing = sub.projects.some((p) => [0, 1].some((i) => !state.reportPhotos[`${p.serviceId}:${i}`]));
      $("#photoErr").classList.toggle("hidden", !missing);
      if (missing) return;
      const result = await Payments.checkout({
        amount: price,
        description: `Advanced Report — ${sub.projects.map((p) => p.serviceName).join(", ")} at ${sub.address.street}`,
      });
      if (result.status !== "succeeded") return;
      const photos = {};
      Object.values(state.reportPhotos).forEach((ph) => {
        const label = SERVICES_BY_ID[ph.serviceId].photos[ph.slot];
        (photos[ph.serviceId] = photos[ph.serviceId] || []).push({ label, name: ph.name, dataUrl: ph.dataUrl });
      });
      Store.updateSubmission(sub.id, {
        status: "report_purchased",
        advanced: {
          purchasedAt: new Date().toISOString(), paymentRef: result.id, amount: price,
          customerNotes: $("#rNotes", view).value.trim(), photos, report: null,
        },
      }, sub.contact.email, "advanced_report.purchase");
      history.push(idx);
      steps.push({ key: "done", kind: "done" });
      show(steps.length - 1);
    });
  },

  done(view) {
    const sub = Store.submission(state.submissionId);
    view.innerHTML = `<div class="estimate-card step-center">
      <div class="done-check">✓</div>
      <h2>Your Advanced Report is in progress</h2>
      <p class="estimate-sub">A pricing expert will review your photos and answers. We’ll notify you by
        ${escHtml((state.universal.G9 || "email").toLowerCase())} when your report is ready.</p>
      <a class="btn btn-primary" href="${reportLink(sub)}">Check report status</a>
    </div>`;
  },
};

/* ---------- question types ---------- */
const QUESTION = {
  single(body, step, current) {
    const opts = optionsFor(step.q);
    body.innerHTML = `<div class="options">${opts.map((o) => `
      <button class="option ${current === o ? "selected" : ""}" data-v="${escHtml(o)}">${escHtml(o)}</button>`).join("")}</div>`;
    $$(".option", body).forEach((b) => b.addEventListener("click", () => {
      $$(".option", body).forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      setAnswer(step, b.dataset.v);
      setTimeout(next, 220);
    }));
  },

  multi(body, step, current) {
    const opts = optionsFor(step.q);
    const sel = new Set(Array.isArray(current) ? current : []);
    body.innerHTML = `<p class="step-hint">Select all that apply.</p>
      <div class="options options-grid">${opts.map((o) => `
        <button class="option option-chip ${sel.has(o) ? "selected" : ""}" data-v="${escHtml(o)}">${escHtml(o)}</button>`).join("")}</div>
      <p class="field-error hidden">Choose at least one option.</p>${nextBtn()}`;
    $$(".option", body).forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.v;
      if (sel.has(v)) sel.delete(v);
      else {
        // "None"/"Not sure" are mutually exclusive with specific selections
        if (EXCLUSIVE_RE.test(v)) sel.clear();
        else [...sel].filter((x) => EXCLUSIVE_RE.test(x)).forEach((x) => sel.delete(x));
        sel.add(v);
      }
      $$(".option", body).forEach((x) => x.classList.toggle("selected", sel.has(x.dataset.v)));
    }));
    $("[data-go]", body).addEventListener("click", () => {
      if (!sel.size) { $(".field-error", body).classList.remove("hidden"); return; }
      setAnswer(step, [...sel]);
      next();
    });
  },

  number(body, step, current) {
    const unit = step.q.unit ? ` ${step.q.unit}` : "";
    body.innerHTML = `<div class="field number-field">
        <input type="number" min="0" step="1" inputmode="numeric" value="${typeof current === "number" ? current : ""}" />
        <span class="unit">${escHtml(unit)}</span>
      </div>
      <div class="options options-inline">
        <button class="option option-pill ${isUnsure(current) ? "selected" : ""}" data-unsure>Not sure</button>
      </div>${nextBtn()}`;
    const input = $("input", body);
    $("[data-unsure]", body).addEventListener("click", () => { setAnswer(step, "Not sure"); next(); });
    const go = () => {
      const n = parseFloat(input.value);
      const bad = !(n >= 0);
      markInvalid(input, bad);
      if (bad) return;
      setAnswer(step, n);
      next();
    };
    $("[data-go]", body).addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  },

  measure(body, step, current) {
    const label = step.q.unit === "lf" ? "linear ft" : "sq ft";
    body.innerHTML = `<div class="field number-field">
        <input type="number" min="0" step="1" inputmode="numeric" value="${typeof current === "number" ? current : ""}" />
        <span class="unit">${label}</span>
      </div>
      <div class="options options-inline">
        <button class="option option-pill" data-measure>📐 Measure it on a satellite map</button>
        <button class="option option-pill ${isUnsure(current) ? "selected" : ""}" data-unsure>Not sure</button>
      </div>${nextBtn()}`;
    const input = $("input", body);
    $("[data-measure]", body).addEventListener("click", async () => {
      const r = await Measure.open({ address: state.address, mode: step.q.trace });
      if (r) {
        input.value = r.value;
        setAnswer(step, r.value);
        state.measuredBy = state.measuredBy || {};
        state.measuredBy[step.key] = r.mode;
      }
    });
    $("[data-unsure]", body).addEventListener("click", () => { setAnswer(step, "Not sure"); next(); });
    const go = () => {
      const n = parseFloat(input.value);
      const bad = !(n > 0);
      markInvalid(input, bad);
      if (bad) return;
      setAnswer(step, n);
      next();
    };
    $("[data-go]", body).addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  },

  text(body, step, current) {
    const optional = step.q.optional;
    body.innerHTML = `<div class="field"><textarea rows="4" placeholder="${optional ? "Optional" : ""}">${escHtml(current || "")}</textarea></div>
      ${nextBtn()}${optional ? `<button class="btn btn-ghost btn-skip" data-skip>Skip</button>` : ""}`;
    const ta = $("textarea", body);
    $("[data-go]", body).addEventListener("click", () => {
      const v = ta.value.trim();
      if (!v && !optional) { markInvalid(ta, true); return; }
      setAnswer(step, v);
      next();
    });
    const skip = $("[data-skip]", body);
    if (skip) skip.addEventListener("click", () => { setAnswer(step, ""); next(); });
  },
};

/* ========================================================================
   Persistence + estimates
   ======================================================================== */
function estimateCtx() {
  const s = Store.settings();
  return { universal: state.universal, state: state.address.state, priceBook: s.priceBook, stateMult: { ...STATE_MULT, ...s.stateMult } };
}

function buildProject(svcId) {
  const svc = SERVICES_BY_ID[svcId];
  const answers = state.answers[svcId] || {};
  return { serviceId: svcId, serviceName: svc.name, answers, estimate: estimateProject(svcId, answers, estimateCtx()) };
}

function saveSubmission() {
  if (state.addOnMode && state.submissionId) {
    const sub = Store.submission(state.submissionId);
    const projects = [...sub.projects.filter((p) => p.serviceId !== state.addOnService), buildProject(state.addOnService)];
    state.addOnMode = false;
    return Store.updateSubmission(sub.id, { projects }, sub.contact.email, "submission.add_project");
  }
  if (state.submissionId) return Store.submission(state.submissionId);
  const sub = Store.addSubmission({
    contact: state.contact,
    address: state.address,
    universal: { ...state.universal },
    generalPhotos: state.generalPhotos,
    projects: state.services.map(buildProject),
  }, state.contact.email);
  state.submissionId = sub.id;
  return sub;
}

function projectRow(p) {
  const svc = SERVICES_BY_ID[p.serviceId];
  const e = p.estimate;
  const basis = e.qty != null && UNIT_LABEL[e.unit]
    ? `Based on ${e.qtyAssumed ? "a typical " : ""}${e.qty.toLocaleString("en-US")} ${UNIT_LABEL[e.unit]}${e.qtyAssumed ? " (measure for a tighter range)" : ""}`
    : e.qtyAssumed ? "Based on a typical project size" : "Based on your answers";
  return `<div class="quote-row">
    <div><strong>${svc.icon} ${escHtml(svc.name)}</strong><p class="quote-basis">${escHtml(basis)}</p></div>
    <div class="quote-range">${fmtUsd(e.low)}–${fmtUsd(e.high)}</div>
  </div>`;
}

const reportLink = (sub) => `report.html?id=${encodeURIComponent(sub.id)}&email=${encodeURIComponent(sub.contact.email)}`;

/* ========================================================================
   Helpers + wiring
   ======================================================================== */
function markInvalid(el, bad) {
  el.classList.toggle("invalid", bad);
  if (bad) el.addEventListener("input", () => el.classList.remove("invalid"), { once: true });
}

function fillSlot(slot, dataUrl) {
  slot.classList.add("filled");
  slot.style.backgroundImage = `url("${dataUrl}")`;
}

function start(preselect) {
  if (preselect && !state.services.includes(preselect)) state.services.push(preselect);
  $("#hero").classList.add("hidden");
  $("#quiz").classList.remove("hidden");
  buildSteps();
  show(0);
}

$("#serviceStrip").innerHTML = SERVICES.map((s) =>
  `<button class="service-chip" data-pre="${s.id}">${s.icon} ${escHtml(s.name)}</button>`).join("");
$$("[data-pre]").forEach((b) => b.addEventListener("click", () => start(b.dataset.pre)));
$$("[data-start]").forEach((b) => b.addEventListener("click", () => start()));
$("#backBtn").addEventListener("click", back);

// Returning customer ordering an Advanced Report from their saved estimate link
(() => {
  const p = new URLSearchParams(location.search);
  const sub = p.get("advanced") && Store.submission(p.get("advanced"));
  if (!sub || sub.advanced || sub.contact.email.toLowerCase() !== (p.get("email") || "").toLowerCase()) return;
  state.submissionId = sub.id;
  state.universal = sub.universal;
  $("#hero").classList.add("hidden");
  $("#quiz").classList.remove("hidden");
  steps = [{ key: "advanced", kind: "advanced" }];
  show(0);
})();
