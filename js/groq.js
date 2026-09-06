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
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
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

async function callGroq(messages, { model, maxTokens = 200, temperature = 0.4 } = {}) {
  const settings = getGroqSettings();
  if (!settings.enabled || !settings.apiKey.trim()) return { ok: false, error: "AI assist is not enabled." };

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model || settings.model || GROQ_DEFAULT_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const status = res.status;
      let detail = "";
      try {
        const body = await res.json();
        detail = body?.error?.message || "";
      } catch {
        /* ignore */
      }
      if (status === 401) return { ok: false, error: "Groq rejected the API key (401). Check it in Data / Export." };
      if (status === 429) return { ok: false, error: "Groq rate limit hit — this stays within the free tier's daily/per-minute caps, so it should recover shortly." };
      return { ok: false, error: `Groq request failed (${status}). ${detail}`.trim() };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "Groq returned an empty response." };
    return { ok: true, text };
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

  const result = await callGroq(messages, { maxTokens: 80, temperature: 0.5 });
  if (!result.ok) return { error: result.error };

  const note = {
    id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    responseId: response.id,
    dilemmaId: dilemma.id,
    text: result.text,
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

  const result = await callGroq(messages, { maxTokens: 220, temperature: 0.5 });
  if (!result.ok) return { error: result.error };

  const entry = {
    id: `disc__AI_SYNTHESIS__${Date.now()}`,
    type: "AI_SYNTHESIS",
    title: "AI synthesis (Groq) — informal, not evidence-gated",
    text: result.text,
    basedOnCount: recent.length,
    computedAt: Date.now(),
  };
  await DB.saveDiscoveries([entry]);
  await DB.putMeta("lastAISynthesisNoteCount", usableNotes.length);
  return entry;
}
