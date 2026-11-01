"use strict";

/* ========================================================================
   Data layer — localStorage prototype store (swap read/write for a cloud
   backend later; app code only calls Store.*).
   Collections:
     submissions  — homeowner requests (≈ CRM contact + one deal per project)
     businesses   — service providers; tier "level1" | "associate"
     users        — staff (admin, sales, expert)
     audit        — append-only compliance log
   ======================================================================== */

const Store = (() => {
  const DB_KEY = "ffp.db.v1";

  const uid = (prefix) =>
    `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();

  const seedBusiness = (b) => ({
    id: uid("biz"), createdAt: now(), source: "seed", claimed: true, verified: true,
    tier: "level1", associateSince: null, unlockedLeads: [], serviceStates: [b.state],
    licenseType: "", ...b,
  });

  const seedDb = () => ({
    settings: {
      advancedReportPrice: 49,
      associateMonthlyPrice: 99,
      leadUnlockPrice: 25,
      priceBook: {},      // per-service overrides of catalog pricing
      stateMult: {},      // per-state overrides of catalog regional multipliers
    },
    users: [
      { id: "u_admin", email: "admin@fastfreepricing.com", name: "Avery Admin", role: "admin" },
      { id: "u_sales", email: "sales@fastfreepricing.com", name: "Sam Sales", role: "sales" },
      { id: "u_expert", email: "expert@fastfreepricing.com", name: "Erin Estimator", role: "expert" },
    ],
    businesses: [
      seedBusiness({
        name: "Cape Fear Exteriors LLC", contactName: "Maria Torres", email: "maria@capefearexteriors.com",
        phone: "(910) 555-0142", city: "Wilmington", state: "NC", zip: "28401",
        licenseNumber: "NC-GC-77812", licenseType: "General Contractor — Unlimited",
        services: ["gutters", "roofing", "siding", "windows", "doors"], tier: "associate", associateSince: now(),
      }),
      seedBusiness({
        name: "Coastal Rain Solutions", contactName: "Deshawn Riley", email: "deshawn@coastalrain.com",
        phone: "(910) 555-0177", city: "Wilmington", state: "NC", zip: "28405",
        licenseNumber: "", services: ["gutters", "exterior-cleaning"],
      }),
      seedBusiness({
        name: "Port City Plumbing & Air", contactName: "Lena Park", email: "",
        phone: "(910) 555-0190", city: "Wilmington", state: "NC", zip: "28403",
        licenseNumber: "NC-PL-30441", licenseType: "Plumbing Class I", source: "import", claimed: false, verified: false,
        services: ["plumbing", "hvac"],
      }),
      seedBusiness({
        name: "Seaside Decks & Fence", contactName: "Owen Price", email: "",
        phone: "(910) 555-0123", city: "Leland", state: "NC", zip: "28451",
        licenseNumber: "NC-GC-81230", licenseType: "General Contractor — Limited", source: "import", claimed: false, verified: false,
        services: ["decks", "fences", "concrete"],
      }),
    ],
    submissions: [],
    audit: [],
  });

  const write = (db) => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      // Prototype storage is ~5 MB; photos are thumbnails but can still overflow
      alert("Prototype storage is full — reset demo data from the admin Settings tab.");
      throw e;
    }
  };

  const read = () => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupt db falls through to reseed */ }
    const db = seedDb();
    write(db);
    return db;
  };

  const log = (db, actor, action, entity, entityId, detail = "") => {
    db.audit.push({ id: uid("log"), ts: now(), actor, action, entity, entityId, detail });
  };

  const mutate = (fn) => { const db = read(); const out = fn(db); write(db); return out; };

  return {
    uid,

    /* ---- settings ---- */
    settings: () => read().settings,
    saveSettings: (patch, actor) => mutate((db) => {
      Object.assign(db.settings, patch);
      log(db, actor, "settings.update", "settings", "global", Object.keys(patch).join(", "));
      return db.settings;
    }),

    /* ---- submissions ---- */
    addSubmission: (data, actor) => mutate((db) => {
      const sub = { id: uid("sub"), createdAt: now(), status: "quoted", advanced: null, ...data };
      db.submissions.push(sub);
      log(db, actor, "submission.create", "submission", sub.id,
        `${sub.projects.map((p) => p.serviceId).join(", ")} · ${sub.address.city}, ${sub.address.state}`);
      return sub;
    }),
    updateSubmission: (id, patch, actor, action = "submission.update") => mutate((db) => {
      const sub = db.submissions.find((s) => s.id === id);
      if (!sub) return null;
      Object.assign(sub, patch);
      log(db, actor, action, "submission", id, Object.keys(patch).join(", "));
      return sub;
    }),
    submission: (id) => read().submissions.find((s) => s.id === id) || null,
    submissions: () => read().submissions,

    /* ---- staff ---- */
    users: () => read().users,

    /* ---- businesses ---- */
    businesses: () => read().businesses,
    business: (id) => read().businesses.find((b) => b.id === id) || null,
    addBusiness: (data, actor, action = "business.create") => mutate((db) => {
      const biz = {
        id: uid("biz"), createdAt: now(), tier: "level1", associateSince: null, unlockedLeads: [],
        claimed: false, verified: false, services: [], serviceStates: [data.state].filter(Boolean), ...data,
      };
      db.businesses.push(biz);
      log(db, actor, action, "business", biz.id, biz.name);
      return biz;
    }),
    updateBusiness: (id, patch, actor, action = "business.update") => mutate((db) => {
      const biz = db.businesses.find((b) => b.id === id);
      if (!biz) return null;
      Object.assign(biz, patch);
      log(db, actor, action, "business", id, Object.keys(patch).join(", "));
      return biz;
    }),

    /* ---- leads: consented submissions a business could service ---- */
    leadsFor(biz) {
      return read().submissions.filter((s) =>
        s.contact.shareWithPros &&
        biz.serviceStates.includes(s.address.state) &&
        s.projects.some((p) => biz.services.includes(p.serviceId)));
    },
    unlockLead: (bizId, subId, payRef, actor) => mutate((db) => {
      const biz = db.businesses.find((b) => b.id === bizId);
      if (!biz || biz.unlockedLeads.includes(subId)) return biz;
      biz.unlockedLeads.push(subId);
      log(db, actor, "lead.unlock", "submission", subId, `${biz.name} · ${payRef}`);
      return biz;
    }),

    /* ---- compliance ---- */
    audit: () => read().audit,

    /* ---- exports (CRM-ready) ---- */
    toCsv(rows, columns) {
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
    },
    exportContactsCsv() {
      const rows = read().submissions.map((s) => ({
        email: s.contact.email, firstname: s.contact.firstName, lastname: s.contact.lastName,
        phone: s.contact.phone, address: s.address.street, city: s.address.city, state: s.address.state,
        zip: s.address.zip, property_type: s.universal.G2, ownership: s.universal.G3,
        marketing_consent: s.contact.marketingConsent, createdate: s.createdAt,
      }));
      return this.toCsv(rows, Object.keys(rows[0] || { email: "" }));
    },
    exportDealsCsv() {
      const rows = read().submissions.flatMap((s) => s.projects.map((p) => ({
        dealname: `${p.serviceName} — ${s.address.street}, ${s.address.city}`,
        contact_email: s.contact.email, service: p.serviceId, dealstage: s.status,
        estimate_low: p.estimate.low, estimate_high: p.estimate.high,
        advanced_report: s.advanced ? "yes" : "no", timeframe: s.universal.G4, createdate: s.createdAt,
      })));
      return this.toCsv(rows, Object.keys(rows[0] || { dealname: "" }));
    },
    exportBusinessesCsv() {
      const rows = read().businesses.map((b) => ({
        name: b.name, contact: b.contactName, email: b.email, phone: b.phone, city: b.city, state: b.state,
        zip: b.zip, license_number: b.licenseNumber, license_type: b.licenseType, tier: b.tier,
        services: b.services.join(";"), source: b.source, claimed: b.claimed,
      }));
      return this.toCsv(rows, Object.keys(rows[0] || { name: "" }));
    },
    exportAuditCsv() { return this.toCsv(read().audit, ["ts", "actor", "action", "entity", "entityId", "detail"]); },
    exportFullJson() { return JSON.stringify(read(), null, 2); },

    resetDemo() { localStorage.removeItem(DB_KEY); },
  };
})();

/* ========================================================================
   Session — thin auth abstraction. Prototype: email lookup, no password.
   Production: replace login() with real auth; app only uses Session.current().
   ======================================================================== */
const Session = (() => {
  const KEY = "ffp.session";
  return {
    login(email) {
      const norm = email.trim().toLowerCase();
      if (!norm) return null;
      const user = Store.users().find((u) => u.email === norm);
      const biz = Store.businesses().find((b) => b.claimed && (b.email || "").toLowerCase() === norm);
      let session = null;
      if (user) session = { role: user.role, name: user.name, email: user.email, userId: user.id };
      else if (biz) session = { role: "business", name: biz.contactName || biz.name, email: biz.email, businessId: biz.id };
      if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
      return session;
    },
    current() {
      try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
    },
    logout() { sessionStorage.removeItem(KEY); },
  };
})();

/* ---------- shared UI helpers ---------- */
const fmtUsd = (n) => "$" + Math.round(Number(n)).toLocaleString("en-US");
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function downloadFile(filename, content, mime = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Downscale to a small JPEG data URL so prototype photos fit in localStorage
function imageToThumb(file, maxDim = 640, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}
