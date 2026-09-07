/*
  Optional, opt-in AI layer (Groq).
  ---------------------------------
  Everything else in this app works with zero network calls. This file is
  the ONLY place that ever talks to the internet, and it only runs if the
  user has explicitly enabled it and pasted in their own free Groq API key
  (groqcloud.com — not xAI's Grok). The key and the on/off switch live in
  localStorage, never in IndexedDB, and are never included in the JSON
  export.

  Its one job: invent fresh Pattern Check triads on demand, so the puzzles
  aren't limited to the ~18 hand-written ones in js/oddOneOut.js. When this
  is off (or a request fails), js/patternCheck.js falls back to that bank
  automatically — the app never depends on the network to function.
*/

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
// Groq's model catalog shifts over time (models get renamed, gated, or
// retired) independent of this app's release cadence. If a request 404s
// ("does not exist or you do not have access"), that means Groq itself has
// changed something on their end for this key/account — check
// GET /openai/v1/models with your key (surfaced in the settings UI) for
// what's actually available right now, not any hardcoded default here.
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
// Tried in order, automatically, whenever the configured/default model
// fails with a model-access problem (404) or a rate limit (429) — so one
// model being briefly unavailable doesn't just fail the whole request.
// qwen/qwen3.6-27b is a Groq *preview* model (can be pulled at short
// notice per their own docs), which is exactly why it's listed last, not
// first — it's a safety net, not a default.
const GROQ_FALLBACK_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

const GROQ_SETTINGS_KEY = "thirdPosition.groqSettings";

function getGroqSettings() {
  try {
    const raw = localStorage.getItem(GROQ_SETTINGS_KEY);
    if (!raw) return { enabled: false, apiKey: "", model: GROQ_DEFAULT_MODEL };
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      apiKey: parsed.apiKey || "",
      model: parsed.model || GROQ_DEFAULT_MODEL,
    };
  } catch {
    return { enabled: false, apiKey: "", model: GROQ_DEFAULT_MODEL };
  }
}

function saveGroqSettings(settings) {
  try {
    localStorage.setItem(GROQ_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode, quota) — AI features just stay off.
  }
}

function groqIsActive() {
  const s = getGroqSettings();
  return s.enabled && s.apiKey.trim().length > 0;
}

// openai/gpt-oss-* and qwen/qwen3.6-* are reasoning models: they spend part
// of the completion budget "thinking" before emitting a final answer.
// max_completion_tokens is the current field name (max_tokens is
// deprecated); reasoning_effort/reasoning_format keep that thinking cheap
// and out of the visible output. qwen3.6-27b only accepts "none"/"default"
// for reasoning_effort (the low/medium/high scale is qwen3.8-only), so
// that field is deliberately left unset for it.
const GPT_OSS_PATTERN = /^openai\/gpt-oss-/i;
const QWEN_PATTERN = /^qwen\//i;

function stripReasoningArtifacts(text) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return cleaned.length > 2000 ? cleaned.slice(0, 2000).trim() + "…" : cleaned;
}

// Single attempt against one specific model. Never throws — every failure
// path returns { ok: false, status, error } so the fallback chain above it
// can decide whether trying the next model is worth it.
async function callGroqOnce(messages, { model, apiKey, maxTokens = 500, temperature = 0.9, json = false }) {
  const body = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };
  if (GPT_OSS_PATTERN.test(model)) {
    body.reasoning_effort = "low";
    if (!json) body.reasoning_format = "hidden"; // JSON mode forces "parsed" automatically on Groq's side
  } else if (QWEN_PATTERN.test(model)) {
    if (!json) body.reasoning_format = "hidden";
  }

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const status = res.status;
      let detail = "";
      try {
        const errBody = await res.json();
        detail = errBody?.error?.message || "";
      } catch {
        /* ignore */
      }
      if (status === 401) return { ok: false, status, error: "Groq rejected the API key (401). Check it in Data / Export." };
      if (status === 429) return { ok: false, status, error: `Rate limit on ${model} (429) — this stays within the free tier's caps, so it should recover shortly.` };
      if (status === 404) return { ok: false, status, error: `Model "${model}" is unavailable to this key (404). ${detail}`.trim() };
      return { ok: false, status, error: `Groq request failed on ${model} (${status}). ${detail}`.trim() };
    }
    const data = await res.json();
    const choice = data?.choices?.[0];
    const rawText = choice?.message?.content || choice?.message?.reasoning || "";
    const text = stripReasoningArtifacts(rawText);
    if (!text) {
      const reason = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : "";
      return {
        ok: false,
        status: res.status,
        error: `Groq returned an empty response from ${model}${reason}. If this keeps happening, try raising the token budget or a different model.`,
      };
    }
    return { ok: true, text, modelUsed: model };
  } catch (err) {
    return { ok: false, status: null, error: `Network error reaching Groq: ${err.message}` };
  }
}

// Tries the configured model first, then falls through GROQ_FALLBACK_MODELS
// in order on a model-access problem (404) or rate limit (429) — anything
// else (bad key, network failure) is very unlikely to be fixed by switching
// models, so it stops there and reports immediately instead of burning
// through every fallback for no reason.
async function callGroq(messages, { model, maxTokens = 500, temperature = 0.9, json = false } = {}) {
  const settings = getGroqSettings();
  const apiKey = settings.apiKey.trim();
  if (!settings.enabled || !apiKey) return { ok: false, error: "AI assist is not enabled." };

  const primary = model || settings.model || GROQ_DEFAULT_MODEL;
  const chain = [primary, ...GROQ_FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastResult = null;
  for (const candidate of chain) {
    const result = await callGroqOnce(messages, { model: candidate, apiKey, maxTokens, temperature, json });
    if (result.ok) return result;
    lastResult = result;
    if (result.status !== 404 && result.status !== 429) break; // not a model problem — retrying elsewhere won't help
  }
  return lastResult;
}

async function listAvailableGroqModels(apiKeyOverride) {
  const apiKey = (apiKeyOverride || getGroqSettings().apiKey || "").trim();
  if (!apiKey) return { ok: false, error: "Enter an API key first." };
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, error: `Groq rejected the request (${res.status}). Check the key.` };
    const data = await res.json();
    const ids = (data?.data || []).map((m) => m.id).sort();
    return { ok: true, ids };
  } catch (err) {
    return { ok: false, error: `Network error reaching Groq: ${err.message}` };
  }
}

const AI_TRIAD_SYSTEM_PROMPT =
  "You invent puzzles for a pattern-recognition exercise called Pattern Check. Produce exactly one NEW triad: " +
  "three short (1-2 sentence) statements about everyday judgment, ethics, relationships, work, creativity, " +
  "trust, memory, or any domain you choose. Two of the three statements must share a specific, real, " +
  "structural reasoning pattern — not just a similar topic or wording. For example: both judge by outcome " +
  "rather than intent; both treat an exception as corrosive to a rule; both extend trust by default; both " +
  "weigh present character over past history; both keep observation separate from interpretation. Invent a " +
  "fresh angle each time — avoid obvious, cliché oppositions. The third statement should sound superficially " +
  "similar in topic or tone but actually follow a different underlying logic; the difference must be a real " +
  "reasoning distinction, not just a negation or a change in tone. Respond ONLY with a JSON object with " +
  'exactly these keys: "stances" (an array of exactly 3 strings, in any order), "oddIndex" (the 0-based index ' +
  'in that array of the statement that does NOT share the logic), "sharedLogic" (a short 4-8 word label for ' +
  'what the other two share), "explanation" (one sentence on why the other two share it and this one doesn\'t). ' +
  "No other text, no markdown, just the JSON object.";

function isValidAITriad(parsed) {
  return (
    parsed &&
    Array.isArray(parsed.stances) &&
    parsed.stances.length === 3 &&
    parsed.stances.every((s) => typeof s === "string" && s.trim().length > 0) &&
    Number.isInteger(parsed.oddIndex) &&
    parsed.oddIndex >= 0 &&
    parsed.oddIndex <= 2 &&
    typeof parsed.sharedLogic === "string" &&
    parsed.sharedLogic.trim().length > 0 &&
    typeof parsed.explanation === "string" &&
    parsed.explanation.trim().length > 0
  );
}

// Returns a validated triad shape ({stances, oddIndex, sharedLogic,
// explanation, modelUsed}) or { error } — never throws, never returns a
// malformed triad for the caller to render.
async function generateAITriad(recentLogics = []) {
  if (!groqIsActive()) return { error: "AI assist is not enabled." };

  const avoidLine = recentLogics.length
    ? `Avoid repeating these recently-used shared-logic angles: ${recentLogics.join("; ")}.`
    : "";

  const messages = [
    { role: "system", content: AI_TRIAD_SYSTEM_PROMPT },
    { role: "user", content: `Generate one triad now. ${avoidLine}`.trim() },
  ];

  const result = await callGroq(messages, { maxTokens: 600, temperature: 0.95, json: true });
  if (!result.ok) return { error: result.error };

  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return { error: "Groq's response wasn't valid JSON — falling back to the offline bank." };
  }
  if (!isValidAITriad(parsed)) {
    return { error: "Groq's response was missing required fields — falling back to the offline bank." };
  }

  return {
    stances: parsed.stances.map((s) => s.trim()),
    oddIndex: parsed.oddIndex,
    sharedLogic: parsed.sharedLogic.trim(),
    explanation: parsed.explanation.trim(),
    modelUsed: result.modelUsed,
  };
}
