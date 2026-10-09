"use strict";

/* ========================================================================
   State
   ======================================================================== */
const state = {
  address: {},
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
  timing: null,
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
  { id: "projectType" },
  { id: "protection" },
  { id: "height" },
  { id: "problems", when: isReplacement },
  { id: "fascia" },
  { id: "downspouts" },
  { id: "underground" },
  { id: "special" },
  { id: "estimate", noProgress: true },
  { id: "contact" },
  { id: "timing" },
  { id: "photos", when: needsPhotoReview },
  { id: "finalQuote", noProgress: true },
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

  if (id === "estimate") renderEstimate();
  if (id === "finalQuote") renderFinalQuote();

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
    // Interstitial screens (estimate, photos, quote, done) count as complete-ish
    const passed = history.filter((h) => steps.some((s) => s.id === h)).length;
    pct = currentId === "done" || currentId === "finalQuote" ? 100 : (passed / steps.length) * 100;
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
    case "problems":
      return true; // optional multi-select
    case "underground": {
      if (!state.underground) return false;
      if (state.underground === "yes" && !state.reconnect) return false;
      return true;
    }
    case "special":
      return true;
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
   Pricing — preliminary heuristic, never presented as final
   ======================================================================== */
function estimateRange() {
  let low = 1400, high = 2400; // 1-story baseline

  const heightMult = { "1-story": 1, "2-story": 1.35, "3-plus": 1.7, combo: 1.3 }[state.height] || 1.2;
  low *= heightMult;
  high *= heightMult;

  if (state.projectType === "replace-some") { low *= 0.55; high *= 0.7; }

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
}

/* ========================================================================
   Final quote
   ======================================================================== */
function renderFinalQuote() {
  const { low, high, guardsLow, guardsHigh } = estimateRange();
  const withGuards = state.protection === "gutters-guards";
  const price = withGuards
    ? Math.round((guardsLow + guardsHigh) / 2 / 50) * 50
    : Math.round((low + high) / 2 / 50) * 50;

  $("#finalPrice").textContent = fmt(price);
  if (state.contact.firstName) {
    $("#finalGreeting").textContent = `${state.contact.firstName}, here’s your verified quote`;
  }

  const projectLabel = {
    "replace-all": "Full gutter replacement — removal and haul-away of existing gutters included",
    "replace-some": "Partial gutter replacement — removal of affected sections included",
    "new-install": "New gutter installation on all eligible rooflines",
    "not-sure": "Gutter installation scope confirmed by digital measurement",
  }[state.projectType];

  const downspoutLabel = {
    replace: "All downspouts replaced (quantity per digital measurement)",
    improve: "Downspouts plus added/improved drainage where needed",
    keep: "Existing downspouts retained where serviceable",
    recommend: "Downspout plan recommended by our measurement team",
  }[state.downspouts];

  const scope = [
    projectLabel,
    `6" seamless aluminum K-style gutters · color matched from 25+ options`,
    withGuards ? "Premium micro-mesh gutter guards on all new gutters" : "Open-top gutters (guards available as an add-on)",
    downspoutLabel,
  ];
  if (state.underground === "yes" && state.reconnect === "yes") {
    scope.push("New downspouts reconnected to existing underground drains");
  }
  scope.push("Exclusions: fascia/soffit carpentry beyond minor repair, roof work, landscaping restoration");

  $("#quoteScope").innerHTML = scope.map((s) => `<li>${s}</li>`).join("");

  const conditions = [];
  if (state.fascia === "some-damage" || state.fascia === "significant") {
    conditions.push("fascia condition");
  }
  if (state.height === "3-plus" || state.special.includes("over-30ft")) {
    conditions.push("working height");
  }
  if (state.special.includes("difficult-access")) conditions.push("site access");
  if (state.special.includes("metal-roof") || state.special.includes("steep-roof")) {
    conditions.push("roof configuration");
  }

  $("#quoteConditions").textContent = conditions.length
    ? `⚠ Subject to on-site verification of: ${conditions.join(", ")}.`
    : "";
}

/* ========================================================================
   Photo slots
   ======================================================================== */
$$(".photo-slot input").forEach((input) => {
  input.addEventListener("change", () => {
    const slot = input.closest(".photo-slot");
    if (input.files.length) {
      slot.classList.add("filled");
      slot.querySelector(".photo-icon").textContent = "✅";
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
$("#acceptBtn").addEventListener("click", goNext);

// Enter advances text-input steps
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("input[type='text'], input[type='email'], input[type='tel']")) {
    e.preventDefault();
    goNext();
  }
});
