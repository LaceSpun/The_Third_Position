/*
  Pattern Check — selection and light scoring for the odd-one-out mode.
  Hybrid content: prefers building triads from the user's own archive once
  there's enough of it, falls back to (and still occasionally mixes in) the
  authored bank in js/oddOneOut.js. Kept entirely separate from the
  deterministic discovery engine in discovery.js — this is a different
  activity (diagnosis, not synthesis) with its own light scoring.
*/

const PATTERN_CHECK_MIN_FOR_MODIFIER = 10;
const RECENT_TRIAD_KEYS_TO_TRACK = 5;
const SELF_SOURCED_PREFERENCE = 0.7; // when eligible, prefer the user's own archive this often

// Groups responses by self-tagged mechanism (reusing mechName() from
// discovery.js) and, if some group has >=2 entries and at least one response
// exists outside it, builds a triad from real past third-position text —
// stripped of domain/positions/mechanism label, genuinely blind. Returns
// null if the archive isn't rich enough yet.
function buildSelfSourcedTriad(responses) {
  const byMech = new Map();
  for (const r of responses) {
    const key = mechName(r);
    if (!byMech.has(key)) byMech.set(key, []);
    byMech.get(key).push(r);
  }

  const eligibleGroups = [...byMech.entries()].filter(([, list]) => list.length >= 2);
  if (eligibleGroups.length === 0) return null;

  const [sharedKey, sharedList] = eligibleGroups[Math.floor(Math.random() * eligibleGroups.length)];
  const outside = responses.filter((r) => mechName(r) !== sharedKey);
  if (outside.length === 0) return null;

  const shuffledShared = [...sharedList].sort(() => Math.random() - 0.5).slice(0, 2);
  const oddResponse = outside[Math.floor(Math.random() * outside.length)];

  const label = sharedKey.startsWith("OTHER:") ? sharedKey.slice(6) : mechanismLabel(sharedKey);
  const triadKey = "self:" + [...shuffledShared.map((r) => r.id), oddResponse.id].sort().join(",");

  return {
    source: "self",
    triadKey,
    stances: [shuffledShared[0].thirdPosition, shuffledShared[1].thirdPosition, oddResponse.thirdPosition],
    oddIndex: 2,
    sharedLogic: `you tagged both of these "${label}"`,
    explanation: `These are two of your own past responses, both self-tagged "${label}" when you wrote them. The third was tagged differently.`,
    relatedDilemmaId: null,
  };
}

function pickTriad(responses, recentKeys) {
  const selfTriad = buildSelfSourcedTriad(responses);
  const useSelf = selfTriad && Math.random() < SELF_SOURCED_PREFERENCE;

  if (useSelf) return selfTriad;

  const pool = ODD_ONE_OUT.filter((t) => !recentKeys.includes(t.id));
  const candidates = pool.length > 0 ? pool : ODD_ONE_OUT;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    source: "authored",
    triadKey: picked.id,
    stances: picked.stances,
    oddIndex: picked.oddIndex,
    sharedLogic: picked.sharedLogic,
    explanation: picked.explanation,
    relatedDilemmaId: picked.relatedDilemmaId || null,
  };
}

// Cautious, evidence-gated read on the user's own pattern-spotting accuracy —
// same hedging discipline as discovery.js. Returns null below the minimum
// evidence threshold, or when nothing meaningfully stands out.
function computeAccuracyModifier(checks) {
  if (checks.length < PATTERN_CHECK_MIN_FOR_MODIFIER) return null;

  const correct = checks.filter((c) => c.correct).length;
  const overallRate = correct / checks.length;

  const byLogic = new Map();
  for (const c of checks) {
    if (!byLogic.has(c.sharedLogic)) byLogic.set(c.sharedLogic, []);
    byLogic.get(c.sharedLogic).push(c);
  }

  let weakest = null;
  for (const [logic, list] of byLogic) {
    if (list.length < 3) continue;
    const rate = list.filter((c) => c.correct).length / list.length;
    if (rate <= overallRate - 0.25 && (!weakest || rate < weakest.rate)) {
      weakest = { logic, rate, count: list.length };
    }
  }

  const overallPct = Math.round(overallRate * 100);
  if (weakest) {
    const weakestPct = Math.round(weakest.rate * 100);
    return `Across ${checks.length} puzzles, you've spotted the odd one out correctly ${overallPct}% of the time overall — but only ${weakestPct}% (${weakest.count} attempts) when the shared logic was "${weakest.logic}". That's a small sample; a few more like it would confirm whether it's a real blind spot.`;
  }
  return `Across ${checks.length} puzzles, you've spotted the odd one out correctly ${overallPct}% of the time — no particular category stands out as weaker yet.`;
}
