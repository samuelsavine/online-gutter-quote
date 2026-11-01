"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATUS_LABEL = {
  quoted: "Free estimate", report_purchased: "Report purchased",
  report_in_progress: "Report in progress", report_delivered: "Report delivered",
};

const TABS = {
  admin: ["Submissions", "Report queue", "Businesses", "Price book", "Settings", "Compliance"],
  sales: ["Submissions", "Businesses"],
  expert: ["Report queue"],
  business: ["Profile", "Leads", "Membership"],
};

let session = null;

/* ========================================================================
   Auth views: sign in · list your business · claim a listing
   ======================================================================== */
function renderLogin(view = "signin") {
  const el = $("#loginView");
  if (view === "signin") {
    el.innerHTML = `<div class="estimate-card login-card">
      <span class="step-tag">Portal</span>
      <h2>Sign in</h2>
      <div class="field"><label for="loginEmail">Email</label>
        <input type="email" id="loginEmail" autocomplete="email" placeholder="you@company.com" /></div>
      <button class="btn btn-primary" id="loginBtn">Sign in</button>
      <p class="field-error hidden" id="loginError">No account found for that email.</p>
      <div class="auth-links">
        <button class="btn btn-ghost btn-sm" data-view="signup">List your business</button>
        <button class="btn btn-ghost btn-sm" data-view="claim">Claim an existing listing</button>
      </div>
      <div class="demo-hint"><strong>Prototype accounts</strong> (no password):
        <ul>
          <li>admin@fastfreepricing.com — admin</li>
          <li>sales@fastfreepricing.com — sales</li>
          <li>expert@fastfreepricing.com — report expert</li>
          <li>maria@capefearexteriors.com — Associate business</li>
          <li>deshawn@coastalrain.com — Level 1 business</li>
        </ul></div>
    </div>`;
    const go = () => {
      const s = Session.login($("#loginEmail").value);
      if (!s) { $("#loginError").classList.remove("hidden"); return; }
      session = s;
      showPortal();
    };
    $("#loginBtn").addEventListener("click", go);
    $("#loginEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  if (view === "signup") {
    el.innerHTML = `<div class="estimate-card login-card wide-card">
      <span class="step-tag">List your business</span>
      <h2>Create your free Level 1 profile</h2>
      <p class="step-hint">Tell homeowners what you do. Upgrade to Associate any time to access leads.</p>
      ${businessFormHtml({})}
      <button class="btn btn-primary" id="signupBtn">Create profile</button>
      <p class="field-error hidden" id="signupError"></p>
      <div class="auth-links"><button class="btn btn-ghost btn-sm" data-view="signin">Back to sign in</button></div>
    </div>`;
    $("#signupBtn").addEventListener("click", () => {
      const data = readBusinessForm(el);
      const err = validateBusiness(data, true);
      if (err) { showErr("#signupError", err); return; }
      Store.addBusiness({ ...data, source: "self", claimed: true, verified: false }, data.email, "business.signup");
      session = Session.login(data.email);
      showPortal();
    });
  }

  if (view === "claim") {
    el.innerHTML = `<div class="estimate-card login-card wide-card">
      <span class="step-tag">Claim your listing</span>
      <h2>Is your business already listed?</h2>
      <p class="step-hint">We pre-build profiles from public license records. Search by business name or license number.</p>
      <div class="field"><input id="claimSearch" placeholder="e.g. Seaside Decks or NC-GC-81230" /></div>
      <div id="claimResults"></div>
      <div class="auth-links"><button class="btn btn-ghost btn-sm" data-view="signin">Back to sign in</button></div>
    </div>`;
    const search = () => {
      const term = $("#claimSearch").value.trim().toLowerCase();
      const hits = term.length < 2 ? [] : Store.businesses().filter((b) => !b.claimed &&
        (b.name.toLowerCase().includes(term) || (b.licenseNumber || "").toLowerCase().includes(term)));
      $("#claimResults").innerHTML = hits.map((b) => `<div class="job-card">
        <div class="job-card-head"><h3>${escHtml(b.name)}</h3><span class="badge">${escHtml(b.licenseNumber || "No license on file")}</span></div>
        <p class="step-hint">${escHtml(b.city)}, ${escHtml(b.state)} · ${b.services.map((s) => SERVICES_BY_ID[s]?.name).filter(Boolean).join(", ")}</p>
        <div class="upload-row">
          <input type="email" placeholder="Your business email" data-claim-email="${b.id}" />
          <button class="btn btn-primary btn-sm" data-claim="${b.id}">Claim</button>
        </div>
      </div>`).join("") || (term.length >= 2 ? `<p class="empty-note">No unclaimed listing found — <button class="btn btn-ghost btn-sm" data-view="signup">create one instead</button></p>` : "");
      $$("[data-claim]").forEach((btn) => btn.addEventListener("click", () => {
        const email = $(`[data-claim-email="${btn.dataset.claim}"]`).value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        if (emailTaken(email)) { alert("That email is already in use."); return; }
        // Production: verify ownership (license-board contact, phone/mail code) before granting the claim
        Store.updateBusiness(btn.dataset.claim, { claimed: true, email }, email, "business.claim");
        session = Session.login(email);
        showPortal();
      }));
      bindViewLinks();
    };
    $("#claimSearch").addEventListener("input", search);
  }
  bindViewLinks();
}

function bindViewLinks() {
  $$("[data-view]").forEach((b) => { b.onclick = () => renderLogin(b.dataset.view); });
}

function showErr(sel, msg) { const e = $(sel); e.textContent = msg; e.classList.remove("hidden"); }

const emailTaken = (email, exceptId) =>
  Store.users().some((u) => u.email === email) ||
  Store.businesses().some((b) => b.id !== exceptId && (b.email || "").toLowerCase() === email);

/* ---------- business form (shared by signup + profile) ---------- */
function businessFormHtml(b) {
  const v = (k) => escHtml(b[k] || "");
  return `
    <div class="field-row">
      <div class="field"><label>Business name<input data-f="name" value="${v("name")}" /></label></div>
      <div class="field"><label>Contact name<input data-f="contactName" value="${v("contactName")}" /></label></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Email<input type="email" data-f="email" value="${v("email")}" /></label></div>
      <div class="field"><label>Phone<input type="tel" data-f="phone" value="${v("phone")}" /></label></div>
    </div>
    <div class="field-row">
      <div class="field"><label>City<input data-f="city" value="${v("city")}" /></label></div>
      <div class="field field-sm"><label>State<input data-f="state" maxlength="2" value="${v("state")}" /></label></div>
      <div class="field field-sm"><label>ZIP<input data-f="zip" value="${v("zip")}" /></label></div>
    </div>
    <div class="field-row">
      <div class="field"><label>License number (if any)<input data-f="licenseNumber" value="${v("licenseNumber")}" /></label></div>
      <div class="field"><label>License type<input data-f="licenseType" value="${v("licenseType")}" /></label></div>
    </div>
    <div class="field"><label>States you serve (comma-separated)<input data-f="serviceStates" value="${escHtml((b.serviceStates || []).join(", "))}" placeholder="NC, SC" /></label></div>
    <p class="field-label">Services you provide</p>
    <div class="check-grid">${SERVICES.map((s) => `
      <label class="check-item"><input type="checkbox" data-svc="${s.id}" ${(b.services || []).includes(s.id) ? "checked" : ""} />
        ${s.icon} ${escHtml(s.name)}</label>`).join("")}</div>`;
}

function readBusinessForm(root) {
  const data = {};
  $$("[data-f]", root).forEach((i) => { data[i.dataset.f] = i.value.trim(); });
  data.state = data.state.toUpperCase();
  data.email = data.email.toLowerCase();
  data.serviceStates = data.serviceStates.split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  if (!data.serviceStates.length && data.state) data.serviceStates = [data.state];
  data.services = $$("[data-svc]:checked", root).map((c) => c.dataset.svc);
  return data;
}

function validateBusiness(d, isNew, selfId) {
  if (!d.name || !d.contactName) return "Business and contact name are required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "Enter a valid email.";
  if (emailTaken(d.email, selfId)) return "That email is already in use.";
  if (!/^[A-Z]{2}$/.test(d.state)) return "Enter a 2-letter state.";
  if (!d.services.length) return "Select at least one service.";
  return isNew && !d.phone ? "Phone is required." : null;
}

/* ========================================================================
   Portal shell
   ======================================================================== */
function showPortal() {
  $("#loginView").classList.add("hidden");
  $("#portalView").classList.remove("hidden");
  $("#whoami").textContent = `${session.name} · ${session.role}`;
  $("#whoami").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  $("#logoutBtn").onclick = () => { Session.logout(); location.reload(); };
  const tabs = TABS[session.role];
  $("#tabs").innerHTML = tabs.map((t, i) => `<button class="tab ${i === 0 ? "active" : ""}" data-tab="${t}">${t}</button>`).join("");
  $$("#tabs .tab").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
  openTab(tabs[0]);
}

function openTab(tab) {
  $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const el = $("#tabContent");
  ({
    Submissions: renderSubmissions, "Report queue": renderReportQueue, Businesses: renderBusinesses,
    "Price book": renderPriceBook, Settings: renderSettings, Compliance: renderCompliance,
    Profile: renderProfile, Leads: renderLeads, Membership: renderMembership,
  })[tab](el);
}

/* ---------- shared: submission detail ---------- */
function answersHtml(svcId, answers) {
  const svc = SERVICES_BY_ID[svcId];
  return `<dl class="job-dl">${svc.questions.map((qq) => {
    const a = answers[qq.id];
    const val = Array.isArray(a) ? a.join(", ") : a === "" || a == null ? "—" : String(a);
    return `<dt>${escHtml(qq.t)}</dt><dd>${escHtml(val)}</dd>`;
  }).join("")}</dl>`;
}

function universalHtml(sub) {
  const rows = [...UNIVERSAL, DELIVERY_Q].map((qq) => {
    const a = sub.universal[qq.id];
    return `<dt>${escHtml(qq.t)}</dt><dd>${escHtml(Array.isArray(a) ? a.join(", ") : a || "—")}</dd>`;
  }).join("");
  return `<dl class="job-dl">${rows}</dl>`;
}

const photoStrip = (photos) => photos?.length
  ? `<div class="thumb-row">${photos.map((p) => `<figure><img src="${p.dataUrl}" alt="${escHtml(p.label || p.name)}" /><figcaption>${escHtml(p.label || "")}</figcaption></figure>`).join("")}</div>`
  : "";

function submissionDetail(sub, { showContact = true } = {}) {
  return `
    ${showContact ? `<p><strong>${escHtml(sub.contact.firstName)} ${escHtml(sub.contact.lastName)}</strong> ·
      ${escHtml(sub.contact.email)} · ${escHtml(sub.contact.phone)}<br/>
      ${escHtml(sub.address.street)}, ${escHtml(sub.address.city)}, ${escHtml(sub.address.state)} ${escHtml(sub.address.zip)}</p>` :
      `<p>${escHtml(sub.address.city)}, ${escHtml(sub.address.state)} ${escHtml(sub.address.zip)}</p>`}
    <details><summary>Property &amp; preferences</summary>${universalHtml(sub)}</details>
    ${photoStrip(sub.generalPhotos)}
    ${sub.projects.map((p) => `<div class="project-block">
      <div class="quote-row"><strong>${SERVICES_BY_ID[p.serviceId].icon} ${escHtml(p.serviceName)}</strong>
        <span class="quote-range">${fmtUsd(p.estimate.low)}–${fmtUsd(p.estimate.high)}</span></div>
      <details><summary>Answers</summary>${answersHtml(p.serviceId, p.answers)}</details>
      ${photoStrip(sub.advanced?.photos?.[p.serviceId])}
    </div>`).join("")}`;
}

/* ========================================================================
   Staff: submissions
   ======================================================================== */
function renderSubmissions(el) {
  const subs = Store.submissions().slice().reverse();
  el.innerHTML = `<h2>Submissions (${subs.length})</h2>
    ${subs.length ? "" : `<p class="empty-note">No submissions yet — complete the homeowner questionnaire to create one.</p>`}
    <div class="job-cards">${subs.map((s) => `
      <div class="job-card">
        <div class="job-card-head">
          <h3>${escHtml(s.contact.firstName)} ${escHtml(s.contact.lastName)} · ${escHtml(s.address.city)}, ${escHtml(s.address.state)}</h3>
          <span class="badge ${s.status === "report_delivered" ? "badge-good" : ""}">${STATUS_LABEL[s.status]}</span>
        </div>
        <p class="step-hint">${fmtDate(s.createdAt)} · ${s.projects.map((p) => escHtml(p.serviceName)).join(", ")} ·
          ${s.contact.shareWithPros ? "shareable lead" : "not shared with businesses"}</p>
        <details><summary>Details</summary>${submissionDetail(s)}</details>
      </div>`).join("")}</div>`;
}

/* ========================================================================
   Expert: report queue + editor
   ======================================================================== */
function renderReportQueue(el) {
  const subs = Store.submissions().filter((s) => s.advanced).reverse();
  el.innerHTML = `<h2>Advanced Report queue</h2>
    ${subs.length ? "" : `<p class="empty-note">No Advanced Reports purchased yet.</p>`}
    <table class="data-table"><thead><tr><th>Purchased</th><th>Customer</th><th>Projects</th><th>Status</th><th></th></tr></thead>
      <tbody>${subs.map((s) => `<tr>
        <td>${fmtDate(s.advanced.purchasedAt)}</td>
        <td>${escHtml(s.contact.firstName)} ${escHtml(s.contact.lastName)}<br/><span class="step-hint">${escHtml(s.address.city)}, ${escHtml(s.address.state)}</span></td>
        <td>${s.projects.map((p) => escHtml(p.serviceName)).join(", ")}</td>
        <td><span class="badge ${s.status === "report_delivered" ? "badge-good" : ""}">${STATUS_LABEL[s.status]}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-open="${s.id}">${s.status === "report_delivered" ? "View" : "Open"}</button></td>
      </tr>`).join("")}</tbody></table>
    <div id="reportEditor"></div>`;
  $$("[data-open]", el).forEach((b) => b.addEventListener("click", () => renderReportEditor($("#reportEditor"), b.dataset.open)));
}

function renderReportEditor(el, subId) {
  const sub = Store.submission(subId);
  const draft = sub.advanced.report || sub.advanced.draft || {
    summary: "",
    projects: sub.projects.map((p) => ({ serviceId: p.serviceId, low: p.estimate.low, high: p.estimate.high, notes: "", lineItems: [] })),
  };
  const published = sub.status === "report_delivered";

  el.innerHTML = `<div class="estimate-card report-editor">
    <span class="step-tag">${published ? "Published report" : "Report editor"}</span>
    <h3>${escHtml(sub.contact.firstName)} ${escHtml(sub.contact.lastName)} — ${escHtml(sub.address.street)}, ${escHtml(sub.address.city)}</h3>
    ${sub.advanced.customerNotes ? `<p class="callout">Customer notes: ${escHtml(sub.advanced.customerNotes)}</p>` : ""}
    <details><summary>Property &amp; preferences</summary>${universalHtml(sub)}</details>
    ${draft.projects.map((rp, pi) => {
      const p = sub.projects.find((x) => x.serviceId === rp.serviceId);
      return `<div class="project-block" data-pi="${pi}">
        <h4>${SERVICES_BY_ID[rp.serviceId].icon} ${escHtml(p.serviceName)}
          <span class="step-hint">free estimate ${fmtUsd(p.estimate.low)}–${fmtUsd(p.estimate.high)}</span></h4>
        ${photoStrip(sub.advanced.photos[rp.serviceId])}
        <details><summary>Customer answers</summary>${answersHtml(p.serviceId, p.answers)}</details>
        <div class="field-row">
          <label class="field">Expert low ($)<input type="number" data-k="low" value="${rp.low}" ${published ? "disabled" : ""} /></label>
          <label class="field">Expert high ($)<input type="number" data-k="high" value="${rp.high}" ${published ? "disabled" : ""} /></label>
        </div>
        <table class="data-table li-table"><thead><tr><th>Line item</th><th>Low</th><th>High</th><th></th></tr></thead>
          <tbody>${rp.lineItems.map((li) => lineItemRow(li, published)).join("")}</tbody></table>
        ${published ? "" : `<button class="btn btn-ghost btn-sm" data-add-li>+ Line item</button>`}
        <label class="field">Notes for the homeowner<textarea data-k="notes" rows="2" ${published ? "disabled" : ""}>${escHtml(rp.notes)}</textarea></label>
      </div>`;
    }).join("")}
    <label class="field">Report summary<textarea id="repSummary" rows="3" ${published ? "disabled" : ""}>${escHtml(draft.summary)}</textarea></label>
    ${published ? "" : `<div class="job-actions">
      <button class="btn btn-ghost" id="saveDraft">Save draft</button>
      <button class="btn btn-primary" id="publishReport">Publish to homeowner</button>
    </div><p class="field-error hidden" id="repErr"></p>`}
  </div>`;

  if (published) return;
  $$("[data-add-li]", el).forEach((b) => b.addEventListener("click", () => {
    b.parentElement.querySelector(".li-table tbody").insertAdjacentHTML("beforeend", lineItemRow({ label: "", low: 0, high: 0 }, false));
    bindLineItemRemove(el);
  }));
  bindLineItemRemove(el);

  const collect = () => ({
    summary: $("#repSummary").value.trim(),
    projects: $$("[data-pi]", el).map((blk, pi) => ({
      serviceId: draft.projects[pi].serviceId,
      low: Number($('[data-k="low"]', blk).value) || 0,
      high: Number($('[data-k="high"]', blk).value) || 0,
      notes: $('[data-k="notes"]', blk).value.trim(),
      lineItems: $$(".li-row", blk).map((r) => ({
        label: $('[data-li="label"]', r).value.trim(),
        low: Number($('[data-li="low"]', r).value) || 0,
        high: Number($('[data-li="high"]', r).value) || 0,
      })).filter((li) => li.label),
    })),
  });

  $("#saveDraft").addEventListener("click", () => {
    Store.updateSubmission(sub.id, { status: "report_in_progress", advanced: { ...sub.advanced, draft: collect() } },
      session.email, "advanced_report.draft");
    renderReportQueue($("#tabContent"));
  });
  $("#publishReport").addEventListener("click", () => {
    const report = collect();
    const bad = report.projects.find((p) => !(p.low > 0 && p.high >= p.low));
    if (bad) { showErr("#repErr", `Check the price range for ${SERVICES_BY_ID[bad.serviceId].name}.`); return; }
    Store.updateSubmission(sub.id, {
      status: "report_delivered",
      advanced: { ...sub.advanced, draft: null, report: { ...report, expertName: session.name, publishedAt: new Date().toISOString() } },
    }, session.email, "advanced_report.publish");
    renderReportQueue($("#tabContent"));
  });
}

const lineItemRow = (li, disabled) => `<tr class="li-row">
  <td><input data-li="label" value="${escHtml(li.label)}" ${disabled ? "disabled" : ""} /></td>
  <td><input type="number" data-li="low" value="${li.low}" ${disabled ? "disabled" : ""} /></td>
  <td><input type="number" data-li="high" value="${li.high}" ${disabled ? "disabled" : ""} /></td>
  <td>${disabled ? "" : `<button class="btn btn-ghost btn-sm" data-rm-li>✕</button>`}</td></tr>`;

function bindLineItemRemove(root) {
  $$("[data-rm-li]", root).forEach((b) => { b.onclick = () => b.closest("tr").remove(); });
}

/* ========================================================================
   Staff: businesses + CSV import
   ======================================================================== */
// Maps license classifications / trade keywords to catalog services
const TRADE_MAP = [
  [/plumb/i, ["plumbing"]],
  [/electric/i, ["electrical"]],
  [/mechanical|hvac|heating|air cond|refrigerat/i, ["hvac"]],
  [/roof/i, ["roofing", "gutters"]],
  [/gutter/i, ["gutters"]],
  [/insulat/i, ["insulation"]],
  [/solar|photovoltaic/i, ["solar", "electrical"]],
  [/paint/i, ["painting"]],
  [/floor/i, ["flooring"]],
  [/fence/i, ["fences"]],
  [/concrete|paving|masonry/i, ["concrete"]],
  [/pressure|wash|clean/i, ["exterior-cleaning"]],
  [/garage door/i, ["garage-doors"]],
  [/general|residential|building/i, ["roofing", "siding", "windows", "doors", "decks", "kitchen", "bathroom"]],
];
const servicesFromTrade = (text) => [...new Set(TRADE_MAP.flatMap(([re, svcs]) => (re.test(text) ? svcs : [])))];

const CSV_COLUMNS = ["name", "contact_name", "email", "phone", "city", "state", "zip", "license_number", "license_type", "trade"];

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { added: 0, skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r, name) => (r[header.indexOf(name)] || "").trim();
  const existing = Store.businesses();
  let added = 0, skipped = 0;
  rows.slice(1).forEach((r) => {
    const lic = col(r, "license_number");
    const name = col(r, "name");
    const st = col(r, "state").toUpperCase();
    const dupe = existing.some((b) => (lic && b.licenseNumber === lic) || b.name.toLowerCase() === name.toLowerCase());
    if (!name || !/^[A-Z]{2}$/.test(st) || dupe) { skipped++; return; }
    Store.addBusiness({
      name, contactName: col(r, "contact_name"), email: "", phone: col(r, "phone"),
      city: col(r, "city"), state: st, zip: col(r, "zip"), licenseNumber: lic, licenseType: col(r, "license_type"),
      services: servicesFromTrade(`${col(r, "license_type")} ${col(r, "trade")}`),
      source: "import", claimed: false, verified: false,
    }, session.email, "business.import");
    added++;
  });
  return { added, skipped };
}

function renderBusinesses(el) {
  const list = Store.businesses();
  const isAdmin = session.role === "admin";
  el.innerHTML = `<h2>Businesses (${list.length})</h2>
    ${isAdmin ? `<div class="estimate-card import-card">
      <h3>Import from license records (CSV)</h3>
      <p class="step-hint">Columns: ${CSV_COLUMNS.join(", ")}. Imported records become unclaimed Level 1 profiles; services are
        inferred from license type / trade. Duplicates (same license # or name) are skipped.</p>
      <div class="upload-row">
        <input type="file" id="csvFile" accept=".csv,text/csv" />
        <button class="btn btn-primary btn-sm" id="csvImport">Import</button>
        <button class="btn btn-ghost btn-sm" id="csvTemplate">Download template</button>
        <span class="save-ok hidden" id="csvResult"></span>
      </div>
    </div>` : ""}
    <table class="data-table"><thead><tr><th>Business</th><th>Location</th><th>License</th><th>Services</th><th>Tier</th><th>Source</th>${isAdmin ? "<th></th>" : ""}</tr></thead>
      <tbody>${list.map((b) => `<tr>
        <td><strong>${escHtml(b.name)}</strong><br/><span class="step-hint">${escHtml(b.contactName)} ${escHtml(b.phone)}</span></td>
        <td>${escHtml(b.city)}, ${escHtml(b.state)}</td>
        <td>${escHtml(b.licenseNumber || "—")}<br/><span class="step-hint">${escHtml(b.licenseType || "")}</span></td>
        <td class="detail-cell">${b.services.map((s) => SERVICES_BY_ID[s]?.icon).join(" ")}</td>
        <td><span class="badge ${b.tier === "associate" ? "badge-good" : ""}">${b.tier === "associate" ? "Associate" : "Level 1"}</span></td>
        <td>${escHtml(b.source)}${b.claimed ? " · claimed" : " · unclaimed"}${b.verified ? " · ✔" : ""}</td>
        ${isAdmin ? `<td>${b.verified ? "" : `<button class="btn btn-ghost btn-sm" data-verify="${b.id}">Verify</button>`}</td>` : ""}
      </tr>`).join("")}</tbody></table>`;

  if (!isAdmin) return;
  $("#csvTemplate").addEventListener("click", () => downloadFile("business-import-template.csv",
    `${CSV_COLUMNS.join(",")}\nExample Roofing Co,Jane Doe,,(910) 555-0100,Wilmington,NC,28401,NC-GC-12345,General Contractor - Residential,Roofing\n`, "text/csv"));
  $("#csvImport").addEventListener("click", async () => {
    const f = $("#csvFile").files[0];
    if (!f) return;
    const { added, skipped } = importCsv(await f.text());
    renderBusinesses(el);
    const r = $("#csvResult");
    r.textContent = `Imported ${added}, skipped ${skipped}`;
    r.classList.remove("hidden");
  });
  $$("[data-verify]", el).forEach((b) => b.addEventListener("click", () => {
    Store.updateBusiness(b.dataset.verify, { verified: true }, session.email, "business.verify");
    renderBusinesses(el);
  }));
}

/* ========================================================================
   Admin: price book, settings, compliance
   ======================================================================== */
function renderPriceBook(el) {
  const s = Store.settings();
  el.innerHTML = `<h2>Price book</h2>
    <p class="callout">⚠ Values are <strong>placeholders</strong> for demonstration. Replace with licensed or vetted pricing data before launch.</p>
    <p class="step-hint">Base unit price range before option multipliers, add-ons, regional and preference adjustments.</p>
    <table class="data-table"><thead><tr><th>Service</th><th>Unit</th><th>Low</th><th>High</th><th>Minimum job</th></tr></thead>
      <tbody>${SERVICES.map((svc) => {
        const p = { ...svc.pricing, ...(s.priceBook[svc.id] || {}) };
        const unit = { lf: "per linear ft", sqft: "per sq ft", each: "per unit", job: "per job" }[p.unit];
        return `<tr data-pb="${svc.id}"><td>${svc.icon} ${escHtml(svc.name)}</td><td>${unit}</td>
          <td><input type="number" step="0.01" class="inline-input" data-k="low" value="${p.low}" /></td>
          <td><input type="number" step="0.01" class="inline-input" data-k="high" value="${p.high}" /></td>
          <td><input type="number" step="1" class="inline-input" data-k="min" value="${p.min}" /></td></tr>`;
      }).join("")}</tbody></table>
    <h3>Regional multipliers (1.00 = national average)</h3>
    <div class="state-grid">${Object.keys(STATE_MULT).map((st) => `
      <label class="state-cell">${st}<input type="number" step="0.01" class="inline-input" data-st="${st}" value="${(s.stateMult[st] ?? STATE_MULT[st]).toFixed(2)}" /></label>`).join("")}</div>
    <button class="btn btn-primary" id="savePb">Save price book</button><span class="save-ok hidden" id="pbSaved">Saved ✓</span>`;

  $("#savePb").addEventListener("click", () => {
    const priceBook = {};
    $$("[data-pb]", el).forEach((row) => {
      const id = row.dataset.pb, base = SERVICES_BY_ID[id].pricing;
      const vals = Object.fromEntries($$("[data-k]", row).map((i) => [i.dataset.k, parseFloat(i.value)]));
      const diff = Object.fromEntries(Object.entries(vals).filter(([k, v]) => v > 0 && v !== base[k]));
      if (Object.keys(diff).length) priceBook[id] = diff;
    });
    const stateMult = {};
    $$("[data-st]", el).forEach((i) => {
      const v = parseFloat(i.value);
      if (v > 0 && Math.abs(v - STATE_MULT[i.dataset.st]) > 0.001) stateMult[i.dataset.st] = v;
    });
    Store.saveSettings({ priceBook, stateMult }, session.email);
    flash("#pbSaved");
  });
}

function renderSettings(el) {
  const s = Store.settings();
  el.innerHTML = `<h2>Platform settings</h2>
    <p class="callout">Payment processing is a placeholder — no charges are made in this prototype.</p>
    <div class="rate-grid">
      <label class="field">Advanced Report price ($)<input type="number" id="setReport" value="${s.advancedReportPrice}" /></label>
      <label class="field">Associate membership ($/month)<input type="number" id="setAssoc" value="${s.associateMonthlyPrice}" /></label>
      <label class="field">Lead unlock price ($)<input type="number" id="setLead" value="${s.leadUnlockPrice}" /></label>
    </div>
    <button class="btn btn-primary" id="saveSettings">Save</button><span class="save-ok hidden" id="setSaved">Saved ✓</span>
    <h3>Demo data</h3>
    <button class="btn btn-ghost btn-sm" id="resetDemo">Reset all prototype data</button>`;
  $("#saveSettings").addEventListener("click", () => {
    const num = (id, fallback) => { const v = parseFloat($(id).value); return v >= 0 ? v : fallback; };
    Store.saveSettings({
      advancedReportPrice: num("#setReport", s.advancedReportPrice),
      associateMonthlyPrice: num("#setAssoc", s.associateMonthlyPrice),
      leadUnlockPrice: num("#setLead", s.leadUnlockPrice),
    }, session.email);
    flash("#setSaved");
  });
  $("#resetDemo").addEventListener("click", () => {
    if (!confirm("Delete all prototype submissions, businesses, and logs?")) return;
    Store.resetDemo();
    Session.logout();
    location.reload();
  });
}

function renderCompliance(el) {
  const audit = Store.audit().slice().reverse();
  el.innerHTML = `<h2>Compliance &amp; CRM export</h2>
    <div class="job-actions">
      <button class="btn btn-ghost btn-sm" data-exp="contacts">Contacts CSV (HubSpot)</button>
      <button class="btn btn-ghost btn-sm" data-exp="deals">Deals CSV — one per project</button>
      <button class="btn btn-ghost btn-sm" data-exp="businesses">Businesses CSV</button>
      <button class="btn btn-ghost btn-sm" data-exp="audit">Audit log CSV</button>
      <button class="btn btn-ghost btn-sm" data-exp="json">Full JSON</button>
    </div>
    <h3>Audit log (${audit.length})</h3>
    <table class="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
      <tbody>${audit.slice(0, 200).map((a) => `<tr><td>${new Date(a.ts).toLocaleString()}</td><td>${escHtml(a.actor)}</td>
        <td>${escHtml(a.action)}</td><td>${escHtml(a.entity)} ${escHtml(a.entityId)}</td><td class="detail-cell">${escHtml(a.detail)}</td></tr>`).join("")}</tbody></table>`;
  const exp = {
    contacts: () => downloadFile("contacts.csv", Store.exportContactsCsv(), "text/csv"),
    deals: () => downloadFile("deals.csv", Store.exportDealsCsv(), "text/csv"),
    businesses: () => downloadFile("businesses.csv", Store.exportBusinessesCsv(), "text/csv"),
    audit: () => downloadFile("audit-log.csv", Store.exportAuditCsv(), "text/csv"),
    json: () => downloadFile("ffp-export.json", Store.exportFullJson(), "application/json"),
  };
  $$("[data-exp]", el).forEach((b) => b.addEventListener("click", exp[b.dataset.exp]));
}

/* ========================================================================
   Business: profile, leads, membership
   ======================================================================== */
const myBusiness = () => Store.business(session.businessId);

function renderProfile(el) {
  const b = myBusiness();
  el.innerHTML = `<h2>${escHtml(b.name)}</h2>
    <p><span class="badge ${b.tier === "associate" ? "badge-good" : ""}">${b.tier === "associate" ? "Associate" : "Level 1"}</span>
      ${b.verified ? `<span class="badge badge-good">✔ Verified</span>` : `<span class="badge">Verification pending</span>`}</p>
    <div class="estimate-card profile-card">${businessFormHtml(b)}
      <button class="btn btn-primary" id="saveProfile">Save profile</button>
      <span class="save-ok hidden" id="profSaved">Saved ✓</span>
      <p class="field-error hidden" id="profErr"></p>
    </div>`;
  $("#saveProfile").addEventListener("click", () => {
    const data = readBusinessForm(el);
    const err = validateBusiness(data, false, b.id);
    if (err) { showErr("#profErr", err); return; }
    Store.updateBusiness(b.id, data, session.email, "business.profile.update");
    flash("#profSaved");
  });
}

function renderLeads(el) {
  const b = myBusiness();
  const leads = Store.leadsFor(b).slice().reverse();
  const price = Store.settings().leadUnlockPrice;

  if (b.tier !== "associate") {
    el.innerHTML = `<div class="estimate-card step-center">
      <span class="step-tag">Associate feature</span>
      <h2>${leads.length} homeowner lead${leads.length === 1 ? "" : "s"} match your services</h2>
      <p class="estimate-sub">Upgrade to Associate to browse leads for the jobs you service and unlock homeowner contact details.</p>
      <button class="btn btn-primary" data-goto="Membership">View membership</button>
    </div>`;
    $("[data-goto]", el).addEventListener("click", () => openTab("Membership"));
    return;
  }

  el.innerHTML = `<h2>Available leads (${leads.length})</h2>
    <p class="step-hint">Homeowners who opted in to be contacted, in your service states, for services you offer.
      Unlock a lead for ${fmtUsd(price)} to see contact details, full answers, and photos.</p>
    ${leads.length ? "" : `<p class="empty-note">No matching leads right now.</p>`}
    <div class="job-cards">${leads.map((s) => {
      const unlocked = b.unlockedLeads.includes(s.id);
      const mine = s.projects.filter((p) => b.services.includes(p.serviceId));
      return `<div class="job-card">
        <div class="job-card-head">
          <h3>${mine.map((p) => `${SERVICES_BY_ID[p.serviceId].icon} ${escHtml(p.serviceName)}`).join(" · ")}</h3>
          ${s.advanced ? `<span class="badge badge-good">Has expert report</span>` : ""}
        </div>
        <p class="step-hint">${escHtml(s.address.city)}, ${escHtml(s.address.state)} ${escHtml(s.address.zip)} · ${fmtDate(s.createdAt)} ·
          Timeline: ${escHtml(s.universal.G4 || "—")} · ${escHtml(s.universal.G2 || "")}</p>
        <p>${mine.map((p) => `${escHtml(p.serviceName)}: <strong>${fmtUsd(p.estimate.low)}–${fmtUsd(p.estimate.high)}</strong>`).join(" · ")}</p>
        ${unlocked
          ? `<details open><summary>Lead details</summary>${submissionDetail({ ...s, projects: mine })}</details>`
          : `<button class="btn btn-primary btn-sm" data-unlock="${s.id}">Unlock lead — ${fmtUsd(price)}</button>`}
      </div>`;
    }).join("")}</div>`;

  $$("[data-unlock]", el).forEach((btn) => btn.addEventListener("click", async () => {
    const r = await Payments.checkout({ amount: price, description: `Lead unlock — ${b.name}` });
    if (r.status !== "succeeded") return;
    Store.unlockLead(b.id, btn.dataset.unlock, r.id, session.email);
    renderLeads(el);
  }));
}

function renderMembership(el) {
  const b = myBusiness();
  const s = Store.settings();
  const assoc = b.tier === "associate";
  el.innerHTML = `<h2>Membership</h2>
    <div class="tier-grid">
      <div class="estimate-card tier-card ${assoc ? "" : "tier-current"}">
        <span class="step-tag">Level 1 · Free</span>
        <ul class="tier-list"><li>Business profile with services offered</li><li>Listed for homeowners in your area</li><li>See how many leads match your services</li></ul>
        ${assoc ? "" : `<p class="badge">Current plan</p>`}
      </div>
      <div class="estimate-card tier-card ${assoc ? "tier-current" : ""}">
        <span class="step-tag tag-good">Associate · ${fmtUsd(s.associateMonthlyPrice)}/mo</span>
        <ul class="tier-list"><li>Everything in Level 1</li><li>Browse all leads for the jobs you service</li>
          <li>Unlock homeowner contact details (${fmtUsd(s.leadUnlockPrice)} per lead)</li><li>See expert Advanced Reports attached to leads</li></ul>
        ${assoc ? `<p class="badge badge-good">Current plan · since ${fmtDate(b.associateSince)}</p>
          <button class="btn btn-ghost btn-sm" id="cancelAssoc">Cancel membership</button>`
          : `<button class="btn btn-primary" id="upgradeAssoc">Upgrade to Associate</button>`}
      </div>
    </div>`;
  const up = $("#upgradeAssoc");
  if (up) up.addEventListener("click", async () => {
    const r = await Payments.checkout({ amount: s.associateMonthlyPrice, description: `Associate membership — ${b.name}`, recurring: true });
    if (r.status !== "succeeded") return;
    Store.updateBusiness(b.id, { tier: "associate", associateSince: new Date().toISOString(), membershipRef: r.id }, session.email, "membership.upgrade");
    renderMembership(el);
  });
  const cancel = $("#cancelAssoc");
  if (cancel) cancel.addEventListener("click", () => {
    if (!confirm("Cancel Associate membership? Lead access ends now; previously unlocked leads return if you rejoin.")) return;
    Store.updateBusiness(b.id, { tier: "level1" }, session.email, "membership.cancel");
    renderMembership(el);
  });
}

function flash(sel) {
  const e = $(sel);
  e.classList.remove("hidden");
  setTimeout(() => e.classList.add("hidden"), 1500);
}

/* ---------- boot ---------- */
session = Session.current();
if (session && (session.role !== "business" || Store.business(session.businessId))) showPortal();
else { Session.logout(); renderLogin(); }
