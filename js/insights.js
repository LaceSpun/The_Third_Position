/*
  Longitudinal Discovery Engine (v2) — Pattern Check edition
  -----------------------------------------------------------
  Same discipline as the app has always had: never infer anything from a
  single attempt, always state the evidence count, always give a confidence
  label and an alternative explanation, never claim certainty. What's being
  studied changed — this is no longer about how you resolve dilemmas, it's
  about how you spot (or miss) a shared reasoning pattern under time
  pressure, and whether that ability varies by category, by triad source,
  or over time.
*/

const MILESTONES = [5, 12, 25, 50, 100];
const MIN_CHECKS_FOR_DISCOVERY = 5;
const FALLBACK_CHECK_DAYS = 4;

function nextMilestoneSchedule(n) {
  const arr = [...MILESTONES];
  let m = 150;
  while (m <= n + 50) {
    arr.push(m);
    m += 50;
  }
  return arr;
}

function accuracyOf(list) {
  return list.filter((c) => c.correct).length / list.length;
}

function confidenceLabel(evidenceCount, consistency) {
  if (evidenceCount >= 12 && consistency >= 0.75) return "high";
  if (evidenceCount >= 5 && consistency >= 0.6) return "moderate";
  return "low";
}

function snippetOf(check) {
  const chosenText = check.stances[check.oddIndex] || "";
  return chosenText.length > 120 ? chosenText.slice(0, 117) + "…" : chosenText;
}

function computeInsights(checks) {
  const insights = [];
  if (checks.length < MIN_CHECKS_FOR_DISCOVERY) return insights;

  const overallRate = accuracyOf(checks);
  const overallPct = Math.round(overallRate * 100);

  insights.push({
    type: "OBSERVED_PATTERN",
    title: "Overall pattern-spotting accuracy",
    observedPattern: `Across ${checks.length} Pattern Check attempts, you've correctly connected the matching pair ${overallPct}% of the time.`,
    evidenceCount: checks.length,
    domains: [],
    confidence: confidenceLabel(checks.length, 1),
    examples: checks.slice(-3).map((c) => `"${snippetOf(c)}" — ${c.correct ? "spotted correctly" : "missed"}`),
    alternativeExplanation: "Accuracy on any given day is affected by attention and time of day as much as by any stable ability — a single overall rate can't separate the two.",
    disconfirm: "A sharp, sustained change in this rate over the next batch of attempts would suggest something other than a stable baseline.",
  });

  // ---- category (sharedLogic) accuracy — both weak and strong spots ----
  const byLogic = new Map();
  for (const c of checks) {
    if (!byLogic.has(c.sharedLogic)) byLogic.set(c.sharedLogic, []);
    byLogic.get(c.sharedLogic).push(c);
  }
  let weakest = null;
  let strongest = null;
  for (const [logic, list] of byLogic) {
    if (list.length < 3) continue;
    const rate = accuracyOf(list);
    if (rate <= overallRate - 0.25 && (!weakest || rate < weakest.rate)) weakest = { logic, rate, list };
    if (rate >= Math.min(1, overallRate + 0.25) && (!strongest || rate > strongest.rate)) strongest = { logic, rate, list };
  }
  if (weakest) {
    insights.push({
      type: "DOMAIN_SPLIT",
      title: `A category you tend to miss: "${weakest.logic}"`,
      observedPattern: `Your overall accuracy is ${overallPct}%, but on the ${weakest.list.length} triads whose shared logic was "${weakest.logic}", you got it right only ${Math.round(weakest.rate * 100)}% of the time.`,
      evidenceCount: weakest.list.length,
      domains: [weakest.logic],
      confidence: confidenceLabel(weakest.list.length, overallRate - weakest.rate),
      examples: weakest.list.slice(0, 3).map((c) => `"${snippetOf(c)}" — ${c.correct ? "correct" : "missed"}`),
      alternativeExplanation: "A small sample of one category can look like a blind spot by chance — three or four unlucky guesses isn't yet a pattern.",
      disconfirm: "A few more attempts in this category landing closer to your overall rate would weaken this.",
    });
  }
  if (strongest) {
    insights.push({
      type: "OBSERVED_PATTERN",
      title: `A category you consistently spot: "${strongest.logic}"`,
      observedPattern: `On the ${strongest.list.length} triads whose shared logic was "${strongest.logic}", you were correct ${Math.round(strongest.rate * 100)}% of the time — noticeably above your ${overallPct}% overall rate.`,
      evidenceCount: strongest.list.length,
      domains: [strongest.logic],
      confidence: confidenceLabel(strongest.list.length, strongest.rate - overallRate),
      examples: strongest.list.slice(0, 3).map((c) => `"${snippetOf(c)}" — ${c.correct ? "correct" : "missed"}`),
      alternativeExplanation: "This category may simply have appeared more often when you were fresh or unhurried — not a real strength in the reasoning itself.",
      disconfirm: "A drop toward your overall rate on future attempts in this category would weaken this.",
    });
  }

  // ---- evolution: first half vs second half ----
  if (checks.length >= 12) {
    const mid = Math.floor(checks.length / 2);
    const first = checks.slice(0, mid);
    const second = checks.slice(mid);
    const firstRate = accuracyOf(first);
    const secondRate = accuracyOf(second);
    if (Math.abs(secondRate - firstRate) >= 0.2) {
      const direction = secondRate > firstRate ? "improved" : "declined";
      insights.push({
        type: "EVOLUTION",
        title: `Accuracy has ${direction} over time`,
        observedPattern: `Your first ${first.length} attempts were ${Math.round(firstRate * 100)}% correct; your most recent ${second.length} are ${Math.round(secondRate * 100)}% correct.`,
        evidenceCount: checks.length,
        domains: [],
        confidence: confidenceLabel(checks.length, Math.abs(secondRate - firstRate)),
        examples: [...first.slice(-1), ...second.slice(0, 2)].map((c) => `"${snippetOf(c)}" — ${c.correct ? "correct" : "missed"}`),
        alternativeExplanation: "The mix of triad sources or categories may simply have shifted over this window, rather than your underlying accuracy changing.",
        disconfirm: "A swing back toward the earlier rate in upcoming attempts would weaken this as real change.",
      });
    }
  }

  // ---- AI-generated vs authored-bank triads ----
  const aiChecks = checks.filter((c) => c.source === "ai");
  const authoredChecks = checks.filter((c) => c.source === "authored");
  if (aiChecks.length >= 5 && authoredChecks.length >= 5) {
    const aiRate = accuracyOf(aiChecks);
    const authRate = accuracyOf(authoredChecks);
    if (Math.abs(aiRate - authRate) >= 0.2) {
      const harder = aiRate < authRate ? "AI-generated" : "hand-written";
      insights.push({
        type: "DOMAIN_SPLIT",
        title: `${harder} triads seem harder for you`,
        observedPattern: `You're ${Math.round(aiRate * 100)}% accurate on ${aiChecks.length} AI-generated triads, versus ${Math.round(authRate * 100)}% on ${authoredChecks.length} from the hand-written bank.`,
        evidenceCount: aiChecks.length + authoredChecks.length,
        domains: ["ai", "authored"],
        confidence: confidenceLabel(aiChecks.length + authoredChecks.length, Math.abs(aiRate - authRate)),
        examples: [],
        alternativeExplanation: "AI-generated and hand-written triads may simply differ in average difficulty or subtlety, independent of anything about how you reason.",
        disconfirm: "The two rates converging as more attempts accumulate would weaken this as a real difference.",
      });
    }
  }

  // ---- current streak ----
  let streak = 0;
  let streakCorrect = null;
  for (let i = checks.length - 1; i >= 0; i--) {
    if (streakCorrect === null) {
      streakCorrect = checks[i].correct;
      streak = 1;
    } else if (checks[i].correct === streakCorrect) {
      streak++;
    } else {
      break;
    }
  }
  if (streak >= 5) {
    insights.push({
      type: "OUTLIER",
      title: `A current streak: ${streak} in a row ${streakCorrect ? "correct" : "missed"}`,
      observedPattern: `Your last ${streak} attempts were all ${streakCorrect ? "correct" : "incorrect"}.`,
      evidenceCount: streak,
      domains: [],
      confidence: "low",
      examples: checks.slice(-3).map((c) => `"${snippetOf(c)}" — ${c.correct ? "correct" : "missed"}`),
      alternativeExplanation: "Short streaks happen by chance even at a stable underlying accuracy — five or six in a row isn't statistically surprising on its own.",
      disconfirm: "The streak breaking on the next attempt is the default expectation, not a disconfirmation of anything.",
    });
  }

  return insights;
}

// Cheap, ungated "one step short" signals — recomputed live, never
// persisted, never claimed as confirmed.
function computeNearMisses(checks) {
  const near = [];
  const byLogic = new Map();
  for (const c of checks) {
    if (!byLogic.has(c.sharedLogic)) byLogic.set(c.sharedLogic, []);
    byLogic.get(c.sharedLogic).push(c);
  }
  for (const [logic, list] of byLogic) {
    if (list.length === 2) {
      const rate = accuracyOf(list);
      near.push({
        label: `"${logic}" — 2 of 3 seen`,
        detail: rate === 1 ? "Both correct so far. One more would start to look like real strength in this category." : rate === 0 ? "Both missed so far. One more would start to look like a real blind spot." : "Split so far — one more would tip this toward a pattern either way.",
      });
    }
  }
  return near;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function stableInsightId(insight) {
  return `disc__${insight.type}__${slug(insight.title)}`;
}

async function checkMilestonesAndMaybeUnlock() {
  const checks = await DB.getAllPatternChecks();
  const n = checks.length;
  if (n < MIN_CHECKS_FOR_DISCOVERY) return null;

  const now = Date.now();
  const lastCount = (await DB.getMeta("lastMilestoneCount", 0)) || 0;
  const lastCheckAt = (await DB.getMeta("lastDiscoveryCheckAt", 0)) || 0;

  const schedule = nextMilestoneSchedule(n);
  const countMilestoneHit = schedule.filter((m) => m > lastCount && m <= n).pop() || null;
  const daysSinceCheck = lastCheckAt ? (now - lastCheckAt) / (1000 * 60 * 60 * 24) : Infinity;
  const dueToTime = n > lastCount && daysSinceCheck >= FALLBACK_CHECK_DAYS;
  const firstEverCheck = lastCheckAt === 0;

  if (!countMilestoneHit && !dueToTime && !firstEverCheck) return null;

  const insights = computeInsights(checks);
  const previous = await DB.getAllDiscoveries();
  const prevSignature = new Map(previous.map((d) => [stableInsightId(d), d.evidenceCount]));

  const withIds = insights.map((d) => ({ id: stableInsightId(d), computedAt: now, atCheckCount: n, ...d }));
  await DB.saveDiscoveries(withIds);
  await DB.putMeta("lastMilestoneCount", Math.max(lastCount, ...schedule.filter((m) => m <= n), n));
  await DB.putMeta("lastDiscoveryCheckAt", now);

  const newOrGrown = withIds.filter((d) => !prevSignature.has(d.id) || prevSignature.get(d.id) < d.evidenceCount);
  if (newOrGrown.length === 0) return null;

  return { milestone: countMilestoneHit, count: n, timeBased: !countMilestoneHit, discoveries: newOrGrown };
}
