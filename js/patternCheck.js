/*
  Pattern Check — triad selection. This is the entire app now: three
  stances, two share a real logic, one doesn't. AI generation (Groq) is
  preferred when enabled — richer, unlimited variety — and the app falls
  back to the offline authored bank (js/oddOneOut.js) whenever AI is off,
  fails, or returns something malformed. The app never depends on the
  network to function.
*/

const RECENT_TRIAD_KEYS_TO_TRACK = 8;

// Returns { source: "ai"|"authored", stances, oddIndex, sharedLogic,
// explanation, modelUsed? }. Always succeeds — falls back to the authored
// bank on any AI failure, so the caller never has to handle "no triad."
async function pickTriad(recentKeys, recentLogics) {
  if (groqIsActive()) {
    const ai = await generateAITriad(recentLogics);
    if (!ai.error) {
      return {
        source: "ai",
        triadKey: `ai:${Date.now()}`,
        stances: ai.stances,
        oddIndex: ai.oddIndex,
        sharedLogic: ai.sharedLogic,
        explanation: ai.explanation,
        modelUsed: ai.modelUsed,
        aiError: null,
      };
    }
    // Fall through to the offline bank, but remember why so the UI can
    // say so instead of silently pretending AI was never asked.
    return { ...pickAuthoredTriad(recentKeys), aiError: ai.error };
  }
  return { ...pickAuthoredTriad(recentKeys), aiError: null };
}

function pickAuthoredTriad(recentKeys) {
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
    modelUsed: null,
  };
}
