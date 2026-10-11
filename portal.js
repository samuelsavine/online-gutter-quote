"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (n) => "$" + Number(n).toLocaleString("en-US", Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STAGE_LABELS = {
  lead: "Lead", deposit_paid: "Open — deposit paid", accepted: "Accepted",
  contracted: "Contracted", final_paid: "Paid in full",
};

let session = null;

/* ========================================================================
   Login
   ======================================================================== */
function initAuth() {
  session = Session.current();
  if (session) { showPortal(); return; }
  $("#loginBtn").addEventListener("click", doLogin);
  $("#loginEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
}

function doLogin() {
  const s = Session.login($("#loginEmail").value);
  if (!s) { $("#loginError").classList.remove("hidden"); return; }
  session = s;
  showPortal();
}

function showPortal() {
  $("#loginView").classList.add("hidden");
  $("#portalView").classList.remove("hidden");
  $("#whoami").textContent = `${session.name} · ${session.role}`;
  $("#whoami").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  $("#logoutBtn").addEventListener("click", () => { Session.logout(); location.reload(); });

  const tabs = session.role === "contractor"
    ? ["Job board", "My jobs", "Messages", "Profile"]
    : session.role === "admin"
      ? ["Jobs", "Contractors", "Messages", "Settings", "Compliance"]
      : ["Jobs", "Messages"]; // sales

  $("#tabs").innerHTML = tabs.map((t, i) =>
    `<button class="tab ${i === 0 ? "active" : ""}" data-tab="${t}">${t}</button>`).join("");
  $$("#tabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    $$("#tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTab(btn.dataset.tab);
  }));
  renderTab(tabs[0]);
}

function renderTab(tab) {
  const el = $("#tabContent");
  switch (tab) {
    case "Job board": return renderJobBoard(el);
    case "My jobs": return renderMyJobs(el);
    case "Jobs": return renderAllJobs(el);
    case "Contractors": return renderContractors(el);
    case "Messages": return renderMessages(el);
    case "Profile": return renderProfile(el);
    case "Settings": return renderSettings(el);
    case "Compliance": return renderCompliance(el);
  }
}

/* ========================================================================
   Contractor: job board
   ======================================================================== */
function contractorPayout(job) {
  return Math.round((job.amount * (1 - job.commissionPct / 100)) * 100) / 100;
}

function jobDetailsHtml(job) {
  const d = job.details;
  const rows = [
    ["Project", d.projectType], ["Protection", d.protection], ["Height", d.height],
    ["Problems", (d.problems || []).join(", ") || "—"], ["Fascia", d.fascia],
    ["Downspouts", d.downspouts], ["Underground drains", d.underground],
    ["Special conditions", (d.special || []).join(", ") || "—"],
    ["Measured gutter run", job.gutterFeet ? `${job.gutterFeet} ft (customer-confirmed trace)` : "not measured"],
    ["Photos", job.photosProvided ? `${job.photoCount} uploaded` : "none"],
    ["Requested window", `${fmtDate(job.timeframe.start)} → ${fmtDate(job.timeframe.end)}`],
  ];
  return `<dl class="job-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

function renderJobBoard(el) {
  const ctr = Store.contractor(session.contractorId);
  const open = Store.jobs().filter((j) => j.dealstage === "deposit_paid");
  const visible = open.filter((j) => !j.region || ctr.regions.includes(j.region));

  el.innerHTML = `<h2>Open jobs</h2>
    <p class="step-hint">Payout shown is your share after the ${Store.settings().commissionPct}% platform fee. Deposit already collected from the customer.</p>
    ${visible.length ? "" : `<p class="empty-note">No open jobs in your regions right now.</p>`}
    <div class="job-cards">${visible.map((job) => {
      const threshold = Store.licenseThresholdFor(job.region);
      const locked = !ctr.licensed && job.amount > threshold;
      return `<div class="job-card ${locked ? "job-locked" : ""}">
        <div class="job-card-head">
          <h3>${esc(job.address.street)}, ${esc(job.address.city)} ${esc(job.address.state)}</h3>
          <span class="badge">${STAGE_LABELS[job.dealstage]}</span>
        </div>
        <p class="job-payout">Your payout: <strong>${fmt(contractorPayout(job))}</strong>
          <span class="job-payout-sub">(customer price ${fmt(job.amount)} − ${job.commissionPct}% fee)</span></p>
        ${jobDetailsHtml(job)}
        ${locked
          ? `<p class="locked-note">🔒 Requires a verified license — jobs over ${fmt(threshold)} in this region. Upload your license under Profile.</p>`
          : `<button class="btn btn-primary" data-accept="${job.id}">Accept this job</button>`}
      </div>`;
    }).join("")}</div>`;

  $$("[data-accept]", el).forEach((btn) => btn.addEventListener("click", () => acceptJob(btn.dataset.accept)));
}

function acceptJob(jobId) {
  const ctr = Store.contractor(session.contractorId);
  Store.updateJob(jobId, {
    contractorId: ctr.id,
    acceptedAt: new Date().toISOString(),
    dealstage: "accepted",
    contractorSignature: ctr.contactName,
  }, session.email, "job.accept");
  Store.addMessage(`job:${jobId}:customer`, {
    jobId, fromRole: "contractor", fromName: ctr.company,
    body: `Hi! ${ctr.company} has accepted your gutter installation job. We'll confirm your installation date within your requested window shortly. You can reply here with any questions.`,
  }, session.email);
  renderTab("My jobs");
  $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "My jobs"));
}

/* ========================================================================
   Contractor: my jobs (+ calendar export)
   ======================================================================== */
function icsForJob(job, contact) {
  const dt = (iso) => iso.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EZ Gutter Quote//EN",
    "BEGIN:VEVENT",
    `UID:${job.id}@ezgutterquote`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dt(job.timeframe.start)}`,
    `DTEND;VALUE=DATE:${dt(job.timeframe.end)}`,
    `SUMMARY:Gutter installation — ${job.address.street}`,
    `LOCATION:${job.address.street}, ${job.address.city}, ${job.address.state} ${job.address.zip}`,
    `DESCRIPTION:Customer: ${contact ? contact.firstname + " " + contact.lastname : ""} · Payout ${fmt(contractorPayout(job))} · Job ${job.id}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function download(filename, content, mime = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderMyJobs(el) {
  const mine = Store.jobs().filter((j) => j.contractorId === session.contractorId);
  el.innerHTML = `<h2>My jobs</h2>
    ${mine.length ? "" : `<p class="empty-note">You haven't accepted any jobs yet.</p>`}
    <div class="job-cards">${mine.map((job) => {
      const contact = Store.contact(job.contactId);
      return `<div class="job-card">
        <div class="job-card-head">
          <h3>${esc(job.address.street)}, ${esc(job.address.city)}</h3>
          <span class="badge badge-good">${STAGE_LABELS[job.dealstage]}</span>
        </div>
        <p class="job-payout">Payout: <strong>${fmt(contractorPayout(job))}</strong></p>
        <p class="step-hint">Customer: ${contact ? `${esc(contact.firstname)} ${esc(contact.lastname)}` : "—"} ·
          Window: ${fmtDate(job.timeframe.start)} → ${fmtDate(job.timeframe.end)}</p>
        ${jobDetailsHtml(job)}
        <div class="job-actions">
          <a class="btn btn-ghost btn-sm" href="contract.html?job=${job.id}" target="_blank">View contract</a>
          <button class="btn btn-ghost btn-sm" data-ics="${job.id}">Add to calendar (.ics)</button>
          <button class="btn btn-ghost btn-sm" data-chat="${job.id}">Message customer</button>
        </div>
        <div class="chat-holder hidden" id="chat_${job.id}"></div>
      </div>`;
    }).join("")}</div>`;

  $$("[data-ics]", el).forEach((btn) => btn.addEventListener("click", () => {
    const job = Store.job(btn.dataset.ics);
    download(`gutter-job-${job.id}.ics`, icsForJob(job, Store.contact(job.contactId)), "text/calendar");
  }));
  $$("[data-chat]", el).forEach((btn) => btn.addEventListener("click", () => {
    const holder = $(`#chat_${btn.dataset.chat}`);
    holder.classList.toggle("hidden");
    if (!holder.classList.contains("hidden")) {
      mountChat(holder, `job:${btn.dataset.chat}:customer`, btn.dataset.chat);
    }
  }));
}

/* ========================================================================
   Shared chat UI
   ======================================================================== */
function mountChat(holder, threadKey, jobId = null) {
  const render = () => {
    const msgs = Store.thread(threadKey);
    holder.innerHTML = `
      <div class="chat-log">${msgs.length ? msgs.map((m) => `
        <div class="chat-msg ${m.fromRole === session.role ? "mine" : ""}">
          <span class="chat-meta">${esc(m.fromName)} · ${new Date(m.ts).toLocaleString()}</span>
          <p>${esc(m.body)}</p>
        </div>`).join("") : `<p class="empty-note">No messages yet.</p>`}
      </div>
      <div class="chat-compose">
        <input type="text" placeholder="Type a message… (kept on-platform for compliance)" />
        <button class="btn btn-primary btn-sm">Send</button>
      </div>`;
    const input = $("input", holder);
    const send = () => {
      if (!input.value.trim()) return;
      Store.addMessage(threadKey, {
        jobId, fromRole: session.role, fromName: session.name, body: input.value.trim(),
      }, session.email);
      render();
      $("input", holder).focus();
    };
    $("button", holder).addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const log = $(".chat-log", holder);
    log.scrollTop = log.scrollHeight;
  };
  render();
}

/* ========================================================================
   Messages tab
   ======================================================================== */
function renderMessages(el) {
  if (session.role === "contractor") {
    el.innerHTML = `<h2>Message EZ Gutter team</h2>
      <p class="step-hint">Reaches site admins and sales associates. All messages are logged.</p>
      <div class="chat-holder" id="adminChat"></div>`;
    mountChat($("#adminChat"), `ctr:${session.contractorId}:admin`);
    return;
  }
  // admin / sales: all contractor threads + job threads
  const ctrs = Store.contractors();
  const jobThreads = [...new Set(Store.messages().filter((m) => m.threadKey.startsWith("job:")).map((m) => m.threadKey))];
  el.innerHTML = `<h2>Message center</h2>
    <h3>Contractor threads</h3>
    <div class="thread-list">${ctrs.map((c) => `
      <div class="thread-block">
        <h4>${esc(c.company)} (${esc(c.contactName)})</h4>
        <div class="chat-holder" id="chat_${c.id}"></div>
      </div>`).join("")}</div>
    <h3>Job threads (customer ↔ contractor, read/monitor)</h3>
    ${jobThreads.length ? jobThreads.map((tk) => {
      const jobId = tk.split(":")[1];
      const job = Store.job(jobId);
      return `<div class="thread-block">
        <h4>${job ? esc(job.address.street) : jobId}</h4>
        <div class="chat-holder" id="chat_t_${jobId}"></div>
      </div>`;
    }).join("") : `<p class="empty-note">No job threads yet.</p>`}`;

  ctrs.forEach((c) => mountChat($(`#chat_${c.id}`), `ctr:${c.id}:admin`));
  jobThreads.forEach((tk) => {
    const jobId = tk.split(":")[1];
    mountChat($(`#chat_t_${jobId}`), tk, jobId);
  });
}

/* ========================================================================
   Contractor: profile
   ======================================================================== */
const DOC_TYPES = [
  ["license", "Contractor license"],
  ["workers-comp", "Workers' comp certificate"],
  ["insurance", "General liability insurance"],
  ["w9", "W-9"],
];

function renderProfile(el) {
  const ctr = Store.contractor(session.contractorId);
  const m = ctr.modifiers;
  el.innerHTML = `<h2>${esc(ctr.company)}</h2>
    <p>${ctr.licensed
      ? `<span class="badge badge-good">✔ Licensed — ${esc(ctr.licenseNumber)} · eligible for all job sizes</span>`
      : `<span class="badge badge-warn">Unlicensed — limited to jobs under ${fmt(Store.licenseThresholdFor(ctr.regions[0]))}. Upload a license for admin verification to unlock larger jobs.</span>`}
    </p>

    <h3>Rate structure</h3>
    <p class="step-hint">Used to match you with jobs and compute your payouts.</p>
    <div class="rate-grid">
      <label class="field">Base rate ($/linear ft installed)<input type="number" step="0.25" id="rateBase" value="${ctr.ratePerFoot}" /></label>
      <label class="field">2-story multiplier<input type="number" step="0.05" id="rate2s" value="${m.story2Mult}" /></label>
      <label class="field">3-story multiplier<input type="number" step="0.05" id="rate3s" value="${m.story3Mult}" /></label>
      <label class="field">Gutter guards (+$/ft)<input type="number" step="0.25" id="rateGuards" value="${m.guardsPerFoot}" /></label>
      <label class="field">Metal roof multiplier<input type="number" step="0.05" id="rateMetal" value="${m.metalRoofMult}" /></label>
    </div>
    <button class="btn btn-primary btn-sm" id="saveRates">Save rates</button>
    <span class="save-ok hidden" id="rateSaved">Saved ✓</span>

    <h3>Credentials &amp; documents</h3>
    <table class="data-table">
      <thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead>
      <tbody>${ctr.docs.map((d) => `<tr>
        <td>${esc((DOC_TYPES.find(([t]) => t === d.type) || [, d.type])[1])}</td>
        <td>${esc(d.name)}</td><td>${fmtDate(d.uploadedAt)}</td>
        <td>${d.verified ? `<span class="badge badge-good">Verified</span>` : `<span class="badge">Pending review</span>`}</td>
      </tr>`).join("")}</tbody>
    </table>
    <div class="upload-row">
      <select id="docType">${DOC_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <input type="file" id="docFile" />
      <button class="btn btn-ghost btn-sm" id="docUpload">Upload</button>
    </div>`;

  $("#saveRates").addEventListener("click", () => {
    Store.updateContractor(ctr.id, {
      ratePerFoot: parseFloat($("#rateBase").value) || ctr.ratePerFoot,
      modifiers: {
        story2Mult: parseFloat($("#rate2s").value) || m.story2Mult,
        story3Mult: parseFloat($("#rate3s").value) || m.story3Mult,
        guardsPerFoot: parseFloat($("#rateGuards").value) || m.guardsPerFoot,
        metalRoofMult: parseFloat($("#rateMetal").value) || m.metalRoofMult,
      },
    }, session.email, "contractor.rates.update");
    $("#rateSaved").classList.remove("hidden");
    setTimeout(() => $("#rateSaved").classList.add("hidden"), 1500);
  });

  $("#docUpload").addEventListener("click", () => {
    const file = $("#docFile").files[0];
    if (!file) return;
    Store.addContractorDoc(ctr.id, { type: $("#docType").value, name: file.name }, session.email);
    renderProfile(el);
  });
}

/* ========================================================================
   Admin: jobs, contractors, settings, compliance
   ======================================================================== */
function renderAllJobs(el) {
  const jobs = Store.jobs();
  el.innerHTML = `<h2>All jobs</h2>
    ${jobs.length ? "" : `<p class="empty-note">No jobs yet — complete the customer funnel to create one.</p>`}
    <table class="data-table">
      <thead><tr><th>Created</th><th>Address</th><th>Stage</th><th>Estimate</th><th>Price</th><th>Fee (${Store.settings().commissionPct}%)</th><th>Contractor</th><th>Window</th></tr></thead>
      <tbody>${jobs.map((j) => {
        const ctr = j.contractorId ? Store.contractor(j.contractorId) : null;
        return `<tr>
          <td>${fmtDate(j.createdAt)}</td>
          <td>${esc(j.address.street)}, ${esc(j.address.city)}</td>
          <td><span class="badge">${STAGE_LABELS[j.dealstage]}</span></td>
          <td>${fmt(j.estimateLow)}–${fmt(j.estimateHigh)}</td>
          <td>${fmt(j.amount)}</td>
          <td>${fmt(Math.round(j.amount * j.commissionPct) / 100)}</td>
          <td>${ctr ? esc(ctr.company) : "—"}</td>
          <td>${fmtDate(j.timeframe.start)} → ${fmtDate(j.timeframe.end)}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

function renderContractors(el) {
  const ctrs = Store.contractors();
  el.innerHTML = `<h2>Contractors</h2>
    <div class="job-cards">${ctrs.map((c) => `
      <div class="job-card">
        <div class="job-card-head">
          <h3>${esc(c.company)}</h3>
          ${c.licensed ? `<span class="badge badge-good">Licensed</span>` : `<span class="badge badge-warn">Unlicensed</span>`}
        </div>
        <p class="step-hint">${esc(c.contactName)} · ${esc(c.email)} · ${esc(c.phone)} · $${c.ratePerFoot}/ft</p>
        <table class="data-table">
          <thead><tr><th>Document</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
          <tbody>${c.docs.map((d) => `<tr>
            <td>${esc(d.type)}: ${esc(d.name)}</td><td>${fmtDate(d.uploadedAt)}</td>
            <td>${d.verified ? `<span class="badge badge-good">Verified</span>` : `<span class="badge">Pending</span>`}</td>
            <td>${d.verified ? "" : `<button class="btn btn-ghost btn-sm" data-verify="${c.id}:${d.id}">Verify</button>`}</td>
          </tr>`).join("")}</tbody>
        </table>
        <button class="btn btn-ghost btn-sm" data-license="${c.id}">${c.licensed ? "Revoke licensed status" : "Mark as licensed"}</button>
      </div>`).join("")}</div>`;

  $$("[data-verify]", el).forEach((btn) => btn.addEventListener("click", () => {
    const [ctrId, docId] = btn.dataset.verify.split(":");
    const ctr = Store.contractor(ctrId);
    Store.updateContractor(ctrId, {
      docs: ctr.docs.map((d) => (d.id === docId ? { ...d, verified: true } : d)),
    }, session.email, "contractor.doc.verify");
    renderContractors(el);
  }));
  $$("[data-license]", el).forEach((btn) => btn.addEventListener("click", () => {
    const ctr = Store.contractor(btn.dataset.license);
    Store.updateContractor(ctr.id, { licensed: !ctr.licensed }, session.email, "contractor.license.toggle");
    renderContractors(el);
  }));
}

function renderSettings(el) {
  const s = Store.settings();
  el.innerHTML = `<h2>Platform settings</h2>
    <div class="rate-grid">
      <label class="field">Qualified-lead deposit ($)<input type="number" id="setDeposit" value="${s.depositAmount}" /></label>
      <label class="field">Platform commission (%)<input type="number" id="setCommission" value="${s.commissionPct}" /></label>
      <label class="field">Default license threshold ($)<input type="number" id="setThreshold" value="${s.defaultLicenseThreshold}" /></label>
    </div>
    <h3>Regional license thresholds</h3>
    <p class="step-hint">Unlicensed contractors cannot accept jobs above the threshold for their region.</p>
    <table class="data-table"><thead><tr><th>Region</th><th>Threshold ($)</th></tr></thead>
      <tbody>${s.regions.map((r, i) => `<tr>
        <td>${esc(r.name)} (${esc(r.code)})</td>
        <td><input type="number" class="inline-input" data-region="${i}" value="${r.licenseThreshold}" /></td>
      </tr>`).join("")}</tbody>
    </table>
    <button class="btn btn-primary" id="saveSettings">Save settings</button>
    <span class="save-ok hidden" id="settingsSaved">Saved ✓</span>`;

  $("#saveSettings").addEventListener("click", () => {
    const regions = s.regions.map((r, i) => ({
      ...r, licenseThreshold: parseInt($(`[data-region="${i}"]`).value, 10) || r.licenseThreshold,
    }));
    Store.saveSettings({
      depositAmount: parseInt($("#setDeposit").value, 10) || s.depositAmount,
      commissionPct: parseFloat($("#setCommission").value) || s.commissionPct,
      defaultLicenseThreshold: parseInt($("#setThreshold").value, 10) || s.defaultLicenseThreshold,
      regions,
    }, session.email);
    $("#settingsSaved").classList.remove("hidden");
    setTimeout(() => $("#settingsSaved").classList.add("hidden"), 1500);
  });
}

function renderCompliance(el) {
  const audit = Store.audit().slice().reverse();
  el.innerHTML = `<h2>Compliance &amp; CRM export</h2>
    <div class="job-actions">
      <button class="btn btn-ghost btn-sm" id="expContacts">Export contacts CSV (HubSpot)</button>
      <button class="btn btn-ghost btn-sm" id="expJobs">Export deals CSV (HubSpot)</button>
      <button class="btn btn-ghost btn-sm" id="expAudit">Export audit log CSV</button>
      <button class="btn btn-ghost btn-sm" id="expJson">Export full JSON</button>
    </div>
    <h3>Audit log (${audit.length} entries)</h3>
    <p class="step-hint">Every contact, job, message, payment, and settings change is recorded with actor and timestamp.</p>
    <table class="data-table">
      <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
      <tbody>${audit.slice(0, 200).map((a) => `<tr>
        <td>${new Date(a.ts).toLocaleString()}</td><td>${esc(a.actor)}</td>
        <td>${esc(a.action)}</td><td>${esc(a.entity)} ${esc(a.entityId)}</td>
        <td class="detail-cell">${esc(a.detail)}</td>
      </tr>`).join("")}</tbody>
    </table>`;

  $("#expContacts").addEventListener("click", () => download("hubspot-contacts.csv", Store.exportContactsCsv(), "text/csv"));
  $("#expJobs").addEventListener("click", () => download("hubspot-deals.csv", Store.exportJobsCsv(), "text/csv"));
  $("#expAudit").addEventListener("click", () => download("audit-log.csv", Store.exportAuditCsv(), "text/csv"));
  $("#expJson").addEventListener("click", () => download("ezgq-export.json", Store.exportFullJson(), "application/json"));
}

initAuth();
