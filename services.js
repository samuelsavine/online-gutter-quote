"use strict";

/* ========================================================================
   Analytics — sends events to GA4 when a Measurement ID is configured
   (Admin → Settings) and mirrors them locally for the admin dashboard.
   A/B assignment is sticky per browser.
   ======================================================================== */
const Analytics = (() => {
  const VKEY = "ffp.ab.optin";
  let gaReady = false;

  function initGa() {
    const id = Store.settings().ga4Id;
    if (!id || !/^G-[A-Z0-9]+$/i.test(id) || gaReady) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
    gaReady = true;
  }

  function track(type, data = {}) {
    const ev = { type, variant: variant(), ...data };
    Store.addEvent(ev);
    if (gaReady) window.gtag("event", type, ev);
  }

  // REQ-14: contractor opt-in "before" vs "after" the free price
  function variant() {
    let v = localStorage.getItem(VKEY);
    if (!v) {
      v = Math.random() * 100 < Store.settings().abOptInSplit ? "A_before" : "B_after";
      localStorage.setItem(VKEY, v);
    }
    return v;
  }

  return { initGa, track, variant };
})();

/* ========================================================================
   Ownership verification (REQ-26) — Regrid adapter.
   Prototype: SIMULATED parcel lookup. Production: call a server-side
   function that holds the Regrid token (never ship the token to browsers).
   Demo rule: street numbers ending in 7 return a different owner.
   ======================================================================== */
const Ownership = (() => {
  const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");

  async function lookup(address, lastName) {
    await new Promise((r) => setTimeout(r, 500));
    const num = (address.street.match(/^\d+/) || ["0"])[0];
    const owner = num.endsWith("7") ? "HARBOR PROPERTY HOLDINGS LLC" : `${String(lastName).toUpperCase()} FAMILY TRUST`;
    return { source: "Regrid (simulated)", parcelOwner: owner, apn: `R0${num.padStart(5, "0")}-00${num.length}` };
  }

  async function verify(address, firstName, lastName) {
    const rec = await lookup(address, lastName);
    const matched = norm(rec.parcelOwner).includes(norm(lastName));
    return { status: matched ? "verified" : "mismatch", ...rec, checkedAt: new Date().toISOString() };
  }

  return { verify };
})();
