"use strict";

/* ========================================================================
   Data layer — localStorage-backed prototype store.
   Schema is CRM-ready: `contacts` map 1:1 to HubSpot contact properties,
   `jobs` map to HubSpot deals (dealstage, amount, custom properties).
   Swap the `read`/`write` pair for a real backend adapter in production.
   ======================================================================== */

const Store = (() => {
  const DB_KEY = "ezgq.db.v1";

  const uid = (prefix) =>
    `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const seedDb = () => ({
    settings: {
      depositAmount: 49,
      commissionPct: 15,
      defaultLicenseThreshold: 5000,
      regions: [
        { code: "NC-WIL", name: "Wilmington, NC", licenseThreshold: 5000 },
      ],
    },
    users: [
      { id: "u_admin", email: "admin@ezgutter.com", name: "Avery Admin", role: "admin" },
      { id: "u_sales", email: "sales@ezgutter.com", name: "Sam Sales", role: "sales" },
    ],
    contractors: [
      {
        id: "ctr_capefear",
        company: "Cape Fear Gutters LLC",
        contactName: "Maria Torres",
        email: "maria@capefeargutters.com",
        phone: "(910) 555-0142",
        licensed: true,
        licenseNumber: "NC-GC-77812",
        regions: ["NC-WIL"],
        ratePerFoot: 7.5,
        modifiers: { story2Mult: 1.25, story3Mult: 1.55, guardsPerFoot: 4.0, metalRoofMult: 1.2 },
        docs: [
          { id: "doc_1", type: "license", name: "nc-gc-license.pdf", uploadedAt: "2026-09-02T14:00:00Z", verified: true },
          { id: "doc_2", type: "workers-comp", name: "workcomp-cert-2026.pdf", uploadedAt: "2026-09-02T14:05:00Z", verified: true },
          { id: "doc_3", type: "insurance", name: "gl-policy.pdf", uploadedAt: "2026-09-02T14:06:00Z", verified: true },
        ],
      },
      {
        id: "ctr_coastal",
        company: "Coastal Rain Solutions",
        contactName: "Deshawn Riley",
        email: "deshawn@coastalrain.com",
        phone: "(910) 555-0177",
        licensed: false,
        licenseNumber: null,
        regions: ["NC-WIL"],
        ratePerFoot: 6.75,
        modifiers: { story2Mult: 1.2, story3Mult: 1.5, guardsPerFoot: 3.5, metalRoofMult: 1.15 },
        docs: [
          { id: "doc_4", type: "workers-comp", name: "workcomp-coastal.pdf", uploadedAt: "2026-09-10T10:00:00Z", verified: true },
        ],
      },
    ],
    contacts: [],
    jobs: [],
    messages: [],
    audit: [],
  });

  const read = () => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupt db falls through to reseed */ }
    const db = seedDb();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  };

  const write = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));

  /* ---- audit: every mutation is logged for compliance ---- */
  const log = (db, actor, action, entity, entityId, detail = "") => {
    db.audit.push({ id: uid("log"), ts: new Date().toISOString(), actor, action, entity, entityId, detail });
  };

  const api = {
    uid,

    settings() { return read().settings; },

    saveSettings(patch, actor) {
      const db = read();
      Object.assign(db.settings, patch);
      log(db, actor, "settings.update", "settings", "global", JSON.stringify(patch));
      write(db);
      return db.settings;
    },

    regionFor(address) {
      const db = read();
      const city = (address.city || "").toLowerCase();
      return db.settings.regions.find((r) => r.name.toLowerCase().includes(city)) || null;
    },

    licenseThresholdFor(regionCode) {
      const s = read().settings;
      const r = s.regions.find((x) => x.code === regionCode);
      return r ? r.licenseThreshold : s.defaultLicenseThreshold;
    },

    /* ---- contacts (≈ HubSpot contacts) ---- */
    addContact(data, actor) {
      const db = read();
      const contact = {
        id: uid("ct"),
        createdAt: new Date().toISOString(),
        firstname: data.firstName,
        lastname: data.lastName,
        email: data.email,
        phone: data.phone,
        address: data.address.street,
        city: data.address.city,
        state: data.address.state,
        zip: data.address.zip,
        marketing_consent: !!data.marketingConsent,
        lifecyclestage: "lead",
      };
      db.contacts.push(contact);
      log(db, actor, "contact.create", "contact", contact.id, contact.email);
      write(db);
      return contact;
    },

    /* ---- jobs (≈ HubSpot deals) ---- */
    addJob(data, actor) {
      const db = read();
      const job = {
        id: uid("job"),
        createdAt: new Date().toISOString(),
        dealstage: "lead",                 // lead → deposit_paid → accepted → contracted → final_paid
        contactId: data.contactId,
        address: data.address,
        region: data.region,
        details: data.details,             // questionnaire answers
        gutterFeet: data.gutterFeet,
        photosProvided: data.photosProvided,
        photoCount: data.photoCount || 0,
        estimateLow: data.estimateLow,
        estimateHigh: data.estimateHigh,
        amount: data.amount,               // customer-facing price (estimate midpoint until verified)
        commissionPct: db.settings.commissionPct,
        timeframe: data.timeframe,         // {start, end} ISO dates
        depositAmount: db.settings.depositAmount,
        depositPaidAt: null,
        contractorId: null,
        acceptedAt: null,
        contractSignedAt: null,
        contractSignature: null,
        payments: [],
      };
      db.jobs.push(job);
      log(db, actor, "job.create", "job", job.id, `est $${job.estimateLow}-$${job.estimateHigh}`);
      write(db);
      return job;
    },

    updateJob(jobId, patch, actor, action = "job.update") {
      const db = read();
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) return null;
      Object.assign(job, patch);
      log(db, actor, action, "job", jobId, JSON.stringify(Object.keys(patch)));
      write(db);
      return job;
    },

    job(jobId) { return read().jobs.find((j) => j.id === jobId) || null; },
    jobs() { return read().jobs; },
    contact(contactId) { return read().contacts.find((c) => c.id === contactId) || null; },
    contractor(id) { return read().contractors.find((c) => c.id === id) || null; },
    contractors() { return read().contractors; },
    users() { return read().users; },

    updateContractor(id, patch, actor, action = "contractor.update") {
      const db = read();
      const ctr = db.contractors.find((c) => c.id === id);
      if (!ctr) return null;
      Object.assign(ctr, patch);
      log(db, actor, action, "contractor", id, JSON.stringify(Object.keys(patch)));
      write(db);
      return ctr;
    },

    addContractorDoc(contractorId, doc, actor) {
      const db = read();
      const ctr = db.contractors.find((c) => c.id === contractorId);
      if (!ctr) return null;
      const record = { id: uid("doc"), uploadedAt: new Date().toISOString(), verified: false, ...doc };
      ctr.docs.push(record);
      log(db, actor, "contractor.doc.upload", "contractor", contractorId, `${doc.type}: ${doc.name}`);
      write(db);
      return record;
    },

    /* ---- payments ---- */
    addPayment(jobId, payment, actor) {
      const db = read();
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) return null;
      const record = { id: uid("pay"), ts: new Date().toISOString(), ...payment };
      job.payments.push(record);
      if (payment.type === "deposit") {
        job.depositPaidAt = record.ts;
        job.dealstage = "deposit_paid";
      }
      if (payment.type === "final") job.dealstage = "final_paid";
      log(db, actor, `payment.${payment.type}`, "job", jobId,
        `$${payment.amount} (platform $${payment.split.platform} / contractor $${payment.split.contractor})`);
      write(db);
      return record;
    },

    /* ---- messaging: all correspondence stays in-system and logged ---- */
    addMessage(threadKey, { jobId = null, fromRole, fromName, body }, actor) {
      const db = read();
      const msg = {
        id: uid("msg"), ts: new Date().toISOString(),
        threadKey, jobId, fromRole, fromName, body,
      };
      db.messages.push(msg);
      log(db, actor, "message.send", "message", msg.id, `${threadKey}: ${body.slice(0, 60)}`);
      write(db);
      return msg;
    },

    thread(threadKey) { return read().messages.filter((m) => m.threadKey === threadKey); },
    messages() { return read().messages; },
    audit() { return read().audit; },

    /* ---- CRM export (HubSpot-importable CSVs + full JSON) ---- */
    toCsv(rows, columns) {
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
    },

    exportContactsCsv() {
      const cols = ["email", "firstname", "lastname", "phone", "address", "city", "state", "zip", "marketing_consent", "lifecyclestage", "createdAt"];
      return this.toCsv(read().contacts, cols);
    },

    exportJobsCsv() {
      const rows = read().jobs.map((j) => ({
        dealname: `Gutters — ${j.address.street}, ${j.address.city}`,
        dealstage: j.dealstage,
        amount: j.amount,
        estimate_low: j.estimateLow,
        estimate_high: j.estimateHigh,
        gutter_feet: j.gutterFeet,
        region: j.region,
        contractor: j.contractorId ? (this.contractor(j.contractorId) || {}).company : "",
        deposit_paid_at: j.depositPaidAt,
        contract_signed_at: j.contractSignedAt,
        createdAt: j.createdAt,
      }));
      return this.toCsv(rows, ["dealname", "dealstage", "amount", "estimate_low", "estimate_high", "gutter_feet", "region", "contractor", "deposit_paid_at", "contract_signed_at", "createdAt"]);
    },

    exportAuditCsv() {
      return this.toCsv(read().audit, ["ts", "actor", "action", "entity", "entityId", "detail"]);
    },

    exportFullJson() { return JSON.stringify(read(), null, 2); },

    resetDemo() { localStorage.removeItem(DB_KEY); },
  };

  return api;
})();

/* ========================================================================
   Session — thin auth abstraction. Demo: email lookup, no password.
   Production swap: replace login() with a real auth call; the rest of the
   app only consumes Session.current().
   ======================================================================== */
const Session = (() => {
  const KEY = "ezgq.session";

  return {
    login(email) {
      const norm = email.trim().toLowerCase();
      const user = Store.users().find((u) => u.email === norm);
      const ctr = Store.contractors().find((c) => c.email === norm);
      let session = null;
      if (user) session = { role: user.role, name: user.name, email: user.email, userId: user.id };
      if (ctr) session = { role: "contractor", name: ctr.contactName, email: ctr.email, contractorId: ctr.id };
      if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
      return session;
    },
    current() {
      try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
    },
    logout() { sessionStorage.removeItem(KEY); },
  };
})();
