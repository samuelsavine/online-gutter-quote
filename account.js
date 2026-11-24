"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let session = Session.current();
if (session && session.kind !== "homeowner") session = null;

const ctxFor = (p) => ({ state: p.address.state, universal: p.universal, settings: Store.settings() });

/* ---------- sign in ---------- */
function renderLogin(msg = "") {
  $("#view").innerHTML = `<div class="card narrow">
    <h2>Sign in to your reports</h2>
    <p class="hint">Use the email you saved your report with. (Prototype: no password.)</p>
    <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" /></div>
    <button class="btn btn-primary" id="go">Sign in</button>
    ${msg ? `<p class="error">${escHtml(msg)}</p>` : ""}
    <p class="hint">No account yet? <a href="index.html">Get a free price</a> and unlock your report.</p>
  </div>`;
  const go = () => {
    const s = Session.loginHomeowner($("#email").value);
    if (!s) { renderLogin("No account found for that email."); return; }
    session = s; route();
  };
  $("#go").addEventListener("click", go);
  $("#email").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

/* ---------- project list ---------- */
function renderList() {
  const projects = Store.projects().filter((p) => p.homeownerId === session.homeownerId).reverse();
  $("#view").innerHTML = `<h1>My project reports</h1>
    <div class="list">${projects.map((p) => {
      const c = Store.category(p.categoryId);
      const b = (p.refined || p.free).tiers.better;
      return `<a class="card list-item" href="?project=${encodeURIComponent(p.id)}">
        <span class="category-icon">${c.icon}</span>
        <div><strong>${escHtml(c.name)}</strong><p class="hint">${escHtml(p.address.street)}, ${escHtml(p.address.city)} · ${fmtDate(p.createdAt)}</p></div>
        <span class="list-price">${fmtUsd(b.low)}–${fmtUsd(b.high)}</span></a>`;
    }).join("") || `<p class="hint">No reports yet.</p>`}</div>
    <a class="btn btn-primary" href="index.html">Price another project</a>`;
}

/* ---------- project dashboard ---------- */
function renderProject(id) {
  const p = Store.project(id);
  if (!p || p.homeownerId !== session.homeownerId) { renderList(); return; }
  const c = Store.category(p.categoryId);
  const h = Store.homeowner(session.homeownerId);
  const result = p.refined || p.free;
  const own = p.ownership;

  $("#view").innerHTML = `
    <a class="back-link no-print" href="account.html">← All reports</a>
    <div class="dash-head">
      <div><div class="step-cat">${c.icon} ${escHtml(c.name)}</div>
        <h1>${escHtml(p.address.street)}, ${escHtml(p.address.city)}, ${escHtml(p.address.state)}</h1>
        <p class="hint">Report created ${fmtDate(p.createdAt)} · Access through ${fmtDate(h.subscriptionEnds)}</p></div>
      <div class="dash-actions no-print">
        <button class="btn btn-primary" id="pdfBtn">Download PDF</button>
        <button class="btn btn-ghost" disabled title="Email delivery arrives with the backend">Email PDF (soon)</button>
      </div>
    </div>
    ${own ? `<p class="banner ${own.status === "verified" ? "ok" : "warn"}">${own.status === "verified"
      ? "✓ Property ownership verified" : `Ownership note on file: ${escHtml(own.reason || "pending")}`}</p>` : ""}

    <section class="card">
      <h2>${p.refined ? "Your refined price" : "Your price"}</h2>
      ${Report.tierCards(c, result)}
      ${Report.summary(c, p, result)}
      <h4>Why these numbers</h4>
      <ul class="rationale">${Pricing.rationale(c, result).map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>
      ${p.refined ? "" : `<p class="banner info no-print">Answer the detailed questions below to narrow your range.</p>`}
      ${Report.disclaimer}
    </section>

    <section class="card no-print" id="detailed">
      <h2>Detailed questionnaire</h2>
      <p class="hint">More detail = a narrower, more accurate range.</p>
      <form id="detailForm" class="detail-form">${c.questions.map((q) => questionInput(q, p.answers[q.id])).join("")}</form>
      <button class="btn btn-primary" id="saveDetail">Update my price</button>
    </section>

    <section class="card no-print">
      <h2>Name your price</h2>
      <p class="hint">Slide to your budget and we’ll show what fits.</p>
      <input type="range" id="budget" min="${Math.round(result.tiers.good.low * 0.6)}" max="${Math.round(result.tiers.best.high * 1.2)}"
        step="50" value="${p.targetPrice || result.tiers.better.point}" />
      <div class="budget-out"><strong id="budgetVal"></strong><div id="budgetTips"></div></div>
    </section>

    <section class="card" id="quotes">
      <h2>Compare contractor quotes</h2>
      ${quotesTable(p, c, result)}
      <details class="no-print" ${p.quotes.length ? "" : "open"}><summary>Add a quote</summary>${quoteForm(c)}</details>
    </section>

    <section class="card no-print">
      <h2>Photos</h2>
      <div class="thumbs">${p.photos.map((ph) => `<img src="${ph.dataUrl}" alt="" />`).join("") || `<p class="hint">No photos yet.</p>`}</div>
      <label class="photo-drop small"><input type="file" accept="image/*" multiple hidden /><span>📷 Add photos</span></label>
    </section>

    <section class="card no-print">
      <h2>Get matched with local pros</h2>
      ${prosHtml(p, c)}
    </section>

    <section class="card">
      <h2>Cost vs. value</h2>
      <p>${escHtml(c.roiNote)}</p>
      ${Report.sources(c)}
    </section>`;

  $("#pdfBtn").addEventListener("click", () => window.print());
  bindDetail(p, c);
  bindBudget(p, c);
  bindQuotes(p, c);
  bindPhotos(p);
  bindPros(p, c, h);
}

/* ---------- detailed questionnaire ---------- */
function questionInput(q, cur) {
  const name = `q_${q.id}`;
  let input = "";
  if (q.type === "single") {
    input = `<select name="${name}"><option value="">—</option>${q.options.map((o) => `<option ${cur === o.label ? "selected" : ""}>${escHtml(o.label)}</option>`).join("")}</select>`;
  } else if (q.type === "multi") {
    const sel = Array.isArray(cur) ? cur : [];
    input = `<div class="check-grid">${q.options.map((o) => `<label class="check"><input type="checkbox" name="${name}" value="${escHtml(o.label)}" ${sel.includes(o.label) ? "checked" : ""} /> ${escHtml(o.label)}</label>`).join("")}</div>`;
  } else if (q.type === "number") {
    input = `<div class="number-field small"><input type="number" min="0" name="${name}" value="${typeof cur === "number" ? cur : ""}" placeholder="Not sure" />
      ${q.trace ? `<button type="button" class="btn btn-ghost btn-sm" data-measure="${q.id}">📐 Measure</button>` : ""}</div>`;
  } else {
    input = `<textarea name="${name}" rows="2">${escHtml(cur || "")}</textarea>`;
  }
  return `<div class="detail-q ${q.stage === "detailed" ? "is-detailed" : ""}"><label>${escHtml(q.text)}</label>${input}</div>`;
}

function readDetail(form, c) {
  const answers = {};
  c.questions.forEach((q) => {
    const name = `q_${q.id}`;
    if (q.type === "multi") {
      const vals = $$(`[name="${name}"]:checked`, form).map((x) => x.value);
      if (vals.length) answers[q.id] = vals;
    } else {
      const el = $(`[name="${name}"]`, form);
      const v = el.value.trim();
      if (v === "") return;
      answers[q.id] = q.type === "number" ? Number(v) : v;
    }
  });
  return answers;
}

function bindDetail(p, c) {
  const form = $("#detailForm");
  $$("[data-measure]", form).forEach((b) => b.addEventListener("click", async () => {
    const q = c.questions.find((x) => x.id === b.dataset.measure);
    const r = await Measure.open({ address: p.address, mode: q.trace });
    if (r) $(`[name="q_${q.id}"]`, form).value = r.value;
  }));
  $("#saveDetail").addEventListener("click", () => {
    const answers = readDetail(form, c);
    const refined = Pricing.evaluate(c, answers, { ...ctxFor(p), refined: true });
    Store.updateProject(p.id, { answers, refined }, session.email, "project.detailed");
    renderProject(p.id);
  });
}

/* ---------- name your price ---------- */
function bindBudget(p, c) {
  const slider = $("#budget");
  const update = () => {
    const target = Number(slider.value);
    const r = Pricing.nameYourPrice(c, p.answers, ctxFor(p), target);
    $("#budgetVal").textContent = fmtUsd(target);
    $("#budgetTips").innerHTML = `<ul>${r.tips.map((t) => `<li>${escHtml(t)}</li>`).join("")}</ul>`;
  };
  slider.addEventListener("input", update);
  slider.addEventListener("change", () => Store.updateProject(p.id, { targetPrice: Number(slider.value) }, session.email, "project.target_price"));
  update();
}

/* ---------- contractor quotes (REQ-11/12) ---------- */
function quoteForm(c) {
  return `<div class="quote-form">
    <p class="banner info">Upload a quote file and enter its key details. Automatic reading of quote files arrives with AI support — for now, please check the fields.</p>
    <div class="row">
      <div class="field"><label>Contractor<input data-qf="contractor" /></label></div>
      <div class="field"><label>Total price ($)<input type="number" min="0" data-qf="price" /></label></div>
    </div>
    <div class="row">
      <div class="field"><label>Quality level<select data-qf="tier"><option value="">Unknown</option>${TIERS.map((t) => `<option value="${t}">${TIER_LABEL[t]} — ${TIER_DESC[t]}</option>`).join("")}</select></label></div>
      ${c.unit !== "job" ? `<div class="field"><label>Quantity (${UNIT_LABEL[c.unit]})<input type="number" min="0" data-qf="qty" /></label></div>` : ""}
    </div>
    <div class="row">
      <div class="field"><label>Warranty (years)<input type="number" min="0" data-qf="warranty" /></label></div>
      <div class="field"><label>Timeline (weeks)<input type="number" min="0" data-qf="weeks" /></label></div>
      <div class="field"><label>Removal / cleanup included?<select data-qf="removal"><option value="">Unknown</option><option>Yes</option><option>No</option></select></label></div>
    </div>
    <div class="field"><label>Quote file (PDF or photo)<input type="file" data-qf="file" accept=".pdf,image/*" /></label></div>
    <div class="field"><label>Notes<textarea data-qf="notes" rows="2"></textarea></label></div>
    <button class="btn btn-primary" id="addQuote">Add quote</button>
  </div>`;
}

function analyzeQuote(q, c, result) {
  const reasons = [];
  const T = result.tiers;
  let position = "";
  if (q.price < T.good.low) position = "Below our Good range";
  else if (q.price > T.best.high) position = "Above our Best range";
  else position = TIERS.map((t) => (q.price >= T[t].low && q.price <= T[t].high ? `Within ${TIER_LABEL[t]}` : null)).filter(Boolean).join(" / ") || "Between ranges";
  if (q.tier && T[q.tier]) {
    const t = T[q.tier];
    if (q.price > t.high) reasons.push(`${Math.round((q.price / t.point - 1) * 100)}% above our ${TIER_LABEL[q.tier]} estimate for the stated quality.`);
    else if (q.price < t.low) reasons.push(`${Math.round((1 - q.price / t.point) * 100)}% below our ${TIER_LABEL[q.tier]} estimate — confirm scope and materials.`);
    else reasons.push(`In line with our ${TIER_LABEL[q.tier]} estimate.`);
  }
  if (q.qty && T.better.qty && c.unit !== "job") {
    const diff = q.qty / T.better.qty - 1;
    if (Math.abs(diff) > 0.1) reasons.push(`Quoted quantity is ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "more" : "less"} than your measurement — ask how they measured.`);
  }
  if (q.removal === "No") reasons.push("Removal/cleanup not included — budget extra.");
  if (q.warranty !== "" && q.warranty != null && Number(q.warranty) < 2) reasons.push("Short workmanship warranty (under 2 years).");
  return { position, reasons };
}

function quotesTable(p, c, result) {
  if (!p.quotes.length) return `<p class="hint">No quotes yet. Add one to see how it compares.</p>`;
  const sorted = [...p.quotes].sort((a, b) => a.price - b.price);
  const unitPrice = (q) => (q.qty && c.unit !== "job" ? `${fmtUsd(q.price / q.qty)}/${UNIT_LABEL[c.unit].replace(/s$/, "")}` : "—");
  return `<table class="table"><thead><tr><th>Contractor</th><th>Price</th><th>Unit price</th><th>Where it lands</th><th>What to know</th></tr></thead>
    <tbody>${sorted.map((q) => {
      const a = analyzeQuote(q, c, result);
      return `<tr><td><strong>${escHtml(q.contractor)}</strong>${q.fileName ? `<br/><span class="hint">📎 ${escHtml(q.fileName)}</span>` : ""}</td>
        <td>${fmtUsd(q.price)}</td><td>${unitPrice(q)}</td><td>${escHtml(a.position)}</td>
        <td><ul>${a.reasons.map((r) => `<li>${escHtml(r)}</li>`).join("") || "<li>No flags.</li>"}</ul></td></tr>`;
    }).join("")}</tbody></table>
    ${sorted.length > 1 ? `<p class="hint">Spread between lowest and highest quote: ${fmtUsd(sorted[sorted.length - 1].price - sorted[0].price)}.</p>` : ""}`;
}

function bindQuotes(p, c) {
  const btn = $("#addQuote");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const v = (k) => $(`[data-qf="${k}"]`);
    const price = Number(v("price").value);
    const contractor = v("contractor").value.trim();
    v("price").classList.toggle("invalid", !(price > 0));
    v("contractor").classList.toggle("invalid", !contractor);
    if (!(price > 0) || !contractor) return;
    const quote = {
      id: Store.uid("q"), addedAt: new Date().toISOString(), contractor, price, tier: v("tier").value,
      qty: v("qty") ? Number(v("qty").value) || null : null, warranty: v("warranty").value,
      weeks: v("weeks").value, removal: v("removal").value, notes: v("notes").value.trim(),
      fileName: v("file").files[0]?.name || "",
    };
    Store.updateProject(p.id, { quotes: [...p.quotes, quote] }, session.email, "quote.add");
    renderProject(p.id);
  });
}

/* ---------- photos ---------- */
function bindPhotos(p) {
  $(".photo-drop input").addEventListener("change", async (e) => {
    const added = [];
    for (const f of [...e.target.files].slice(0, 12 - p.photos.length)) {
      try { added.push({ name: f.name, dataUrl: await imageToThumb(f), addedAt: new Date().toISOString() }); } catch { /* skip */ }
    }
    Store.updateProject(p.id, { photos: [...p.photos, ...added] }, session.email, "photos.add");
    renderProject(p.id);
  });
}

/* ---------- contractor matching (REQ-14) ---------- */
function prosHtml(p, c) {
  const pros = Store.contractors().filter((x) => x.status === "approved" && x.membership.active &&
    x.services.includes(c.id) && x.serviceStates.includes(p.address.state));
  const buyers = Store.buyersOf(p.id).map((x) => Store.contractor(x.contractorId)).filter(Boolean);
  if (p.isLead) {
    return `<p class="banner ok">✓ Your project is shared with local pros.</p>
      ${buyers.length ? `<p>These businesses have your request and may contact you:</p><ul>${buyers.map((b) => `<li><strong>${escHtml(b.company)}</strong> · ${escHtml(b.phone)}${b.licenseNumber ? ` · License ${escHtml(b.licenseNumber)}` : ""}</li>`).join("")}</ul>` : `<p class="hint">We’ll notify you as pros respond.</p>`}`;
  }
  return `<p>${pros.length} vetted pro${pros.length === 1 ? "" : "s"} in your area handle ${escHtml(c.name.toLowerCase())} projects.</p>
    <label class="consent"><input type="checkbox" id="proConsent" /> <span>I agree that up to ${Store.settings().maxBuyersPerLead} local businesses may contact me about this project.</span></label>
    <button class="btn btn-primary" id="connectBtn">Connect me with pros</button>`;
}

function bindPros(p, c, h) {
  const btn = $("#connectBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const consent = $("#proConsent");
    consent.parentElement.classList.toggle("invalid-text", !consent.checked);
    if (!consent.checked) return;
    const contact = { firstName: h.firstName, lastName: h.lastName, email: h.email, phone: h.phone, consentAt: new Date().toISOString() };
    Store.updateProject(p.id, { optIn: true, contact }, h.email, "project.optin");
    Store.publishLead(p.id, h.email);
    renderProject(p.id);
  });
}

/* ---------- routing ---------- */
function route() {
  const who = $("#who"), out = $("#signOut");
  if (!session) { who.textContent = ""; out.classList.add("hidden"); renderLogin(); return; }
  who.textContent = `Hi, ${session.name}`;
  out.classList.remove("hidden");
  out.onclick = () => { Session.logout(); session = null; history.replaceState(null, "", "account.html"); route(); };
  const id = new URLSearchParams(location.search).get("project");
  if (id) renderProject(id); else renderList();
}

route();
