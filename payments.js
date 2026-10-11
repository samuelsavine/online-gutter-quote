"use strict";

/* ========================================================================
   Payments — Stripe-shaped adapter (PROTOTYPE: simulated test mode).
   Production swap: replace `checkout()` internals with a call to your
   backend that creates a Stripe Checkout Session (mode: payment) with a
   Connect destination charge + application_fee_amount for the split.
   The rest of the app only consumes Payments.checkout() and .computeSplit().
   ======================================================================== */

const Payments = (() => {
  const fmtUsd = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Mirrors a Stripe Connect destination charge: platform keeps the fee,
  // contractor receives the transfer. Deposit is pure platform-held funds
  // credited against the final invoice.
  function computeSplit(job, type) {
    const commission = Math.round(job.amount * (job.commissionPct / 100) * 100) / 100;
    if (type === "deposit") {
      return { total: job.depositAmount, platform: job.depositAmount, contractor: 0 };
    }
    const remaining = Math.round((job.amount - job.depositAmount) * 100) / 100;
    const contractorShare = Math.round((job.amount - commission) * 100) / 100;
    return { total: remaining, platform: Math.round((remaining - contractorShare) * 100) / 100, contractor: contractorShare };
  }

  function checkout({ amount, description, lineItems = [] }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "pay-overlay";
      overlay.innerHTML = `
        <div class="pay-modal" role="dialog" aria-modal="true" aria-label="Checkout">
          <div class="pay-head">
            <span class="pay-brand">EZ Gutter Co.</span>
            <span class="pay-test-badge">TEST MODE</span>
          </div>
          <p class="pay-desc"></p>
          <ul class="pay-lines">${lineItems.map((li) => `<li><span>${li.label}</span><span>${fmtUsd(li.amount)}</span></li>`).join("")}</ul>
          <div class="pay-total"><span>Due now</span><span>${fmtUsd(amount)}</span></div>
          <label class="pay-field">Card number
            <input type="text" inputmode="numeric" placeholder="4242 4242 4242 4242" autocomplete="cc-number" />
          </label>
          <div class="pay-row">
            <label class="pay-field">Expiry<input type="text" placeholder="12/34" autocomplete="cc-exp" /></label>
            <label class="pay-field">CVC<input type="text" inputmode="numeric" placeholder="123" autocomplete="cc-csc" /></label>
          </div>
          <p class="pay-hint">Use test card 4242 4242 4242 4242 with any future expiry and any CVC.</p>
          <button class="btn btn-primary pay-submit">Pay ${fmtUsd(amount)}</button>
          <button class="btn btn-ghost pay-cancel">Cancel</button>
          <p class="pay-error hidden"></p>
        </div>`;
      overlay.querySelector(".pay-desc").textContent = description;
      document.body.appendChild(overlay);
      const cardInput = overlay.querySelector(".pay-field input");
      cardInput.focus();

      overlay.querySelector(".pay-cancel").addEventListener("click", () => {
        overlay.remove();
        resolve({ status: "canceled" });
      });

      overlay.querySelector(".pay-submit").addEventListener("click", () => {
        const digits = cardInput.value.replace(/\s/g, "");
        if (digits !== "4242424242424242") {
          const err = overlay.querySelector(".pay-error");
          err.textContent = "Card declined (prototype accepts only the 4242 test card).";
          err.classList.remove("hidden");
          return;
        }
        const btn = overlay.querySelector(".pay-submit");
        btn.disabled = true;
        btn.textContent = "Processing…";
        setTimeout(() => {
          overlay.remove();
          resolve({
            status: "succeeded",
            id: "pi_test_" + Math.random().toString(36).slice(2, 12),
            amount,
          });
        }, 900);
      });
    });
  }

  return { checkout, computeSplit, fmtUsd };
})();
