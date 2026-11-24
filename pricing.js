"use strict";

/* ========================================================================
   Pricing engine — evaluates a category's admin-defined formula:
     Price[tier] = max(Minimum,
                   (Rate[tier] × Quantity × Scale × ΠMultipliers
                    + ΣAdditions + ΣPerUnit[tier] × Value) × Regional × General)
   then widens into a range by the free/refined spread.
   ======================================================================== */

const Pricing = (() => {
  const round50 = (n) => Math.round(n / 50) * 50;
  const asList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

  // Resolve a question's numeric value: typed number, or an option's "= value" modifier
  function numericValue(q, answer, tier) {
    if (typeof answer === "number") return answer;
    if (!q.options) return null;
    for (const a of asList(answer)) {
      const opt = q.options.find((o) => o.id === a || o.label === a);
      if (opt && opt.mod.type === "value") return Number(opt.mod[tier]) || 0;
    }
    return null;
  }

  function generalFactor(universal = {}) {
    let f = 1;
    for (const [g, map] of Object.entries(UNIVERSAL_MULT)) {
      asList(universal[g]).forEach((v) => { if (map[v]) f *= map[v]; });
    }
    return f;
  }

  function evaluate(cat, answers, ctx = {}) {
    const settings = ctx.settings || {};
    const region = ({ ...STATE_MULT, ...(settings.stateMult || {}) })[(ctx.state || "").toUpperCase()] ?? 1;
    const general = generalFactor(ctx.universal);
    const refined = !!ctx.refined;
    const spreadPct = (refined ? settings.spreadRefined ?? 7 : settings.spreadFree ?? 15) / 100;

    let qtyAssumed = false;
    const unsureCount = Object.values(answers).flatMap(asList).filter(isUnsure).length;
    const tiers = {};
    const factors = [];

    TIERS.forEach((tier) => {
      let qty = 1, scale = 1, mult = 1, add = 0, per = 0;

      cat.questions.forEach((q) => {
        const ans = answers[q.id];
        const val = numericValue(q, ans, tier);
        if (q.role === "quantity") {
          if (val > 0) qty = val; else { qty = q.defaultQty || 1; qtyAssumed = true; }
        }
        if (q.role === "scale" && q.ref > 0) {
          if (val > 0) scale *= Math.pow(val / q.ref, q.exp || 1); else qtyAssumed = true;
        }
        if (q.role === "perUnit" && val > 0) per += val * (Number(q.rate[tier]) || 0);

        if (q.options) {
          asList(ans).forEach((a) => {
            const opt = q.options.find((o) => o.id === a || o.label === a);
            if (!opt) return;
            const amt = Number(opt.mod[tier]) || 0;
            if (opt.mod.type === "mult" && amt > 0) mult *= amt;
            if (opt.mod.type === "add") add += amt;
            if (tier === "better" && opt.mod.type !== "none" && opt.mod.type !== "value") {
              factors.push({ question: q.text, option: opt.label, type: opt.mod.type, mod: opt.mod });
            }
          });
        }
      });

      const base = cat.unit === "job" ? cat.rate[tier] : qty * cat.rate[tier];
      const point = Math.max(cat.min * region, (base * scale * mult + add + per) * region * general);
      const spread = spreadPct + Math.min(unsureCount * 0.03, 0.15) + (qtyAssumed ? 0.1 : 0);
      tiers[tier] = { point: round50(point), low: round50(point * (1 - spread)), high: round50(point * (1 + spread)), qty, mult, add, per, scale };
    });

    return { tiers, region, general, qtyAssumed, unsureCount, factors, refined };
  }

  /* ---------- rationale (REQ-10) ---------- */
  function rationale(cat, result) {
    const lines = [];
    const q = result.tiers.better.qty;
    if (cat.unit !== "job") {
      lines.push(`${result.qtyAssumed ? "Assumed a typical" : "Based on"} ${q.toLocaleString("en-US")} ${UNIT_LABEL[cat.unit]} at ${fmtRate(cat.rate.good)}–${fmtRate(cat.rate.best)} per ${cat.unit === "each" ? "unit" : UNIT_LABEL[cat.unit].replace(/s$/, "")} depending on quality tier.`);
    }
    result.factors.forEach((f) => {
      const v = f.type === "mult"
        ? `×${Number(f.mod.better).toFixed(2)} (${pctChange(f.mod.better)})`
        : `+${fmtUsd(f.mod.good)}–${fmtUsd(f.mod.best)}`;
      lines.push(`${f.option} (${f.question.replace(/\?$/, "")}): ${v}`);
    });
    if (result.region !== 1) lines.push(`Regional cost adjustment: ×${result.region.toFixed(2)} (${pctChange(result.region)} vs national average).`);
    if (result.general !== 1) lines.push(`Property type / timeline adjustment: ×${result.general.toFixed(2)}.`);
    if (result.unsureCount) lines.push(`${result.unsureCount} “not sure” answer${result.unsureCount > 1 ? "s" : ""} widened the range.`);
    return lines;
  }

  const pctChange = (m) => `${m >= 1 ? "+" : "−"}${Math.abs(Math.round((m - 1) * 100))}%`;
  const fmtRate = (n) => "$" + Number(n).toLocaleString("en-US", Number.isInteger(Number(n)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- formula text for the admin page ---------- */
  function formulaText(cat) {
    const name = (q) => `[${q.text.replace(/\?$/, "")}]`;
    const qtyQ = cat.questions.find((q) => q.role === "quantity");
    const scaleQs = cat.questions.filter((q) => q.role === "scale");
    const perQs = cat.questions.filter((q) => q.role === "perUnit");
    const multQs = cat.questions.filter((q) => q.options?.some((o) => o.mod.type === "mult"));
    const addQs = cat.questions.filter((q) => q.options?.some((o) => o.mod.type === "add"));
    let base = "Rate[tier]";
    if (cat.unit !== "job") base += ` × ${qtyQ ? name(qtyQ) : "Quantity"}`;
    scaleQs.forEach((q) => { base += ` × (${name(q)} ÷ ${q.ref})^${q.exp}`; });
    if (multQs.length) base += ` × ${multQs.map((q) => `M${name(q)}`).join(" × ")}`;
    let sum = base;
    if (addQs.length) sum += ` + ${addQs.map((q) => `A${name(q)}`).join(" + ")}`;
    if (perQs.length) sum += ` + ${perQs.map((q) => `${name(q)} × PerUnit[tier]`).join(" + ")}`;
    return `Price[tier] = max(${fmtUsd(cat.min)}, (${sum}) × Regional × General)`;
  }

  /* ---------- name your price (REQ-13) ---------- */
  function nameYourPrice(cat, answers, ctx, target) {
    const r = evaluate(cat, answers, { ...ctx, refined: true });
    const fits = TIERS.filter((t) => r.tiers[t].point <= target);
    const tier = fits.length ? fits[fits.length - 1] : "good";
    const t = r.tiers[tier];
    const tips = [];
    if (!fits.length) tips.push(`Your target is below our Good-tier estimate (${fmtUsd(r.tiers.good.low)}–${fmtUsd(r.tiers.good.high)}).`);
    else tips.push(`${TIER_LABEL[tier]} (${TIER_DESC[tier]}) fits your budget at about ${fmtUsd(t.point)}.`);

    const qtyQ = cat.questions.find((q) => q.role === "quantity");
    if (qtyQ && cat.unit !== "job" && t.point > target) {
      const unitCost = cat.rate[tier] * t.scale * t.mult;
      const maxQty = Math.floor((target / (r.region * r.general) - t.add - t.per) / unitCost);
      if (maxQty > 0) tips.push(`To reach ${fmtUsd(target)}, limit ${qtyQ.text.replace(/\?$/, "").toLowerCase()} to about ${maxQty.toLocaleString("en-US")} ${UNIT_LABEL[cat.unit]}.`);
    }
    cat.questions.forEach((q) => {
      if (!q.options) return;
      asList(answers[q.id]).forEach((a) => {
        const cur = q.options.find((o) => o.id === a || o.label === a);
        if (!cur || cur.mod.type !== "mult" || cur.mod[tier] <= 1) return;
        const cheaper = q.options.filter((o) => o.mod.type === "none" || (o.mod.type === "mult" && o.mod[tier] < cur.mod[tier]))
          .filter((o) => !isUnsure(o.label));
        if (cheaper.length) tips.push(`Choosing “${cheaper[0].label}” instead of “${cur.label}” (${q.text.replace(/\?$/, "").toLowerCase()}) saves about ${Math.round((1 - (Number(cheaper[0].mod[tier]) || 1) / cur.mod[tier]) * 100)}%.`);
      });
    });
    return { tier, result: r, tips };
  }

  return { evaluate, rationale, formulaText, nameYourPrice, numericValue };
})();
