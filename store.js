"use strict";

/* ========================================================================
   Data layer — localStorage prototype store. Swap read/write for a cloud
   backend later; app code only calls Store.*.
   ======================================================================== */

const Store = (() => {
  const DB_KEY = "ffp.db.v2";

  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const seedContractor = (c) => ({
    id: uid("ctr"), createdAt: now(), status: "approved", approvedAt: now(),
    membership: { active: false, since: null }, autoBuy: false, maxLeadsPerMonth: 20,
    docs: [], termsAcceptedAt: now(), onboardingStep: 4, serviceStates: [c.state], ...c,
  });

  const seedDb = () => ({
    settings: {
      paidTierListPrice: 99, paidTierPrice: 0, subscriptionDays: 365,
      leadPrice: 35, membershipMonthly: 99, maxBuyersPerLead: 3, cardFeePct: 3,
      spreadFree: 15, spreadRefined: 7, stateMult: {},
      abOptInSplit: 50, ga4Id: "",
    },
    categories: seedCategories(),
    users: [
      { id: "u_admin", email: "admin@fastfreepricing.com", name: "Avery Admin", role: "admin" },
      { id: "u_sales", email: "sales@fastfreepricing.com", name: "Sam Sales", role: "sales" },
      { id: "u_expert", email: "expert@fastfreepricing.com", name: "Erin Estimator", role: "expert" },
    ],
    contractors: [
      seedContractor({
        company: "Cape Fear Exteriors LLC", contactName: "Maria Torres", email: "maria@capefearexteriors.com",
        phone: "(910) 555-0142", city: "Wilmington", state: "NC", zip: "28401",
        licenseNumber: "NC-GC-77812", services: ["gutters", "roofing", "siding", "windows", "doors"],
        membership: { active: true, since: now() }, autoBuy: true,
        docs: [{ id: uid("doc"), type: "license", name: "nc-gc-license.pdf", uploadedAt: now(), verified: true }],
      }),
      seedContractor({
        company: "Coastal Rain Solutions", contactName: "Deshawn Riley", email: "deshawn@coastalrain.com",
        phone: "(910) 555-0177", city: "Wilmington", state: "NC", zip: "28405",
        licenseNumber: "", services: ["gutters", "exterior-cleaning"],
        status: "invited", approvedAt: null, termsAcceptedAt: null, onboardingStep: 0,
      }),
    ],
    homeowners: [],
    projects: [],
    purchases: [],
    events: [],
    audit: [],
  });

  const write = (db) => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { alert("Prototype storage is full — reset demo data in Admin → Settings."); throw e; }
  };
  const read = () => {
    try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch { /* reseed */ }
    const db = seedDb(); write(db); return db;
  };
  const log = (db, actor, action, entity, id, detail = "") =>
    db.audit.push({ id: uid("log"), ts: now(), actor, action, entity, entityId: id, detail });
  const mutate = (fn) => { const db = read(); const out = fn(db); write(db); return out; };
  const byId = (list, id) => list.find((x) => x.id === id) || null;

  return {
    uid, now,

    /* ---- settings & config ---- */
    settings: () => read().settings,
    saveSettings: (patch, actor) => mutate((db) => {
      Object.assign(db.settings, patch);
      log(db, actor, "settings.update", "settings", "global", Object.keys(patch).join(", "));
      return db.settings;
    }),
    categories: () => read().categories,
    activeCategories: () => read().categories.filter((c) => c.active),
    category: (id) => byId(read().categories, id),
    saveCategory: (cat, actor, action = "category.update") => mutate((db) => {
      const i = db.categories.findIndex((c) => c.id === cat.id);
      if (i < 0) db.categories.push(clone(cat)); else db.categories[i] = clone(cat);
      log(db, actor, action, "category", cat.id, cat.name);
      return cat;
    }),

    /* ---- homeowners ---- */
    homeowner: (id) => byId(read().homeowners, id),
    homeownerByEmail: (email) => read().homeowners.find((h) => h.email === email.toLowerCase()) || null,
    createHomeowner: (data) => mutate((db) => {
      const days = db.settings.subscriptionDays;
      const h = {
        id: uid("ho"), createdAt: now(), email: data.email.toLowerCase(), firstName: data.firstName,
        lastName: data.lastName, phone: data.phone || "", marketingConsent: !!data.marketingConsent,
        subscriptionEnds: new Date(Date.now() + days * 864e5).toISOString(),
      };
      db.homeowners.push(h);
      log(db, h.email, "homeowner.create", "homeowner", h.id);
      return h;
    }),

    /* ---- projects (≈ deals) ---- */
    projects: () => read().projects,
    project: (id) => byId(read().projects, id),
    addProject: (data, actor) => mutate((db) => {
      const p = { id: uid("prj"), createdAt: now(), stage: "free", photos: [], quotes: [], isLead: false, ...data };
      db.projects.push(p);
      log(db, actor, "project.create", "project", p.id, `${p.categoryId} · ${p.address.city}, ${p.address.state}`);
      return p;
    }),
    updateProject: (id, patch, actor, action = "project.update") => mutate((db) => {
      const p = byId(db.projects, id);
      if (!p) return null;
      Object.assign(p, patch);
      log(db, actor, action, "project", id, Object.keys(patch).join(", "));
      return p;
    }),

    /* ---- contractors ---- */
    contractors: () => read().contractors,
    contractor: (id) => byId(read().contractors, id),
    addContractor: (data, actor, action = "contractor.create") => mutate((db) => {
      const c = {
        id: uid("ctr"), createdAt: now(), status: "invited", approvedAt: null, termsAcceptedAt: null,
        onboardingStep: 0, membership: { active: false, since: null }, autoBuy: false, maxLeadsPerMonth: 20,
        docs: [], services: [], serviceStates: [data.state].filter(Boolean), ...data,
      };
      db.contractors.push(c);
      log(db, actor, action, "contractor", c.id, c.company);
      return c;
    }),
    updateContractor: (id, patch, actor, action = "contractor.update") => mutate((db) => {
      const c = byId(db.contractors, id);
      if (!c) return null;
      Object.assign(c, patch);
      log(db, actor, action, "contractor", id, Object.keys(patch).join(", "));
      return c;
    }),

    /* ---- leads ---- */
    leadsFor(c) {
      return read().projects.filter((p) => p.isLead && c.services.includes(p.categoryId) && c.serviceStates.includes(p.address.state));
    },
    purchases: () => read().purchases,
    purchasesFor: (ctrId) => read().purchases.filter((x) => x.contractorId === ctrId),
    buyersOf: (projectId) => read().purchases.filter((x) => x.projectId === projectId && x.status !== "refunded"),

    buyLead: (ctrId, projectId, how, actor) => mutate((db) => {
      const s = db.settings;
      const active = db.purchases.filter((x) => x.projectId === projectId && x.status !== "refunded");
      if (active.some((x) => x.contractorId === ctrId)) return { ok: false, reason: "Already purchased" };
      if (active.length >= s.maxBuyersPerLead) return { ok: false, reason: "Lead is sold out" };
      const pur = { id: uid("pur"), ts: now(), contractorId: ctrId, projectId, price: s.leadPrice, how, status: "billed" };
      db.purchases.push(pur);
      log(db, actor, `lead.purchase.${how}`, "project", projectId, `${ctrId} · $${s.leadPrice}`);
      return { ok: true, purchase: pur };
    }),

    // Promote a project to a lead and run auto-buy for matching members
    publishLead: (projectId, actor) => {
      const p = Store.updateProject(projectId, { isLead: true, leadAt: now() }, actor, "lead.publish");
      Store.contractors()
        .filter((c) => c.status === "approved" && c.membership.active && c.autoBuy &&
          c.services.includes(p.categoryId) && c.serviceStates.includes(p.address.state))
        .forEach((c) => {
          const monthCount = Store.purchasesFor(c.id).filter((x) => x.ts.slice(0, 7) === now().slice(0, 7)).length;
          if (monthCount < c.maxLeadsPerMonth) Store.buyLead(c.id, projectId, "auto", "system");
        });
      return p;
    },

    requestRefund: (purchaseId, reason, actor) => mutate((db) => {
      const x = byId(db.purchases, purchaseId);
      if (!x || x.status !== "billed") return null;
      Object.assign(x, { status: "refund_requested", refundReason: reason });
      log(db, actor, "lead.refund.request", "purchase", purchaseId, reason);
      return x;
    }),
    resolveRefund: (purchaseId, approve, actor) => mutate((db) => {
      const x = byId(db.purchases, purchaseId);
      if (!x) return null;
      x.status = approve ? "refunded" : "billed";
      log(db, actor, approve ? "lead.refund.approve" : "lead.refund.deny", "purchase", purchaseId);
      return x;
    }),

    /* ---- staff ---- */
    users: () => read().users,

    /* ---- analytics events (local; GA4 receives them too) ---- */
    addEvent: (ev) => mutate((db) => { db.events.push({ ts: now(), ...ev }); if (db.events.length > 5000) db.events.shift(); }),
    events: () => read().events,

    /* ---- compliance ---- */
    audit: () => read().audit,
    toCsv(rows) {
      const cols = Object.keys(rows[0] || { empty: "" });
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    },
    exportProjectsCsv() {
      const hos = read().homeowners;
      return this.toCsv(read().projects.map((p) => {
        const h = hos.find((x) => x.id === p.homeownerId);
        return {
          id: p.id, created: p.createdAt, category: p.categoryId, stage: p.stage, is_lead: p.isLead,
          email: h?.email || p.contact?.email || "", city: p.address.city, state: p.address.state, zip: p.address.zip,
          good: p.free?.tiers.good.point, better: p.free?.tiers.better.point, best: p.free?.tiers.best.point,
          ownership: p.ownership?.status || "", ab_variant: p.abVariant,
        };
      }));
    },
    exportContractorsCsv() {
      return this.toCsv(read().contractors.map((c) => ({
        company: c.company, contact: c.contactName, email: c.email, phone: c.phone, state: c.state,
        license: c.licenseNumber, status: c.status, member: c.membership.active, auto_buy: c.autoBuy,
        services: c.services.join(";"),
      })));
    },
    exportPurchasesCsv() {
      return this.toCsv(read().purchases.map((x) => ({ id: x.id, ts: x.ts, contractor: x.contractorId, project: x.projectId, price: x.price, how: x.how, status: x.status })));
    },
    exportAuditCsv() { return this.toCsv(read().audit); },
    exportFullJson() { return JSON.stringify(read(), null, 2); },
    resetDemo() { localStorage.removeItem(DB_KEY); },
  };
})();

/* ========================================================================
   Session — prototype email sign-in (no passwords stored client-side).
   Production: replace with real auth (email magic link + Google/Apple OAuth).
   ======================================================================== */
const Session = (() => {
  const KEY = "ffp.session";
  const set = (s) => { sessionStorage.setItem(KEY, JSON.stringify(s)); return s; };
  return {
    loginStaffOrContractor(email) {
      const e = email.trim().toLowerCase();
      const u = Store.users().find((x) => x.email === e);
      if (u) return set({ kind: "staff", role: u.role, name: u.name, email: u.email });
      const c = Store.contractors().find((x) => x.email.toLowerCase() === e && x.status !== "rejected");
      if (c) return set({ kind: "contractor", role: "contractor", name: c.contactName, email: c.email, contractorId: c.id });
      return null;
    },
    loginHomeowner(email) {
      const h = Store.homeownerByEmail(email.trim());
      return h ? set({ kind: "homeowner", role: "homeowner", name: h.firstName, email: h.email, homeownerId: h.id }) : null;
    },
    current() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
    logout() { sessionStorage.removeItem(KEY); },
  };
})();

/* ---------- shared helpers ---------- */
const fmtUsd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

function downloadFile(filename, content, mime = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Downscale so prototype photos fit in localStorage
function imageToThumb(file, maxDim = 640, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}
