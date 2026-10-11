"use strict";

/* Customer job tracker — identified by job id + email from the post-deposit link. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmt = (n) => "$" + Number(n).toLocaleString("en-US", Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const params = new URLSearchParams(location.search);
const jobId = params.get("job");
const email = (params.get("email") || "").toLowerCase();

const STAGES = [
  ["deposit_paid", "Deposit received", "Your job is posted to vetted local contractors."],
  ["accepted", "Contractor matched", "A contractor accepted your job and will confirm your date."],
  ["contracted", "Contract signed", "Scope and price are locked in your signed agreement."],
  ["final_paid", "Paid & scheduled", "All set — see you at installation!"],
];

function render() {
  const el = $("#jobView");
  const job = Store.job(jobId);
  const contact = job && Store.contact(job.contactId);

  if (!job || !contact || contact.email.toLowerCase() !== email) {
    el.innerHTML = `<div class="estimate-card login-card"><h2>Job not found</h2>
      <p class="step-hint">Check the link from your confirmation screen or email.</p></div>`;
    return;
  }

  const ctr = job.contractorId ? Store.contractor(job.contractorId) : null;
  const stageIdx = STAGES.findIndex(([s]) => s === job.dealstage);
  const split = Payments.computeSplit(job, "final");

  el.innerHTML = `
    <h2>Hi ${esc(contact.firstname)} — here's your job status</h2>
    <p class="step-hint">${esc(job.address.street)}, ${esc(job.address.city)}, ${esc(job.address.state)} ${esc(job.address.zip)}
      · Window: ${fmtDate(job.timeframe.start)} → ${fmtDate(job.timeframe.end)}</p>

    <ol class="status-steps">${STAGES.map(([key, label, desc], i) => `
      <li class="${i <= stageIdx ? "done" : ""}">
        <span class="status-dot">${i <= stageIdx ? "✓" : i + 1}</span>
        <div><strong>${label}</strong><p>${desc}</p></div>
      </li>`).join("")}</ol>

    <div class="estimate-card job-detail-card">
      <h3>Your estimate</h3>
      <div class="estimate-range">${fmt(job.estimateLow)}–${fmt(job.estimateHigh)}</div>
      <p class="estimate-disclaimer"><strong>Non-binding estimate; the final contract price governs.</strong>
        Working price: ${fmt(job.amount)} · Deposit paid: ${fmt(job.depositAmount)} (credited)</p>
      ${ctr ? `<p><strong>Your contractor:</strong> ${esc(ctr.company)} (${esc(ctr.contactName)})${ctr.licensed ? " · ✔ Licensed" : ""}</p>` : ""}

      ${job.dealstage === "accepted" ? `
        <a class="btn btn-ghost" href="contract.html?job=${job.id}&email=${encodeURIComponent(email)}" >Review &amp; sign your contract</a>` : ""}
      ${job.dealstage === "contracted" ? `
        <p><a class="btn btn-ghost btn-sm" href="contract.html?job=${job.id}&email=${encodeURIComponent(email)}">View signed contract</a></p>
        <button class="btn btn-primary btn-lg" id="payFinalBtn">Pay remaining balance — ${fmt(split.total)}</button>
        <p class="estimate-disclaimer">Payment is split automatically: ${fmt(split.contractor)} to ${esc(ctr.company)}, platform fee retained by EZ Gutter Co.</p>` : ""}
      ${job.dealstage === "final_paid" ? `<p class="badge badge-good">Paid in full ✓ — receipt logged</p>` : ""}
    </div>

    ${ctr ? `
    <h3>Messages with ${esc(ctr.company)}</h3>
    <p class="step-hint">Keep all project communication here — it protects both you and your contractor.</p>
    <div class="chat-holder" id="chat"></div>` : `
    <p class="empty-note">Messaging opens once a contractor accepts your job.</p>`}
  `;

  if (ctr) mountChat($("#chat"), `job:${job.id}:customer`, job.id);

  const payBtn = $("#payFinalBtn");
  if (payBtn) payBtn.addEventListener("click", async () => {
    const result = await Payments.checkout({
      amount: split.total,
      description: `Final payment — gutter installation at ${job.address.street}`,
      lineItems: [
        { label: "Contract price", amount: job.amount },
        { label: "Deposit credit", amount: -job.depositAmount },
      ],
    });
    if (result.status !== "succeeded") return;
    Store.addPayment(job.id, { type: "final", amount: split.total, stripeId: result.id, split }, email);
    render();
  });
}

function mountChat(holder, threadKey, jid) {
  const rerender = () => {
    const msgs = Store.thread(threadKey);
    holder.innerHTML = `
      <div class="chat-log">${msgs.length ? msgs.map((m) => `
        <div class="chat-msg ${m.fromRole === "customer" ? "mine" : ""}">
          <span class="chat-meta">${esc(m.fromName)} · ${new Date(m.ts).toLocaleString()}</span>
          <p>${esc(m.body)}</p>
        </div>`).join("") : `<p class="empty-note">No messages yet — say hello!</p>`}
      </div>
      <div class="chat-compose">
        <input type="text" placeholder="Message your contractor…" />
        <button class="btn btn-primary btn-sm">Send</button>
      </div>`;
    const input = $("input", holder);
    const send = () => {
      if (!input.value.trim()) return;
      const contact = Store.contact(Store.job(jid).contactId);
      Store.addMessage(threadKey, {
        jobId: jid, fromRole: "customer",
        fromName: `${contact.firstname} ${contact.lastname}`, body: input.value.trim(),
      }, email);
      rerender();
      $("input", holder).focus();
    };
    $("button", holder).addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const log = $(".chat-log", holder);
    log.scrollTop = log.scrollHeight;
  };
  rerender();
}

render();
