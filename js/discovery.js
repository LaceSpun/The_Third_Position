/*
  Longitudinal Discovery Engine
  -----------------------------
  Turns the raw response log into cautious, evidence-gated insights.
  Never infers anything from a single response. Never flattens a real
  difference between domains into one trait — a "no single rule here"
  result is a first-class, valid outcome (OPEN_MYSTERY / DOMAIN_SPLIT).

  Every insight object has:
    type              OBSERVED_PATTERN | DOMAIN_SPLIT | CONTRADICTION |
                       EVOLUTION | OUTLIER | OPEN_MYSTERY
    title             short human label
    observedPattern   one sentence, cautiously worded
    evidenceCount     number of responses supporting it
    domains           domains where it appeared
    counterexamples   response snippets that don't fit
    confidence        "low" | "moderate" | "high" (never certainty)
    exampleResponses  [{dilemmaId, snippet, mechanism}]
    alternativeExplanation  a plausible competing account of the same data
    disconfirm        what future evidence would weaken/undo this insight
*/

const MILESTONES = [5, 12, 25, 50, 100];
function nextMilestoneSchedule(n) {
  // after 100, unlock every 50
  const arr = [...MILESTONES];
  let m = 150;
  while (m <= n + 50) {
    arr.push(m);
    m += 50;
  }
  return arr;
}

function dilemmaById(id) {
  return DILEMMAS.find((d) => d.id === id);
}

function mode(arr) {
  const counts = new Map();
  for (const x of arr) counts.set(x, (counts.get(x) || 0) + 1);
  let best = null,
    bestCount = -1;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return { value: best, count: bestCount, total: arr.length, counts };
}

function entropy(arr) {
  const counts = mode(arr).counts;
  const n = arr.length;
  let h = 0;
  for (const v of counts.values()) {
    const p = v / n;
    h -= p * Math.log2(p);
  }
  return h; // 0 = fully consistent, higher = more scattered
}

function mechName(r) {
  return r.mechanism === "OTHER" && r.mechanismOther ? `OTHER:${r.mechanismOther.trim().toLowerCase()}` : r.mechanism;
}

function snippet(r, dilemma) {
  const text = (r.thirdPosition || "").trim();
  return {
    dilemmaId: r.dilemmaId,
    domain: dilemma ? dilemma.domain : "?",
    mechanism: mechName(r),
    snippet: text.length > 140 ? text.slice(0, 137) + "…" : text,
    timestamp: r.timestamp,
  };
}

function confidenceLabel(evidenceCount, consistency) {
  // consistency: 0..1, fraction agreeing with the pattern
  if (evidenceCount >= 8 && consistency >= 0.75) return "high";
  if (evidenceCount >= 4 && consistency >= 0.6) return "moderate";
  return "low";
}

function computeDiscoveries(responses) {
  const insights = [];
  const enriched = responses.map((r) => ({ r, d: dilemmaById(r.dilemmaId) })).filter((x) => x.d);

  if (enriched.length < 5) return insights; // below first milestone, nothing to report yet

  // ---- 1. Recurring mechanism (a solution structure reinvented across domains) ----
  const byMech = new Map();
  for (const { r, d } of enriched) {
    const key = mechName(r);
    if (!byMech.has(key)) byMech.set(key, []);
    byMech.get(key).push({ r, d });
  }
  for (const [mechKey, items] of byMech) {
    if (items.length < 3) continue;
    const domains = new Set(items.map((x) => x.d.domain));
    if (domains.size < 2) continue; // must recur across unrelated domains
    const label = mechKey.startsWith("OTHER:") ? mechKey.slice(6) : mechanismLabel(mechKey);
    const consistency = items.length / enriched.length;
    insights.push({
      type: "OBSERVED_PATTERN",
      title: `A move you keep reinventing: ${label}`,
      observedPattern: `Across ${items.length} responses in ${domains.size} different domains, you resolved the tension by using "${label}" — ${items === items ? "" : ""}the same structural move recurring where the surface content differs completely.`,
      evidenceCount: items.length,
      domains: [...domains],
      counterexamples: enriched
        .filter((x) => x.d.family && items.some((it) => it.d.family === x.d.family) && mechName(x.r) !== mechKey)
        .slice(0, 3)
        .map((x) => snippet(x.r, x.d)),
      confidence: confidenceLabel(items.length, consistency),
      exampleResponses: items.slice(0, 4).map((x) => snippet(x.r, x.d)),
      alternativeExplanation:
        "This mechanism may simply be the one you find easiest to articulate in writing, rather than the one that best fits your actual reasoning — a labeling artifact, not a reasoning pattern.",
      disconfirm:
        `A run of new dilemmas across these same domains where you consistently choose a different mechanism would weaken this.`,
    });
  }

  // ---- 2. Domain split (a rule used differently depending on context) ----
  const byDomain = new Map();
  for (const { r, d } of enriched) {
    if (!byDomain.has(d.domain)) byDomain.set(d.domain, []);
    byDomain.get(d.domain).push(r);
  }
  const domainDominant = [];
  for (const [domain, list] of byDomain) {
    if (list.length < 3) continue;
    const m = mode(list.map(mechName));
    domainDominant.push({ domain, list, dominant: m.value, share: m.count / m.total });
  }
  for (let i = 0; i < domainDominant.length; i++) {
    for (let j = i + 1; j < domainDominant.length; j++) {
      const A = domainDominant[i],
        B = domainDominant[j];
      if (A.dominant === B.dominant) continue;
      if (A.share < 0.5 || B.share < 0.5) continue;
      const labelA = A.dominant.startsWith("OTHER:") ? A.dominant.slice(6) : mechanismLabel(A.dominant);
      const labelB = B.dominant.startsWith("OTHER:") ? B.dominant.slice(6) : mechanismLabel(B.dominant);
      insights.push({
        type: "DOMAIN_SPLIT",
        title: `${A.domain} vs ${B.domain}: different default moves`,
        observedPattern: `In ${A.domain} (${A.list.length} responses) your most common move is "${labelA}". In ${B.domain} (${B.list.length} responses) it's "${labelB}" instead. There is no single rule that covers both domains equally.`,
        evidenceCount: A.list.length + B.list.length,
        domains: [A.domain, B.domain],
        counterexamples: [...A.list, ...B.list]
          .filter((r) => mechName(r) !== A.dominant && mechName(r) !== B.dominant)
          .slice(0, 3)
          .map((r) => snippet(r, dilemmaById(r.dilemmaId))),
        confidence: confidenceLabel(A.list.length + B.list.length, Math.min(A.share, B.share)),
        exampleResponses: [
          ...A.list.slice(0, 2).map((r) => snippet(r, dilemmaById(r.dilemmaId))),
          ...B.list.slice(0, 2).map((r) => snippet(r, dilemmaById(r.dilemmaId))),
        ],
        alternativeExplanation:
          "The dilemmas sampled so far in each domain may not be representative of the domain as a whole — a small, skewed sample can look like a domain effect.",
        disconfirm: `Domain overlap in future mechanism choices — e.g. using "${labelB}" in ${A.domain} — would weaken this split.`,
      });
    }
  }

  // ---- 3. Structural twin comparisons ----
  const byTwin = new Map();
  for (const { r, d } of enriched) {
    if (!d.twinGroup) continue;
    if (!byTwin.has(d.twinGroup)) byTwin.set(d.twinGroup, []);
    byTwin.get(d.twinGroup).push({ r, d });
  }
  for (const [twinGroup, items] of byTwin) {
    const distinctDilemmas = new Set(items.map((x) => x.d.id));
    if (distinctDilemmas.size < 2) continue;
    const mechs = items.map((x) => mechName(x.r));
    const allSame = mechs.every((m) => m === mechs[0]);
    const domains = [...new Set(items.map((x) => x.d.domain))];
    if (allSame) {
      insights.push({
        type: "OBSERVED_PATTERN",
        title: `Structural twins, same answer: ${twinGroup.replace("TWIN_", "").replaceAll("_", " ").toLowerCase()}`,
        observedPattern: `These dilemmas look unrelated on the surface (${domains.join(", ")}) but share an underlying tension. You resolved them with the same move — "${mechanismLabel(mechs[0]) || mechs[0]}" — each time.`,
        evidenceCount: items.length,
        domains,
        counterexamples: [],
        confidence: confidenceLabel(items.length, 1),
        exampleResponses: items.map((x) => snippet(x.r, x.d)),
        alternativeExplanation: "Coincidence: with a small mechanism vocabulary, two unrelated answers can land on the same label by chance.",
        disconfirm: "A future twin in this family resolved with a different mechanism would break the pattern.",
      });
    } else {
      insights.push({
        type: "CONTRADICTION",
        title: `Structural twins, different answers: ${twinGroup.replace("TWIN_", "").replaceAll("_", " ").toLowerCase()}`,
        observedPattern: `These dilemmas share an underlying tension but appeared in different domains (${domains.join(", ")}). You resolved them differently — ${items.map((x) => `${x.d.domain}: "${mechanismLabel(mechName(x.r)) || mechName(x.r)}"`).join("; ")}. This suggests domain changes how you resolve this exact tension, not just what tension you're facing.`,
        evidenceCount: items.length,
        domains,
        counterexamples: [],
        confidence: confidenceLabel(items.length, 0.5),
        exampleResponses: items.map((x) => snippet(x.r, x.d)),
        alternativeExplanation: "The twin pairing itself may be too loose — the two dilemmas might differ in a way that matters, not just in surface domain.",
        disconfirm: "More twins in this family resolved consistently across domains would weaken this as a real domain effect.",
      });
    }
  }

  // ---- 4. Evolution over time (first half vs second half) ----
  if (enriched.length >= 12) {
    const mid = Math.floor(enriched.length / 2);
    const first = enriched.slice(0, mid);
    const second = enriched.slice(mid);
    const firstMode = mode(first.map((x) => mechName(x.r)));
    const secondMode = mode(second.map((x) => mechName(x.r)));
    const firstShare = firstMode.count / firstMode.total;
    const secondShareOfSame = second.filter((x) => mechName(x.r) === firstMode.value).length / second.length;
    if (firstShare >= 0.4 && secondShareOfSame <= firstShare - 0.25) {
      const label = firstMode.value.startsWith("OTHER:") ? firstMode.value.slice(6) : mechanismLabel(firstMode.value);
      insights.push({
        type: "EVOLUTION",
        title: `A shifting reliance on "${label}"`,
        observedPattern: `In your first ${first.length} responses, "${label}" was your most common move (${Math.round(firstShare * 100)}% of responses). In your most recent ${second.length}, it accounts for only ${Math.round(secondShareOfSame * 100)}%. Your most recent dominant move is now "${mechanismLabel(secondMode.value) || secondMode.value}".`,
        evidenceCount: enriched.length,
        domains: [...new Set(enriched.map((x) => x.d.domain))],
        counterexamples: [],
        confidence: confidenceLabel(enriched.length, Math.abs(firstShare - secondShareOfSame)),
        exampleResponses: [...first.slice(-2), ...second.slice(0, 2)].map((x) => snippet(x.r, x.d)),
        alternativeExplanation: "The dilemma bank's domain mix may simply have changed over this window, rather than your reasoning changing.",
        disconfirm: "A return to the earlier mechanism at similar rates in upcoming responses would weaken this as real change.",
      });
    }
  }

  // ---- 5. Outlier: a response wildly unlike the person's usual pattern ----
  const globalMode = mode(enriched.map((x) => mechName(x.r)));
  if (globalMode.count / globalMode.total >= 0.5 && enriched.length >= 8) {
    const rare = enriched.filter((x) => globalMode.counts.get(mechName(x.r)) === 1);
    for (const x of rare.slice(0, 2)) {
      insights.push({
        type: "OUTLIER",
        title: `An answer unlike your usual pattern`,
        observedPattern: `Your dominant move overall is "${mechanismLabel(globalMode.value) || globalMode.value}" (${globalMode.count}/${globalMode.total} responses). One response — on "${x.d.domain}" — used a mechanism ("${mechanismLabel(mechName(x.r)) || mechName(x.r)}") that appears nowhere else in your log.`,
        evidenceCount: 1,
        domains: [x.d.domain],
        counterexamples: [],
        confidence: "low",
        exampleResponses: [snippet(x.r, x.d)],
        alternativeExplanation: "A single unusual answer can just be noise — fatigue, mood, or an unusually worded dilemma — not a meaningful outlier.",
        disconfirm: "This stays a low-confidence, single-data-point note until a similar case recurs; if it never recurs, treat it as noise.",
      });
    }
  }

  // ---- 6. Open mystery: a tension you keep facing with no stable resolution ----
  const byFamily = new Map();
  for (const { r, d } of enriched) {
    if (!d.family) continue;
    if (!byFamily.has(d.family)) byFamily.set(d.family, []);
    byFamily.get(d.family).push({ r, d });
  }
  for (const [family, items] of byFamily) {
    if (items.length < 3) continue;
    const h = entropy(items.map((x) => mechName(x.r)));
    const maxH = Math.log2(items.length);
    if (maxH > 0 && h / maxH >= 0.75) {
      insights.push({
        type: "OPEN_MYSTERY",
        title: `An unresolved tension: ${family.replaceAll("_", " ").toLowerCase()}`,
        observedPattern: `You've faced this tension ${items.length} times across ${new Set(items.map((x) => x.d.domain)).size} domain(s) and used a different mechanism nearly every time. There is no single rule here yet — this looks like a genuinely open question for you rather than an unnoticed pattern.`,
        evidenceCount: items.length,
        domains: [...new Set(items.map((x) => x.d.domain))],
        counterexamples: [],
        confidence: confidenceLabel(items.length, 1 - h / maxH),
        exampleResponses: items.map((x) => snippet(x.r, x.d)),
        alternativeExplanation: "The dilemmas grouped under this family may actually be too different from each other to expect one consistent resolution.",
        disconfirm: "Two or more future responses in this family converging on the same mechanism would resolve this mystery into a pattern.",
      });
    }
  }

  return insights;
}

async function checkMilestonesAndMaybeUnlock() {
  const responses = await DB.getAllResponses();
  const n = responses.length;
  const schedule = nextMilestoneSchedule(n);
  const passed = schedule.filter((m) => m <= n);
  const lastMilestone = (await DB.getMeta("lastMilestone", 0)) || 0;
  const newlyPassed = passed.filter((m) => m > lastMilestone);
  if (newlyPassed.length === 0) return null;

  const discoveries = computeDiscoveries(responses);
  const withIds = discoveries.map((d, i) => ({
    id: `disc_${Date.now()}_${i}`,
    computedAt: Date.now(),
    atResponseCount: n,
    ...d,
  }));
  await DB.saveDiscoveries(withIds);
  await DB.putMeta("lastMilestone", Math.max(...passed));
  return { milestone: Math.max(...newlyPassed), count: n, discoveries: withIds };
}
