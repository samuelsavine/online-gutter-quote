"use strict";

/* ========================================================================
   Payments — PLACEHOLDER. No card data is collected and nothing is charged.
   Production: replace checkout() with a backend call that creates a Stripe
   Checkout Session (one-time: advanced report, lead unlock; subscription:
   associate membership) and resolves on the webhook-confirmed result.
   ======================================================================== */

const Payments = (() => {
  function checkout({ amount, description, recurring = false }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "pay-overlay";
      overlay.innerHTML = `
        <div class="pay-modal" role="dialog" aria-modal="true" aria-label="Checkout">
          <div class="pay-head">
            <span class="pay-brand">FastFreePricing</span>
            <span class="pay-test-badge">PAYMENT PLACEHOLDER</span>
          </div>
          <p class="pay-desc"></p>
          <div class="pay-total"><span>${recurring ? "Due monthly" : "Due now"}</span><span>${fmtUsd(amount)}${recurring ? "/mo" : ""}</span></div>
          <p class="pay-hint">Payment processing is not connected yet. Choose an outcome to continue the demo.</p>
          <button class="btn btn-primary pay-submit">Simulate successful payment</button>
          <button class="btn btn-ghost pay-cancel">Cancel</button>
        </div>`;
      overlay.querySelector(".pay-desc").textContent = description;
      document.body.appendChild(overlay);

      overlay.querySelector(".pay-cancel").addEventListener("click", () => {
        overlay.remove();
        resolve({ status: "canceled" });
      });
      overlay.querySelector(".pay-submit").addEventListener("click", () => {
        overlay.remove();
        resolve({ status: "succeeded", id: "placeholder_" + Math.random().toString(36).slice(2, 10), amount });
      });
    });
  }

  return { checkout };
})();
