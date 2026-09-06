/*
  Optional, opt-in AI layer (Groq).
  ---------------------------------
  Everything else in this app works with zero network calls. This file is
  the ONLY place that ever talks to the internet, and it only runs if the
  user has explicitly enabled it and pasted in their own free Groq API key
  (groqcloud.com — not xAI's Grok). The key and the on/off switch live in
  localStorage, never in IndexedDB, and are never included in the JSON/CSV
  export.

  It does two things, both clearly separated from the deterministic
  discovery engine in discovery.js:

  1. MICRO-OBSERVATION — after you file a response, one short, concrete,
     non-diagnostic remark about that single response (a phrasing choice,
     a distinction drawn). Never personality language, never "you are X."
  2. SYNTHESIS — every SYNTHESIS_EVERY_N micro-observations, a short prose
     paragraph looking for a thread across the recent ones, with the same
     hedging discipline as the rest of the app (explicit disconfirmation,
     no invented threads when none is visible).

  Both are stored labeled as AI-generated and rendered separately from the
  evidence-gated discovery cards — informal commentary, not evidence.
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
const SYNTHESIS_EVERY_N = 8;

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
// of the completion budget "thinking" before emitting a final answer. Two
// things follow from that, both load-bearing for why the first version of
// this call kept coming back empty:
//   1. `max_tokens` is the deprecated field name; Groq's current API (like
//      OpenAI's) expects `max_completion_tokens`. Sending the old field name
//      risks it being ignored/misapplied on these newer models.
//   2. With no reasoning controls set, a small token budget can be entirely
//      consumed by internal reasoning before any visible answer is emitted,
//      leaving message.content empty — not a network or model-access
//      failure, just starved of room to finish thinking.
// Fixed by asking for low reasoning effort and a hidden reasoning channel
// (only the final answer comes back in content, never the chain-of-thought),
// giving a generous token budget on top of that, and stripping any <think>
// tags defensively in case a given model doesn't honor "hidden".
const GPT_OSS_PATTERN = /^openai\/gpt-oss-/i;
const QWEN_PATTERN = /^qwen\//i;

function stripReasoningArtifacts(text) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Safety cap: the requested outputs are always short (~25-80 words). The
  // message.reasoning fallback above, in particular, could in principle
  // return much more than that — this keeps a rare edge case from dumping
  // an unbounded wall of text into a UI built for one or two sentences.
  return cleaned.length > 600 ? cleaned.slice(0, 600).trim() + "…" : cleaned;
}

// Single attempt against one specific model. Never throws — every failure
// path returns { ok: false, status, error } so the fallback chain above it
// can decide whether trying the next model is worth it.
async function callGroqOnce(messages, { model, apiKey, maxTokens = 350, temperature = 0.4 }) {
  const body = {
    model,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
  };
  if (GPT_OSS_PATTERN.test(model)) {
    // gpt-oss 20b/120b accept low/medium/high; "low" is plenty for a
    // 25-word observation or an 80-word synthesis paragraph.
    body.reasoning_effort = "low";
    body.reasoning_format = "hidden";
  } else if (QWEN_PATTERN.test(model)) {
    // qwen3.6-27b only accepts "none"/"default" for reasoning_effort (the
    // low/medium/high scale is qwen3.8-only) — deliberately NOT setting
    // "low" here, since that would 400 on this model and this is our last
    // fallback with nowhere further to go.
    body.reasoning_format = "hidden";
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
async function callGroq(messages, { model, maxTokens = 350, temperature = 0.4 } = {}) {
  const settings = getGroqSettings();
  const apiKey = settings.apiKey.trim();
  if (!settings.enabled || !apiKey) return { ok: false, error: "AI assist is not enabled." };

  const primary = model || settings.model || GROQ_DEFAULT_MODEL;
  const chain = [primary, ...GROQ_FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastResult = null;
  for (const candidate of chain) {
    const result = await callGroqOnce(messages, { model: candidate, apiKey, maxTokens, temperature });
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

async function requestMicroObservation(dilemma, response) {
  if (!groqIsActive()) return null;

  const messages = [
    {
      role: "system",
      content:
        "You are a terse observational annotator for a personal reasoning journal called The Third Position. " +
        "You will see one dilemma (two opposing positions) and the author's own 'third position' resolving it. " +
        "Write exactly one short observation, at most 25 words, about a specific, concrete feature of HOW they " +
        "reasoned in this single response — a phrasing choice, a distinction they drew, a move they made. " +
        "Never diagnose personality. Never write 'you are' or trait labels. Never praise or evaluate quality. " +
        "Never speculate beyond this one response. If nothing specific stands out, respond exactly with: " +
        "'No distinct textual feature stood out here.' Output only the observation itself, nothing else.",
    },
    {
      role: "user",
      content:
        `POSITION A: ${dilemma.positionA}\n` +
        `POSITION B: ${dilemma.positionB}\n` +
        `THIRD POSITION: ${response.thirdPosition}\n` +
        `SELF-TAGGED MOVE: ${response.mechanism === "OTHER" ? response.mechanismOther : mechanismLabel(response.mechanism)}`,
    },
  ];

  // Generous relative to the ~25-word answer we actually want: reasoning
  // models spend part of this budget thinking even with reasoning_effort
  // "low" and reasoning_format "hidden", so a tight limit here is exactly
  // what produced empty responses before.
  const result = await callGroq(messages, { maxTokens: 400, temperature: 0.5 });
  if (!result.ok) return { error: result.error };

  const note = {
    id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    responseId: response.id,
    dilemmaId: dilemma.id,
    text: result.text,
    modelUsed: result.modelUsed,
    createdAt: Date.now(),
  };
  await DB.addAINote(note);
  return note;
}

async function maybeSynthesize() {
  if (!groqIsActive()) return null;

  const notes = await DB.getAllAINotes();
  const usableNotes = notes.filter((n) => !/^no distinct textual feature/i.test(n.text));
  if (usableNotes.length === 0) return null;

  const lastSynthesisAt = (await DB.getMeta("lastAISynthesisNoteCount", 0)) || 0;
  if (usableNotes.length - lastSynthesisAt < SYNTHESIS_EVERY_N) return null;

  const recent = usableNotes.slice(-SYNTHESIS_EVERY_N * 2); // a little more context than the strict threshold
  const responses = await DB.getAllResponses();
  const enriched = responses.map((r) => ({ r, d: dilemmaById(r.dilemmaId) })).filter((x) => x.d);
  const mechCounts = new Map();
  const domainCounts = new Map();
  for (const { r, d } of enriched) {
    const label = r.mechanism === "OTHER" ? r.mechanismOther : mechanismLabel(r.mechanism);
    mechCounts.set(label, (mechCounts.get(label) || 0) + 1);
    domainCounts.set(d.domain, (domainCounts.get(d.domain) || 0) + 1);
  }
  const topMechs = [...mechCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(", ");
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(", ");

  const messages = [
    {
      role: "system",
      content:
        "You write brief, hedged synthesis notes for a personal reasoning journal. You will be given a list of " +
        "short observations made about someone's individual responses over time, plus their most common structural " +
        "moves and domains. Write one short paragraph, at most 80 words, noting any thread connecting these " +
        "observations, if one is visible. Use cautious language ('seems to', 'may', 'across these notes'). " +
        "Explicitly name one thing that would disconfirm the thread you noticed, in the same paragraph or a short " +
        "second sentence. If no thread is visible, say so plainly instead of inventing one. Never use " +
        "personality-trait labels or diagnostic language ('you are an X person').",
    },
    {
      role: "user",
      content:
        `RECENT OBSERVATIONS:\n${recent.map((n) => `- ${n.text}`).join("\n")}\n\n` +
        `MOST COMMON MOVES OVERALL: ${topMechs || "—"}\n` +
        `MOST COMMON DOMAINS OVERALL: ${topDomains || "—"}`,
    },
  ];

  const result = await callGroq(messages, { maxTokens: 700, temperature: 0.5 });
  if (!result.ok) return { error: result.error };

  const entry = {
    id: `disc__AI_SYNTHESIS__${Date.now()}`,
    type: "AI_SYNTHESIS",
    title: "AI synthesis (Groq) — informal, not evidence-gated",
    text: result.text,
    basedOnCount: recent.length,
    modelUsed: result.modelUsed,
    computedAt: Date.now(),
  };
  await DB.saveDiscoveries([entry]);
  await DB.putMeta("lastAISynthesisNoteCount", usableNotes.length);
  return entry;
}
