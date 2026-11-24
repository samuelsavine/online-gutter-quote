"use strict";

/* Shared report rendering for the free report (index) and account dashboard. */
const Report = (() => {
  function tierCards(cat, result) {
    return `<div class="tier-cards">${TIERS.map((t) => {
      const r = result.tiers[t];
      return `<div class="tier-card tier-${t}">
        <span class="tier-name">${TIER_LABEL[t]}</span>
        <span class="tier-desc">${TIER_DESC[t]}</span>
        <strong class="tier-range">${fmtUsd(r.low)}–${fmtUsd(r.high)}</strong>
      </div>`;
    }).join("")}</div>`;
  }

  // Templated stand-in for the AI summary (REQ-04); same inputs an LLM would receive
  function summary(cat, project, result) {
    const a = project.answers;
    const q1 = cat.questions[0];
    const scope = q1 && a[q1.id] ? (Array.isArray(a[q1.id]) ? a[q1.id].join(", ") : a[q1.id]) : "";
    const g = result.tiers.good, b = result.tiers.better, s = result.tiers.best;
    const qty = cat.unit !== "job" && !result.qtyAssumed
      ? ` covering about ${result.tiers.better.qty.toLocaleString("en-US")} ${UNIT_LABEL[cat.unit]}` : "";
    const drivers = result.factors
      .filter((f) => f.type === "add" || Math.abs(f.mod.better - 1) >= 0.08)
      .sort((x, y) => (y.type === "mult" ? y.mod.better : 1.1) - (x.type === "mult" ? x.mod.better : 1.1))
      .slice(0, 3).map((f) => `<strong>${escHtml(f.option.toLowerCase())}</strong>`);
    const regionPct = Math.round((result.region - 1) * 100);
    const parts = [
      `For a ${escHtml(cat.name.toLowerCase())} project${scope ? ` (${escHtml(scope.toLowerCase())})` : ""}${qty} in ${escHtml(project.address.city)}, ${escHtml(project.address.state)},
       homeowners typically pay <strong>${fmtUsd(g.low)}–${fmtUsd(g.high)}</strong> for builder-grade work,
       <strong>${fmtUsd(b.low)}–${fmtUsd(b.high)}</strong> for mid-range, and <strong>${fmtUsd(s.low)}–${fmtUsd(s.high)}</strong> for upscale.`,
    ];
    if (drivers.length) parts.push(`The biggest cost drivers in your answers are ${drivers.join(", ")}.`);
    if (regionPct) parts.push(`Costs in ${escHtml(project.address.state)} run about ${Math.abs(regionPct)}% ${regionPct > 0 ? "above" : "below"} the national average.`);
    if (result.qtyAssumed) parts.push("We assumed a typical project size — measuring will tighten your range.");
    if (result.unsureCount) parts.push(`You answered “not sure” ${result.unsureCount} time${result.unsureCount > 1 ? "s" : ""}, so the range is wider.`);
    return `<p class="report-summary">${parts.join(" ")}</p>`;
  }

  function sources(cat) {
    return `<div class="sources">
      <h4>Sources &amp; further reading</h4>
      <ol>${cat.sources.map((s) => `<li><a href="${escHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escHtml(s.label)}</a></li>`).join("")}</ol>
      <p class="fine">Price ranges are compiled from publicly available data and regional cost adjustments. Not a quote.</p>
    </div>`;
  }

  const disclaimer = `<p class="fine"><strong>Non-binding estimate.</strong> Actual prices depend on measurements, site conditions,
    permits, and the contractor you hire.</p>`;

  return { tierCards, summary, sources, disclaimer };
})();
