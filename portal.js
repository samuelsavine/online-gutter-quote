"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const TABS = {
  admin: ["Overview", "Projects", "Contractors", "Questionnaires", "Pricing formula", "Categories", "Billing", "Settings", "Compliance"],
  sales: ["Overview", "Projects", "Contractors"],
  expert: ["Projects"],
  contractor: ["Leads", "Profile", "Documents", "Billing", "Terms"],
};
const DOC_TYPES = { license: "Contractor license", insurance: "General liability insurance", "workers-comp": "Workers’ comp certificate", w9: "W-9" };
const TERMS_TEXT = `Lead terms (placeholder — pending legal review): Each lead is shared with at most the configured number of businesses.
Leads are billed at the current lead price when purchased (manually or by auto-buy). Invalid leads (wrong number, duplicate,
out-of-area, not the property decision-maker) may be submitted for refund within 7 days. You must honor homeowner contact
preferences and applicable telemarketing and consent laws.`;

let session = Session.current();
if (session && session.kind === "homeowner") session = null;

const isAdmin = () => session?.role === "admin";
const me = () => Store.contractor(session.contractorId);
const svcName = (id) => Store.category(id)?.name || id;
const badge = (text, kind = "") => `<span class="badge ${kind}">${escHtml(text)}</span>`;
const flash = (el) => { el.classList.remove("hidden"); setTimeout(() => el.classList.add("hidden"), 1500); };
// Replace a container so delegated listeners from a previous render don't stack
const fresh = (el) => { const n = el.cloneNode(false); el.replaceWith(n); return n; };

/* ========================================================================
   Auth + shell
   ======================================================================== */
function renderLogin(msg = "") {
  $("#app").innerHTML = `<div class="card narrow">
    <h2>Pro &amp; team sign-in</h2>
    <p class="hint">Contractor accounts are created by our team — check your invite email.</p>
    <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" /></div>
    <button class="btn btn-primary" id="go">Sign in</button>
    ${msg ? `<p class="error">${escHtml(msg)}</p>` : ""}
    <div class="demo">Prototype accounts (no password): admin@fastfreepricing.com · sales@fastfreepricing.com ·
      expert@fastfreepricing.com · maria@capefearexteriors.com (approved pro) · deshawn@coastalrain.com (invited pro)</div>
  </div>`;
  const go = () => {
    const s = Session.loginStaffOrContractor($("#email").value);
    if (!s) { renderLogin("No portal account for that email."); return; }
    session = s; boot();
  };
  $("#go").addEventListener("click", go);
  $("#email").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function boot() {
  if (!session) { renderLogin(); return; }
  $("#who").textContent = `${session.name} · ${session.role}`;
  $("#signOut").classList.remove("hidden");
  $("#signOut").onclick = () => { Session.logout(); location.reload(); };
  if (session.kind === "contractor" && me()?.status !== "approved") { renderOnboarding(); return; }
  const tabs = TABS[session.role];
  $("#app").innerHTML = `<div class="tabs">${tabs.map((t) => `<button class="tab" data-tab="${t}">${t}</button>`).join("")}</div><div id="tab"></div>`;
  $$(".tab").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
  openTab(tabs[0]);
}

function openTab(name) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  const el = $("#tab");
  ({
    Overview: renderOverview, Projects: renderProjects, Contractors: renderContractors,
    Questionnaires: renderBuilder, "Pricing formula": renderFormula, Categories: renderCategories,
    Billing: session.kind === "contractor" ? renderMyBilling : renderBilling, Settings: renderSettings, Compliance: renderCompliance,
    Leads: renderLeads, Profile: renderProfile, Documents: renderDocs, Terms: renderTerms,
  })[name](el);
}

/* ========================================================================
   Overview (REQ-21/22 preview — local data only until the backend)
   ======================================================================== */
function renderOverview(el) {
  const projects = Store.projects(), purchases = Store.purchases().filter((x) => x.status !== "refunded"), events = Store.events();
  const since = (days) => Date.now() - days * 864e5;
  const ytd = new Date(new Date().getFullYear(), 0, 1).getTime();
  const windows = [["Today", since(1)], ["7 days", since(7)], ["30 days", since(30)], ["YTD", ytd]];
  const count = (list, key, t) => list.filter((x) => new Date(x[key]).getTime() >= t).length;
  const leads = projects.filter((p) => p.isLead);
  const cats = Store.categories().map((c) => ({
    c, starts: events.filter((e) => e.type === "category_select" && e.categoryId === c.id).length,
    prices: events.filter((e) => e.type === "free_price_shown" && e.categoryId === c.id).length,
    unlocks: events.filter((e) => e.type === "account_created" && e.categoryId === c.id).length,
  })).filter((r) => r.starts);
  const zips = {};
  events.filter((e) => e.type === "free_price_shown").forEach((e) => { zips[e.zip] = (zips[e.zip] || 0) + 1; });
  const ab = ["A_before", "B_after"].map((v) => {
    const o = events.filter((e) => e.type === "optin" && e.variant === v);
    return { v, n: o.length, yes: o.filter((e) => e.answer === "yes").length };
  });
  el.innerHTML = `<h2>Business overview</h2>
    <p class="hint">Prototype: metrics come from this browser’s data. Cross-user metrics and ad spend tracking arrive with the backend + GA4.</p>
    <table class="table"><thead><tr><th></th>${windows.map(([l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Projects started</td>${windows.map(([, t]) => `<td>${count(projects, "createdAt", t)}</td>`).join("")}</tr>
      <tr><td>Leads generated</td>${windows.map(([, t]) => `<td>${count(leads, "leadAt", t)}</td>`).join("")}</tr>
      <tr><td>Leads sold</td>${windows.map(([, t]) => `<td>${count(purchases, "ts", t)}</td>`).join("")}</tr>
      <tr><td>Lead revenue</td>${windows.map(([, t]) => `<td>${fmtUsd(purchases.filter((x) => new Date(x.ts).getTime() >= t).reduce((s, x) => s + x.price, 0))}</td>`).join("")}</tr>
    </tbody></table>
    <h3>Category traction</h3>
    <table class="table"><thead><tr><th>Category</th><th>Starts</th><th>Free prices</th><th>Unlocked reports</th><th>Completion</th></tr></thead>
      <tbody>${cats.map((r) => `<tr><td>${r.c.icon} ${escHtml(r.c.name)}</td><td>${r.starts}</td><td>${r.prices}</td><td>${r.unlocks}</td><td>${Math.round((r.prices / r.starts) * 100)}%</td></tr>`).join("") || `<tr><td colspan="5" class="hint">No activity yet.</td></tr>`}</tbody></table>
    <h3>Top ZIP codes</h3>
    <p>${Object.entries(zips).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([z, n]) => `${escHtml(z)} (${n})`).join(" · ") || "—"}</p>
    <h3>A/B test: contractor opt-in placement</h3>
    <table class="table"><thead><tr><th>Variant</th><th>Answered</th><th>Opted in</th><th>Rate</th></tr></thead>
      <tbody>${ab.map((r) => `<tr><td>${r.v === "A_before" ? "A — before free price" : "B — after free price"}</td><td>${r.n}</td><td>${r.yes}</td><td>${r.n ? Math.round((r.yes / r.n) * 100) + "%" : "—"}</td></tr>`).join("")}</tbody></table>`;
}

/* ========================================================================
   Projects (staff)
   ======================================================================== */
function answersDl(c, answers) {
  return `<dl class="dl">${c.questions.map((q) => {
    const a = answers[q.id];
    return `<dt>${escHtml(q.text)}</dt><dd>${escHtml(Array.isArray(a) ? a.join(", ") : a ?? "—")}</dd>`;
  }).join("")}</dl>`;
}
const ownBadge = (p) => !p.ownership ? badge("Ownership unchecked")
  : p.ownership.status === "verified" ? badge("Owner verified", "good") : badge(`Explained: ${p.ownership.reason}`, "warn");

function renderProjects(el) {
  const list = Store.projects().slice().reverse();
  el.innerHTML = `<h2>Projects (${list.length})</h2>${list.map((p) => {
    const c = Store.category(p.categoryId);
    const r = p.refined || p.free;
    const ho = p.homeownerId ? Store.homeowner(p.homeownerId) : null;
    return `<div class="card">
      <div class="card-head"><h3>${c.icon} ${escHtml(c.name)} · ${escHtml(p.address.city)}, ${escHtml(p.address.state)} ${escHtml(p.address.zip)}</h3>
        <div>${badge(p.stage === "clt" ? "Report unlocked" : "Free price")} ${p.isLead ? badge(`Lead · ${Store.buyersOf(p.id).length} buyer(s)`, "good") : ""} ${ownBadge(p)}</div></div>
      <p class="hint">${fmtDate(p.createdAt)} · ${escHtml(ho?.email || p.contact?.email || "anonymous")} · Variant ${escHtml(p.abVariant)}</p>
      <p>${TIERS.map((t) => `${TIER_LABEL[t]}: <strong>${fmtUsd(r.tiers[t].low)}–${fmtUsd(r.tiers[t].high)}</strong>`).join(" · ")}</p>
      <details><summary>Answers, photos &amp; quotes</summary>${answersDl(c, p.answers)}
        <div class="thumbs">${(p.photos || []).map((ph) => `<img src="${ph.dataUrl}" alt="" />`).join("")}</div>
        ${p.quotes?.length ? `<p>${p.quotes.length} contractor quote(s): ${p.quotes.map((q) => `${escHtml(q.contractor)} ${fmtUsd(q.price)}`).join(", ")}</p>` : ""}
        <label class="field">Team note (internal)<textarea data-note="${p.id}" rows="2">${escHtml(p.teamNote || "")}</textarea></label>
        <button class="btn btn-ghost btn-sm" data-save-note="${p.id}">Save note</button>
      </details>
    </div>`;
  }).join("") || `<p class="hint">No projects yet.</p>`}`;
  $$("[data-save-note]", el).forEach((b) => b.addEventListener("click", () => {
    Store.updateProject(b.dataset.saveNote, { teamNote: $(`[data-note="${b.dataset.saveNote}"]`, el).value.trim() }, session.email, "project.team_note");
    b.textContent = "Saved ✓";
  }));
}

/* ========================================================================
   Contractors (staff-initiated onboarding + approval)
   ======================================================================== */
function servicesChecks(selected = []) {
  return `<div class="check-grid">${Store.categories().map((c) => `<label class="check"><input type="checkbox" data-svc="${c.id}" ${selected.includes(c.id) ? "checked" : ""} /> ${c.icon} ${escHtml(c.name)}</label>`).join("")}</div>`;
}
function contractorFields(c = {}) {
  const v = (k) => escHtml(c[k] || "");
  return `<div class="row">
      <div class="field"><label>Company<input data-f="company" value="${v("company")}" /></label></div>
      <div class="field"><label>Contact name<input data-f="contactName" value="${v("contactName")}" /></label></div></div>
    <div class="row">
      <div class="field"><label>Email<input type="email" data-f="email" value="${v("email")}" /></label></div>
      <div class="field"><label>Phone<input data-f="phone" value="${v("phone")}" /></label></div></div>
    <div class="row">
      <div class="field"><label>City<input data-f="city" value="${v("city")}" /></label></div>
      <div class="field sm"><label>State<input data-f="state" maxlength="2" value="${v("state")}" /></label></div>
      <div class="field sm"><label>ZIP<input data-f="zip" value="${v("zip")}" /></label></div>
      <div class="field"><label>License #<input data-f="licenseNumber" value="${v("licenseNumber")}" /></label></div></div>
    <div class="field"><label>States served (comma-separated)<input data-f="serviceStates" value="${escHtml((c.serviceStates || []).join(", "))}" /></label></div>
    <p class="label">Services</p>${servicesChecks(c.services)}`;
}
function readContractor(root) {
  const d = Object.fromEntries($$("[data-f]", root).map((i) => [i.dataset.f, i.value.trim()]));
  d.email = d.email.toLowerCase();
  d.state = d.state.toUpperCase();
  d.serviceStates = d.serviceStates.split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  if (!d.serviceStates.length && d.state) d.serviceStates = [d.state];
  d.services = $$("[data-svc]:checked", root).map((x) => x.dataset.svc);
  return d;
}
function contractorError(d, selfId) {
  if (!d.company || !d.contactName) return "Company and contact name are required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "Valid email required.";
  const taken = Store.contractors().some((c) => c.id !== selfId && c.email.toLowerCase() === d.email) || Store.users().some((u) => u.email === d.email);
  if (taken) return "That email is already in use.";
  if (!/^[A-Z]{2}$/.test(d.state)) return "Two-letter state required.";
  if (!d.services.length) return "Choose at least one service.";
  return null;
}

const STATUS_BADGE = { invited: ["Invited", ""], onboarding: ["Onboarding", ""], pending_approval: ["Awaiting approval", "warn"], approved: ["Approved", "good"], rejected: ["Rejected", "bad"] };

function renderContractors(el) {
  const list = Store.contractors();
  el.innerHTML = `<h2>Contractors (${list.length})</h2>
    ${isAdmin() ? `<details class="card"><summary><strong>+ Add contractor (sends invite)</strong></summary>
      <div id="newCtr">${contractorFields()}</div>
      <button class="btn btn-primary" id="addCtr">Create &amp; invite</button><p class="error hidden" id="ctrErr"></p></details>` : ""}
    ${list.map((c) => {
      const [label, kind] = STATUS_BADGE[c.status];
      return `<div class="card">
        <div class="card-head"><h3>${escHtml(c.company)}</h3><div>${badge(label, kind)} ${c.membership.active ? badge("Member", "good") : badge("No membership")} ${c.autoBuy ? badge("Auto-buy on", "good") : ""}</div></div>
        <p class="hint">${escHtml(c.contactName)} · ${escHtml(c.email)} · ${escHtml(c.phone)} · ${escHtml(c.city)}, ${escHtml(c.state)}${c.licenseNumber ? ` · License ${escHtml(c.licenseNumber)}` : ""}</p>
        <p>${c.services.map((s) => escHtml(svcName(s))).join(", ")}</p>
        ${c.docs.length ? `<table class="table"><tbody>${c.docs.map((d) => `<tr><td>${escHtml(DOC_TYPES[d.type] || d.type)}</td><td>${escHtml(d.name)}</td><td>${d.verified ? badge("Verified", "good") : isAdmin() ? `<button class="btn btn-ghost btn-sm" data-verify="${c.id}:${d.id}">Verify</button>` : badge("Pending")}</td></tr>`).join("")}</tbody></table>` : `<p class="hint">No documents uploaded.</p>`}
        ${isAdmin() && c.status === "pending_approval" ? `<div class="actions"><button class="btn btn-primary btn-sm" data-approve="${c.id}">Approve</button><button class="btn btn-ghost btn-sm" data-reject="${c.id}">Reject</button></div>` : ""}
        ${isAdmin() && c.status === "invited" ? `<p class="hint">Invite pending — they sign in at the portal with ${escHtml(c.email)}. (Invite emails arrive with the backend.)</p>` : ""}
      </div>`;
    }).join("")}`;

  if (!isAdmin()) return;
  $("#addCtr").addEventListener("click", () => {
    const d = readContractor($("#newCtr"));
    const err = contractorError(d);
    const e = $("#ctrErr");
    if (err) { e.textContent = err; e.classList.remove("hidden"); return; }
    Store.addContractor(d, session.email, "contractor.invite");
    renderContractors(el);
  });
  $$("[data-approve]", el).forEach((b) => b.addEventListener("click", () => {
    Store.updateContractor(b.dataset.approve, { status: "approved", approvedAt: new Date().toISOString() }, session.email, "contractor.approve");
    renderContractors(el);
  }));
  $$("[data-reject]", el).forEach((b) => b.addEventListener("click", () => {
    Store.updateContractor(b.dataset.reject, { status: "rejected" }, session.email, "contractor.reject");
    renderContractors(el);
  }));
  $$("[data-verify]", el).forEach((b) => b.addEventListener("click", () => {
    const [cid, did] = b.dataset.verify.split(":");
    const c = Store.contractor(cid);
    Store.updateContractor(cid, { docs: c.docs.map((d) => (d.id === did ? { ...d, verified: true } : d)) }, session.email, "contractor.doc.verify");
    renderContractors(el);
  }));
}

/* ========================================================================
   Questionnaire builder (REQ-03: edit on the fly)
   ======================================================================== */
let builderCat = null;

function categoryPicker(current) {
  return `<select id="catPick">${Store.categories().map((c) => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${c.icon} ${escHtml(c.name)}</option>`).join("")}</select>`;
}

function renderBuilder(el) {
  el = fresh(el);
  builderCat = builderCat || Store.categories()[0].id;
  const c = Store.category(builderCat);
  el.innerHTML = `<div class="toolbar"><h2>Questionnaire builder</h2>${categoryPicker(builderCat)}</div>
    <p class="hint">“Short” questions appear in the free questionnaire; “Detailed” ones in the unlocked report. Pricing effects are set on the Pricing formula page.</p>
    <div id="qList">${c.questions.map((q, i) => builderQuestion(q, i, c.questions.length)).join("")}</div>
    <div class="actions"><button class="btn btn-ghost" id="addQ">+ Add question</button>
      <button class="btn btn-primary" id="saveQs">Save questionnaire</button><span class="ok hidden" id="qSaved">Saved ✓</span></div>`;
  $("#catPick").addEventListener("change", (e) => { builderCat = e.target.value; renderBuilder(el); });

  const draft = () => readBuilder(c);
  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const qs = draft();
    const i = Number(t.dataset.i);
    const act = t.dataset.act;
    if (act === "up" && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
    if (act === "down" && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
    if (act === "del" && confirm("Delete this question?")) qs.splice(i, 1);
    if (act === "addopt") qs[i].options.push({ id: Store.uid("o"), label: "New option", mod: { type: "none", good: 0, better: 0, best: 0 } });
    if (act === "delopt") qs[i].options.splice(Number(t.dataset.o), 1);
    if (["up", "down", "del", "addopt", "delopt"].includes(act)) { c.questions = qs; $("#qList").innerHTML = qs.map((q, k) => builderQuestion(q, k, qs.length)).join(""); }
  }, { once: false });
  el.addEventListener("change", (e) => {
    if (!e.target.matches("[data-k=type]")) return;
    const qs = draft();
    const q = qs[Number(e.target.dataset.i)];
    if ((q.type === "single" || q.type === "multi") && !q.options?.length) q.options = ["Option A", "Option B", "Not sure"].map((label) => ({ id: slug(label), label, mod: { type: "none", good: 0, better: 0, best: 0 } }));
    if (q.type === "number" || q.type === "text") delete q.options;
    c.questions = qs;
    $("#qList").innerHTML = qs.map((qq, k) => builderQuestion(qq, k, qs.length)).join("");
  });
  $("#addQ").addEventListener("click", () => {
    c.questions = draft();
    c.questions.push({ id: Store.uid("q"), text: "New question", type: "single", stage: "short", optional: false, unit: "", trace: null, role: "none", rate: { good: 0, better: 0, best: 0 }, ref: 0, exp: 1, defaultQty: 0, options: [{ id: "yes", label: "Yes", mod: { type: "none", good: 0, better: 0, best: 0 } }, { id: "no", label: "No", mod: { type: "none", good: 0, better: 0, best: 0 } }] });
    $("#qList").innerHTML = c.questions.map((q, k) => builderQuestion(q, k, c.questions.length)).join("");
  });
  $("#saveQs").addEventListener("click", () => {
    c.questions = draft().filter((q) => q.text.trim());
    Store.saveCategory(c, session.email, "questionnaire.update");
    flash($("#qSaved"));
  });
}

function builderQuestion(q, i, n) {
  return `<div class="card bq" data-q="${i}">
    <div class="bq-head">
      <span class="bq-num">${i + 1}</span>
      <input class="bq-text" data-k="text" data-i="${i}" value="${escHtml(q.text)}" />
      <button class="icon-btn" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""} title="Move up">↑</button>
      <button class="icon-btn" data-act="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""} title="Move down">↓</button>
      <button class="icon-btn danger" data-act="del" data-i="${i}" title="Delete">✕</button>
    </div>
    <div class="row">
      <label class="field">Type<select data-k="type" data-i="${i}">${["single", "multi", "number", "text"].map((t) => `<option value="${t}" ${q.type === t ? "selected" : ""}>${{ single: "Single choice", multi: "Multiple choice", number: "Number", text: "Free text" }[t]}</option>`).join("")}</select></label>
      <label class="field">Shown in<select data-k="stage" data-i="${i}"><option value="short" ${q.stage === "short" ? "selected" : ""}>Short (free)</option><option value="detailed" ${q.stage === "detailed" ? "selected" : ""}>Detailed (unlocked)</option></select></label>
      ${q.type === "number" ? `<label class="field">Unit label<input data-k="unit" data-i="${i}" value="${escHtml(q.unit || "")}" /></label>
        <label class="field">Satellite measure<select data-k="trace" data-i="${i}">${["", "perimeter", "line", "area", "roof", "wall"].map((m) => `<option value="${m}" ${(q.trace || "") === m ? "selected" : ""}>${m || "None"}</option>`).join("")}</select></label>` : ""}
    </div>
    ${q.options ? `<div class="opt-list">${q.options.map((o, k) => `<div class="opt-row"><input data-k="opt" data-i="${i}" data-o="${k}" value="${escHtml(o.label)}" />
      <button class="icon-btn danger" data-act="delopt" data-i="${i}" data-o="${k}" title="Remove option">✕</button></div>`).join("")}
      <button class="btn btn-ghost btn-sm" data-act="addopt" data-i="${i}">+ Option</button></div>` : ""}
  </div>`;
}

function readBuilder(c) {
  return $$("#qList .bq").map((card, i) => {
    const prev = c.questions[i];
    const get = (k) => $(`[data-k="${k}"]`, card);
    const q = { ...prev, text: get("text").value.trim(), type: get("type").value, stage: get("stage").value };
    if (get("unit")) q.unit = get("unit").value.trim();
    if (get("trace")) q.trace = get("trace").value || null;
    if (prev.options) {
      q.options = $$("[data-k=opt]", card).map((inp, k) => ({ ...prev.options[k], label: inp.value.trim() || prev.options[k].label }));
    }
    return q;
  });
}

/* ========================================================================
   Pricing formula (admin only) — modifiers on questionnaire variables
   ======================================================================== */
let formulaCat = null;
const MOD_TYPES = { none: "No effect", mult: "× Multiply", add: "+ Add $", value: "= Value" };
const ROLES = { none: "Not used", quantity: "Quantity (× rate)", perUnit: "Per-unit add-on", scale: "Scale factor" };

function renderFormula(el) {
  el = fresh(el);
  if (!isAdmin()) { el.innerHTML = `<p class="error">Admins only.</p>`; return; }
  formulaCat = formulaCat || Store.categories()[0].id;
  const c = JSON.parse(JSON.stringify(Store.category(formulaCat)));

  const tierInputs = (key, obj, step = "0.01") => TIERS.map((t) =>
    `<label class="tier-in">${TIER_LABEL[t]}<input type="number" step="${step}" data-${key}="${t}" value="${obj[t] ?? 0}" /></label>`).join("");

  el.innerHTML = `<div class="toolbar"><h2>Pricing formula</h2>${categoryPicker(formulaCat)}</div>
    <div class="formula-box" id="formulaText"></div>

    <div class="card">
      <h3>Base</h3>
      <div class="row">
        <label class="field">Unit<select id="fUnit">${Object.keys(UNIT_LABEL).map((u) => `<option value="${u}" ${c.unit === u ? "selected" : ""}>${u === "job" ? "Per job" : `Per ${UNIT_LABEL[u].replace(/s$/, "")}`}</option>`).join("")}</select></label>
        <label class="field">Minimum job ($)<input type="number" id="fMin" value="${c.min}" /></label>
      </div>
      <p class="label">Rate per unit by tier</p><div class="tier-row">${tierInputs("rate", c.rate)}</div>
    </div>

    <div class="card">
      <h3>Variables &amp; modifiers</h3>
      <p class="hint"><strong>× Multiply</strong> scales the base price · <strong>+ Add $</strong> adds a fixed amount · <strong>= Value</strong> turns the option into a number used by the variable’s role (e.g. “2 stories” = 2).</p>
      ${c.questions.map((q, i) => formulaVar(q, i)).join("")}
    </div>

    <div class="actions sticky-actions"><button class="btn btn-primary" id="saveFormula">Save formula</button>
      <button class="btn btn-ghost" id="revert">Revert</button><span class="ok hidden" id="fSaved">Saved ✓</span></div>

    <div class="card tester">
      <h3>Test the formula</h3>
      <div class="row"><label class="field sm">State<input id="tState" maxlength="2" value="NC" /></label></div>
      <div class="tester-grid">${c.questions.filter((q) => q.type !== "text").map(testerInput).join("")}</div>
      <div id="testOut"></div>
    </div>`;

  const draft = () => {
    const d = JSON.parse(JSON.stringify(c));
    d.unit = $("#fUnit").value;
    d.min = Number($("#fMin").value) || 0;
    TIERS.forEach((t) => { d.rate[t] = Number($(`[data-rate="${t}"]`).value) || 0; });
    d.questions.forEach((q, i) => {
      const box = $(`[data-var="${i}"]`);
      const role = $("[data-role]", box);
      if (role) q.role = role.value;
      const dq = $("[data-defqty]", box); if (dq) q.defaultQty = Number(dq.value) || 0;
      const ref = $("[data-ref]", box); if (ref) q.ref = Number(ref.value) || 0;
      const exp = $("[data-exp]", box); if (exp) q.exp = Number(exp.value) || 1;
      if ($("[data-prate]", box)) TIERS.forEach((t) => { q.rate[t] = Number($(`[data-prate="${t}"]`, box).value) || 0; });
      (q.options || []).forEach((o, k) => {
        const row = $(`[data-opt="${k}"]`, box);
        o.mod.type = $("[data-mtype]", row).value;
        TIERS.forEach((t) => { o.mod[t] = Number($(`[data-m="${t}"]`, row).value) || 0; });
      });
    });
    return d;
  };

  const refresh = () => {
    const d = draft();
    $("#formulaText").textContent = Pricing.formulaText(d);
    const answers = {};
    $$("[data-test]", el).forEach((inp) => {
      const q = d.questions.find((x) => x.id === inp.dataset.test);
      if (q.type === "multi") { if (inp.checked) (answers[q.id] = answers[q.id] || []).push(inp.value); }
      else if (inp.value !== "") answers[q.id] = q.type === "number" ? Number(inp.value) : inp.value;
    });
    const r = Pricing.evaluate(d, answers, { state: $("#tState").value, settings: Store.settings(), refined: true });
    $("#testOut").innerHTML = `${Report.tierCards(d, r)}<ul class="rationale">${Pricing.rationale(d, r).map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>
      <p class="hint">Point estimates: ${TIERS.map((t) => `${TIER_LABEL[t]} ${fmtUsd(r.tiers[t].point)}`).join(" · ")}</p>`;
  };

  $("#catPick").addEventListener("change", (e) => { formulaCat = e.target.value; renderFormula(el); });
  el.addEventListener("input", (e) => { if (!e.target.closest("#catPick")) refresh(); });
  el.addEventListener("change", (e) => {
    if (e.target.matches("[data-role], [data-mtype]")) { c.questions = draft().questions; renderFormulaKeep(el, c, refresh); }
  });
  $("#saveFormula").addEventListener("click", () => { Store.saveCategory(draft(), session.email, "pricing.formula.update"); flash($("#fSaved")); });
  $("#revert").addEventListener("click", () => renderFormula(el));
  refresh();
}

// Re-render variable controls after a role change without losing other edits
function renderFormulaKeep(el, c, refresh) {
  c.questions.forEach((q, i) => { $(`[data-var="${i}"]`).outerHTML = formulaVar(q, i); });
  refresh();
}

function formulaVar(q, i) {
  const tierCells = (attr, obj) => TIERS.map((t) => `<input type="number" step="0.01" ${attr}="${t}" value="${obj?.[t] ?? 0}" />`).join("");
  const roleSel = `<label class="field">Use as<select data-role>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${q.role === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
  const roleExtra = q.role === "quantity" ? `<label class="field">Default if unknown<input type="number" data-defqty value="${q.defaultQty || 0}" /></label>`
    : q.role === "scale" ? `<label class="field">Reference value<input type="number" data-ref value="${q.ref || 1}" /></label><label class="field">Exponent<input type="number" step="0.05" data-exp value="${q.exp || 1}" /></label>`
    : q.role === "perUnit" ? `<div class="field"><span class="label">$ per unit (Good / Better / Best)</span><div class="tier-row">${tierCells("data-prate", q.rate)}</div></div>` : "";
  let body = "";
  if (q.type === "text") body = `<p class="hint">Free text — no pricing effect.</p>`;
  else {
    const showRole = q.type === "number" || q.options?.some((o) => o.mod.type === "value");
    body = `${showRole || q.type === "number" ? `<div class="row">${roleSel}${roleExtra}</div>` : `<div class="hidden">${roleSel}</div>`}`;
    if (q.options) {
      body += `<table class="table mod-table"><thead><tr><th>Option</th><th>Modifier</th><th>Good</th><th>Better</th><th>Best</th></tr></thead><tbody>
        ${q.options.map((o, k) => `<tr data-opt="${k}"><td>${escHtml(o.label)}</td>
          <td><select data-mtype>${Object.entries(MOD_TYPES).map(([t, l]) => `<option value="${t}" ${o.mod.type === t ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          ${TIERS.map((t) => `<td><input type="number" step="0.01" data-m="${t}" value="${o.mod[t] ?? 0}" /></td>`).join("")}</tr>`).join("")}
        </tbody></table>`;
    }
  }
  return `<div class="var" data-var="${i}"><div class="var-head"><code>${escHtml(q.id)}</code> <strong>${escHtml(q.text)}</strong>
    ${badge(q.stage === "short" ? "Short" : "Detailed")}</div>${body}</div>`;
}

function testerInput(q) {
  if (q.type === "number") return `<label class="field">${escHtml(q.text)}<input type="number" data-test="${q.id}" placeholder="Not sure" /></label>`;
  if (q.type === "single") return `<label class="field">${escHtml(q.text)}<select data-test="${q.id}"><option value="">—</option>${q.options.map((o) => `<option>${escHtml(o.label)}</option>`).join("")}</select></label>`;
  return `<fieldset class="field"><legend>${escHtml(q.text)}</legend><div class="check-grid">${q.options.map((o) => `<label class="check"><input type="checkbox" data-test="${q.id}" value="${escHtml(o.label)}" /> ${escHtml(o.label)}</label>`).join("")}</div></fieldset>`;
}

/* ========================================================================
   Categories, sources, ROI (REQ-05 / REQ-17)
   ======================================================================== */
function renderCategories(el) {
  el.innerHTML = `<h2>Categories &amp; sources</h2>
    <p class="hint">Sources appear as citations in reports. One per line: <code>Label | https://url</code></p>
    ${Store.categories().map((c) => `<div class="card" data-cat="${c.id}">
      <div class="row">
        <label class="field sm">Icon<input data-k="icon" value="${escHtml(c.icon)}" /></label>
        <label class="field">Name<input data-k="name" value="${escHtml(c.name)}" /></label>
        <label class="check"><input type="checkbox" data-k="active" ${c.active ? "checked" : ""} /> Active</label>
      </div>
      <label class="field">Sources<textarea data-k="sources" rows="3">${escHtml(c.sources.map((s) => `${s.label} | ${s.url}`).join("\n"))}</textarea></label>
      <label class="field">Cost vs. value note<textarea data-k="roiNote" rows="2">${escHtml(c.roiNote)}</textarea></label>
      <label class="field">Suggested photos (one per line)<textarea data-k="photos" rows="2">${escHtml(c.photos.join("\n"))}</textarea></label>
      <button class="btn btn-ghost btn-sm" data-save="${c.id}">Save</button> <span class="ok hidden">Saved ✓</span>
    </div>`).join("")}`;
  $$("[data-save]", el).forEach((b) => b.addEventListener("click", () => {
    const card = b.closest("[data-cat]");
    const c = Store.category(b.dataset.save);
    const v = (k) => $(`[data-k="${k}"]`, card);
    c.icon = v("icon").value.trim() || c.icon;
    c.name = v("name").value.trim() || c.name;
    c.active = v("active").checked;
    c.sources = v("sources").value.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter(([l, u]) => l && /^https?:\/\//i.test(u || "")).map(([label, url]) => ({ label, url }));
    c.roiNote = v("roiNote").value.trim();
    c.photos = v("photos").value.split("\n").map((s) => s.trim()).filter(Boolean);
    Store.saveCategory(c, session.email);
    flash(b.nextElementSibling);
  }));
}

/* ========================================================================
   Billing (admin: receivables, refunds) — REQ-23/24 placeholders
   ======================================================================== */
function renderBilling(el) {
  const list = Store.purchases().slice().reverse();
  const open = list.filter((x) => x.status === "billed");
  const age = (x) => (Date.now() - new Date(x.ts).getTime()) / 864e5;
  const buckets = [["0–7 days", 0, 7], ["8–30", 7, 30], ["31–60", 30, 60], ["61–90", 60, 90], ["90+", 90, 1e9]];
  el.innerHTML = `<h2>Billing &amp; receivables</h2>
    <p class="callout">Payment processing (card + ACH) is a placeholder. Settings: card surcharge ${Store.settings().cardFeePct}%.</p>
    <h3>Receivables aging</h3>
    <table class="table"><thead><tr>${buckets.map(([l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody><tr>
      ${buckets.map(([, a, b]) => `<td>${fmtUsd(open.filter((x) => age(x) >= a && age(x) < b).reduce((s, x) => s + x.price, 0))}</td>`).join("")}</tr></tbody></table>
    <h3>Lead charges</h3>
    <table class="table"><thead><tr><th>Date</th><th>Contractor</th><th>Project</th><th>Amount</th><th>How</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr><td>${fmtDate(x.ts)}</td><td>${escHtml(Store.contractor(x.contractorId)?.company || x.contractorId)}</td>
        <td>${escHtml(svcName(Store.project(x.projectId)?.categoryId))}</td><td>${fmtUsd(x.price)}</td><td>${escHtml(x.how)}</td>
        <td>${badge(x.status.replace("_", " "), x.status === "refunded" ? "bad" : x.status === "refund_requested" ? "warn" : "")}${x.refundReason ? `<br/><span class="hint">${escHtml(x.refundReason)}</span>` : ""}</td>
        <td>${x.status === "refund_requested" ? `<button class="btn btn-primary btn-sm" data-refund="${x.id}:1">Approve</button> <button class="btn btn-ghost btn-sm" data-refund="${x.id}:0">Deny</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="hint">No charges yet.</td></tr>`}</tbody></table>`;
  $$("[data-refund]", el).forEach((b) => b.addEventListener("click", () => {
    const [id, ok] = b.dataset.refund.split(":");
    Store.resolveRefund(id, ok === "1", session.email);
    renderBilling(el);
  }));
}

/* ========================================================================
   Settings & compliance
   ======================================================================== */
function renderSettings(el) {
  const s = Store.settings();
  const num = (id, label, v, step = "1") => `<label class="field">${label}<input type="number" step="${step}" id="${id}" value="${v}" /></label>`;
  el.innerHTML = `<h2>Settings</h2>
    <div class="card"><h3>Homeowner paid tier</h3><div class="row">
      ${num("sList", "List price ($, shown struck-through)", s.paidTierListPrice)}${num("sPrice", "Launch price ($)", s.paidTierPrice)}${num("sDays", "Access length (days)", s.subscriptionDays)}</div></div>
    <div class="card"><h3>Contractors</h3><div class="row">
      ${num("sLead", "Lead price ($)", s.leadPrice)}${num("sMember", "Membership ($/month)", s.membershipMonthly)}
      ${num("sBuyers", "Max buyers per lead", s.maxBuyersPerLead)}${num("sFee", "Card surcharge (%)", s.cardFeePct, "0.1")}</div></div>
    <div class="card"><h3>Estimates</h3><div class="row">
      ${num("sSpreadF", "Free range spread (±%)", s.spreadFree)}${num("sSpreadR", "Refined range spread (±%)", s.spreadRefined)}</div></div>
    <div class="card"><h3>Analytics &amp; testing</h3><div class="row">
      <label class="field">GA4 Measurement ID<input id="sGa" placeholder="G-XXXXXXXXXX" value="${escHtml(s.ga4Id)}" /></label>
      ${num("sAb", "Opt-in variant A share (%)", s.abOptInSplit)}</div></div>
    <button class="btn btn-primary" id="saveSettings">Save settings</button> <span class="ok hidden" id="sSaved">Saved ✓</span>
    <div class="card danger-zone"><h3>Demo data</h3><button class="btn btn-ghost" id="reset">Reset all prototype data</button></div>`;
  $("#saveSettings").addEventListener("click", () => {
    const n = (id) => Number($(`#${id}`).value);
    const ga = $("#sGa").value.trim();
    if (ga && !/^G-[A-Z0-9]+$/i.test(ga)) { $("#sGa").classList.add("invalid"); return; }
    Store.saveSettings({
      paidTierListPrice: n("sList"), paidTierPrice: n("sPrice"), subscriptionDays: n("sDays"),
      leadPrice: n("sLead"), membershipMonthly: n("sMember"), maxBuyersPerLead: Math.max(1, n("sBuyers")), cardFeePct: n("sFee"),
      spreadFree: n("sSpreadF"), spreadRefined: n("sSpreadR"), ga4Id: ga, abOptInSplit: Math.min(100, Math.max(0, n("sAb"))),
    }, session.email);
    flash($("#sSaved"));
  });
  $("#reset").addEventListener("click", () => {
    if (!confirm("Delete all prototype data and restore the demo seed?")) return;
    Store.resetDemo(); localStorage.removeItem("ffp.ab.optin"); Session.logout(); location.reload();
  });
}

function renderCompliance(el) {
  const audit = Store.audit().slice().reverse();
  el.innerHTML = `<h2>Compliance &amp; exports</h2>
    <div class="actions">
      <button class="btn btn-ghost btn-sm" data-x="projects">Projects CSV</button>
      <button class="btn btn-ghost btn-sm" data-x="contractors">Contractors CSV</button>
      <button class="btn btn-ghost btn-sm" data-x="purchases">Lead charges CSV</button>
      <button class="btn btn-ghost btn-sm" data-x="audit">Audit log CSV</button>
      <button class="btn btn-ghost btn-sm" data-x="json">Full JSON</button></div>
    <table class="table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
      <tbody>${audit.slice(0, 200).map((a) => `<tr><td>${new Date(a.ts).toLocaleString()}</td><td>${escHtml(a.actor)}</td><td>${escHtml(a.action)}</td>
        <td>${escHtml(a.entity)} ${escHtml(a.entityId)}</td><td class="clip">${escHtml(a.detail)}</td></tr>`).join("")}</tbody></table>`;
  const x = {
    projects: () => downloadFile("projects.csv", Store.exportProjectsCsv(), "text/csv"),
    contractors: () => downloadFile("contractors.csv", Store.exportContractorsCsv(), "text/csv"),
    purchases: () => downloadFile("lead-charges.csv", Store.exportPurchasesCsv(), "text/csv"),
    audit: () => downloadFile("audit.csv", Store.exportAuditCsv(), "text/csv"),
    json: () => downloadFile("ffp-export.json", Store.exportFullJson(), "application/json"),
  };
  $$("[data-x]", el).forEach((b) => b.addEventListener("click", x[b.dataset.x]));
}

/* ========================================================================
   Contractor onboarding (REQ-19): tutorial → profile → credentials → terms
   ======================================================================== */
function renderOnboarding() {
  const c = me();
  if (c.status === "pending_approval") {
    $("#app").innerHTML = `<div class="card narrow"><h2>Thanks — you’re in review</h2>
      <p>Our team is reviewing your profile and credentials. You’ll get full dashboard access once approved.</p></div>`;
    return;
  }
  const step = c.onboardingStep || 0;
  const steps = ["Welcome", "Your business", "Credentials", "Terms"];
  const shell = (body) => `<div class="card narrow wide">
    <div class="stepper">${steps.map((s, i) => `<span class="${i < step ? "done" : i === step ? "current" : ""}">${i + 1}. ${s}</span>`).join("")}</div>${body}</div>`;
  const advance = (patch = {}, action = "contractor.onboarding") => {
    Store.updateContractor(c.id, { status: "onboarding", onboardingStep: step + 1, ...patch }, session.email, action);
    renderOnboarding();
  };

  if (step === 0) {
    $("#app").innerHTML = shell(`<h2>Welcome to FastFreePricing, ${escHtml(c.contactName)}</h2>
      <div class="tour">
        <div><span>📥</span><strong>Leads</strong><p>Homeowners who asked to be contacted for the services you offer, with their project details and price ranges.</p></div>
        <div><span>⚡</span><strong>Auto-buy</strong><p>Turn on auto-buy and matching leads are purchased for you the moment they arrive.</p></div>
        <div><span>🧾</span><strong>Billing</strong><p>See lead charges, request refunds for bad leads, and manage your membership.</p></div>
        <div><span>🪪</span><strong>Credentials</strong><p>Upload your license and insurance — our team verifies them before approval.</p></div>
      </div><button class="btn btn-primary" id="next">Get started</button>`);
    $("#next").addEventListener("click", () => advance());
  }
  if (step === 1) {
    $("#app").innerHTML = shell(`<h2>Confirm your business details</h2><div id="ctrForm">${contractorFields(c)}</div>
      <p class="error hidden" id="err"></p><button class="btn btn-primary" id="next">Continue</button>`);
    $("#next").addEventListener("click", () => {
      const d = readContractor($("#ctrForm"));
      const err = contractorError(d, c.id);
      if (err) { $("#err").textContent = err; $("#err").classList.remove("hidden"); return; }
      advance(d, "contractor.onboarding.profile");
    });
  }
  if (step === 2) {
    $("#app").innerHTML = shell(`<h2>Upload your credentials</h2>
      <p class="hint">At least one document is required. Our team verifies each before approval.</p>
      ${docsTable(c)}${docUploader()}<button class="btn btn-primary" id="next" ${c.docs.length ? "" : "disabled"}>Continue</button>`);
    bindDocUpload(() => renderOnboarding());
    $("#next").addEventListener("click", () => advance());
  }
  if (step === 3) {
    $("#app").innerHTML = shell(`<h2>Review and accept our terms</h2><div class="terms">${escHtml(TERMS_TEXT)}</div>
      <label class="consent"><input type="checkbox" id="agree" /> <span>I agree to the lead terms on behalf of ${escHtml(c.company)}.</span></label>
      <button class="btn btn-primary" id="next">Submit for approval</button>`);
    $("#next").addEventListener("click", () => {
      if (!$("#agree").checked) { $("#agree").parentElement.classList.add("invalid-text"); return; }
      Store.updateContractor(c.id, { status: "pending_approval", termsAcceptedAt: new Date().toISOString(), onboardingStep: 4 }, session.email, "contractor.submit_for_approval");
      renderOnboarding();
    });
  }
}

/* ========================================================================
   Contractor dashboard (REQ-18)
   ======================================================================== */
function renderLeads(el) {
  const c = me();
  const s = Store.settings();
  const mine = Store.purchasesFor(c.id);
  const ownedIds = new Set(mine.filter((x) => x.status !== "refunded").map((x) => x.projectId));
  const leads = Store.leadsFor(c).slice().reverse();
  const available = leads.filter((p) => !ownedIds.has(p.id));
  const owned = leads.filter((p) => ownedIds.has(p.id));

  el.innerHTML = `<div class="card auto-card">
      <div><h3>Auto-buy leads</h3><p class="hint">${c.membership.active ? `Matching leads are purchased automatically at ${fmtUsd(s.leadPrice)} each, up to your monthly cap.` : "Requires an active membership (see Billing)."}</p></div>
      <div class="auto-controls">
        <label class="switch"><input type="checkbox" id="autoBuy" ${c.autoBuy ? "checked" : ""} ${c.membership.active ? "" : "disabled"} /><span></span></label>
        <label class="field sm">Monthly cap<input type="number" min="0" id="cap" value="${c.maxLeadsPerMonth}" /></label>
      </div></div>

    <h2>New leads (${available.length})</h2>
    ${available.map((p) => leadCard(p, false, s)).join("") || `<p class="hint">No new leads in your area right now.</p>`}
    <h2>My leads (${owned.length})</h2>
    ${owned.map((p) => leadCard(p, mine.find((x) => x.projectId === p.id && x.status !== "refunded"), s)).join("") || `<p class="hint">You haven’t purchased any leads yet.</p>`}`;

  $("#autoBuy").addEventListener("change", (e) => Store.updateContractor(c.id, { autoBuy: e.target.checked }, session.email, `autobuy.${e.target.checked ? "on" : "off"}`));
  $("#cap").addEventListener("change", (e) => Store.updateContractor(c.id, { maxLeadsPerMonth: Math.max(0, Number(e.target.value) || 0) }, session.email, "autobuy.cap"));
  $$("[data-buy]", el).forEach((b) => b.addEventListener("click", async () => {
    if (!me().membership.active) { alert("An active membership is required to buy leads."); return; }
    const pay = await Payments.checkout({ amount: s.leadPrice, description: "Lead purchase" });
    if (pay.status !== "succeeded") return;
    const r = Store.buyLead(c.id, b.dataset.buy, "manual", session.email);
    if (!r.ok) alert(r.reason);
    renderLeads(el);
  }));
  $$("[data-refund]", el).forEach((b) => b.addEventListener("click", () => {
    const reason = prompt("Why is this lead invalid? (wrong number, duplicate, out of area, not the decision-maker…)");
    if (!reason) return;
    Store.requestRefund(b.dataset.refund, reason.slice(0, 300), session.email);
    renderLeads(el);
  }));
}

function leadCard(p, purchase, s) {
  const c = Store.category(p.categoryId);
  const r = p.refined || p.free;
  const sold = Store.buyersOf(p.id).length;
  const contact = p.contact || {};
  return `<div class="card">
    <div class="card-head"><h3>${c.icon} ${escHtml(c.name)} · ${escHtml(p.address.city)}, ${escHtml(p.address.state)} ${escHtml(p.address.zip)}</h3>
      <div>${ownBadge(p)} ${p.photos?.length ? badge(`${p.photos.length} photos`) : ""}</div></div>
    <p class="hint">${fmtDate(p.leadAt || p.createdAt)} · Timeline: ${escHtml(p.universal.G4 || "—")} · ${escHtml(p.universal.G2 || "")} · ${sold}/${s.maxBuyersPerLead} buyers</p>
    <p>Estimated: ${TIERS.map((t) => `${TIER_LABEL[t]} <strong>${fmtUsd(r.tiers[t].low)}–${fmtUsd(r.tiers[t].high)}</strong>`).join(" · ")}</p>
    ${purchase ? `<div class="lead-contact"><strong>${escHtml(contact.firstName)} ${escHtml(contact.lastName)}</strong> · ${escHtml(contact.phone)} · ${escHtml(contact.email)}<br/>${escHtml(p.address.street)}</div>
      <details><summary>Project answers</summary>${answersDl(c, p.answers)}<div class="thumbs">${(p.photos || []).map((ph) => `<img src="${ph.dataUrl}" alt="" />`).join("")}</div></details>
      ${purchase.status === "billed" ? `<button class="btn btn-ghost btn-sm" data-refund="${purchase.id}">Report bad lead</button>` : badge(purchase.status.replace("_", " "), "warn")}`
      : sold >= s.maxBuyersPerLead ? badge("Sold out") : `<button class="btn btn-primary btn-sm" data-buy="${p.id}">Buy lead — ${fmtUsd(s.leadPrice)}</button>`}
  </div>`;
}

function renderProfile(el) {
  const c = me();
  el.innerHTML = `<h2>${escHtml(c.company)}</h2><div class="card" id="pf">${contractorFields(c)}
    <button class="btn btn-primary" id="save">Save profile</button> <span class="ok hidden" id="ok">Saved ✓</span><p class="error hidden" id="err"></p></div>`;
  $("#save").addEventListener("click", () => {
    const d = readContractor($("#pf"));
    const err = contractorError(d, c.id);
    if (err) { $("#err").textContent = err; $("#err").classList.remove("hidden"); return; }
    Store.updateContractor(c.id, d, session.email, "contractor.profile.update");
    flash($("#ok"));
  });
}

function docsTable(c) {
  return c.docs.length ? `<table class="table"><thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead><tbody>
    ${c.docs.map((d) => `<tr><td>${escHtml(DOC_TYPES[d.type] || d.type)}</td><td>${escHtml(d.name)}</td><td>${fmtDate(d.uploadedAt)}</td><td>${d.verified ? badge("Verified", "good") : badge("Pending review")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="hint">No documents yet.</p>`;
}
const docUploader = () => `<div class="upload-row"><select id="docType">${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
  <input type="file" id="docFile" accept=".pdf,image/*" /><button class="btn btn-ghost btn-sm" id="docUp">Upload</button></div>`;
function bindDocUpload(after) {
  $("#docUp").addEventListener("click", () => {
    const f = $("#docFile").files[0];
    if (!f) return;
    const c = me();
    const doc = { id: Store.uid("doc"), type: $("#docType").value, name: f.name, uploadedAt: new Date().toISOString(), verified: false };
    Store.updateContractor(c.id, { docs: [...c.docs, doc] }, session.email, "contractor.doc.upload");
    after();
  });
}
function renderDocs(el) {
  el.innerHTML = `<h2>Documents &amp; credentials</h2>${docsTable(me())}${docUploader()}`;
  bindDocUpload(() => renderDocs(el));
}

function renderMyBilling(el) {
  const c = me();
  const s = Store.settings();
  const list = Store.purchasesFor(c.id).slice().reverse();
  const owed = list.filter((x) => x.status === "billed").reduce((t, x) => t + x.price, 0);
  el.innerHTML = `<h2>Billing</h2>
    <div class="card"><h3>Membership</h3>
      ${c.membership.active ? `<p>${badge("Active", "good")} since ${fmtDate(c.membership.since)} · ${fmtUsd(s.membershipMonthly)}/month</p><button class="btn btn-ghost btn-sm" id="cancelM">Cancel membership</button>`
        : `<p>Membership unlocks lead purchases and auto-buy. ${fmtUsd(s.membershipMonthly)}/month.</p><button class="btn btn-primary" id="joinM">Start membership</button>`}</div>
    <div class="card"><h3>Payment method</h3><p class="hint">Card or ACH processing is a placeholder. Card payments include a ${s.cardFeePct}% surcharge; ACH has no surcharge.</p></div>
    <div class="card"><h3>Lead charges</h3><p>Outstanding: <strong>${fmtUsd(owed)}</strong></p>
      <table class="table"><thead><tr><th>Date</th><th>Lead</th><th>Amount</th><th>How</th><th>Status</th></tr></thead><tbody>
      ${list.map((x) => `<tr><td>${fmtDate(x.ts)}</td><td>${escHtml(svcName(Store.project(x.projectId)?.categoryId))}</td><td>${fmtUsd(x.price)}</td><td>${escHtml(x.how)}</td><td>${escHtml(x.status.replace("_", " "))}</td></tr>`).join("") || `<tr><td colspan="5" class="hint">No charges yet.</td></tr>`}</tbody></table></div>`;
  const join = $("#joinM");
  if (join) join.addEventListener("click", async () => {
    const pay = await Payments.checkout({ amount: s.membershipMonthly, description: `Membership — ${c.company}`, recurring: true });
    if (pay.status !== "succeeded") return;
    Store.updateContractor(c.id, { membership: { active: true, since: new Date().toISOString(), ref: pay.id } }, session.email, "membership.start");
    renderMyBilling(el);
  });
  const cancel = $("#cancelM");
  if (cancel) cancel.addEventListener("click", () => {
    if (!confirm("Cancel membership? Auto-buy will turn off.")) return;
    Store.updateContractor(c.id, { membership: { active: false, since: null }, autoBuy: false }, session.email, "membership.cancel");
    renderMyBilling(el);
  });
}

function renderTerms(el) {
  const c = me();
  el.innerHTML = `<h2>Terms</h2><div class="card"><div class="terms">${escHtml(TERMS_TEXT)}</div>
    <p class="hint">Accepted ${fmtDate(c.termsAcceptedAt)}.</p></div>`;
}

boot();
