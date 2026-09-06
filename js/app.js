/* THE THIRD POSITION — app controller */

const TRIVIAL_PATTERNS = [
  /^\s*(both( are| sides are)? (partly|somewhat|kind of|sort of) right\.?)\s*$/i,
  /^\s*(it depends\.?)\s*$/i,
  /^\s*(a (little )?bit of both\.?)\s*$/i,
  /^\s*(there'?s truth (to|in) both\.?)\s*$/i,
  /^\s*(somewhere in the middle\.?)\s*$/i,
  /^\s*(a mix of both\.?)\s*$/i,
  /^\s*(both\.?)\s*$/i,
];

const MIN_LENGTH = 40;

const state = {
  view: "today",
  currentDilemma: null,
  stage: "idle", // idle -> position -> mechanism -> done -> (back to idle)
  draftThirdPosition: "",
};

function $(sel, root = document) {
  return root.querySelector(sel);
}
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function domainSlug(domain) {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// A distinct hue per domain, so the archive, case headers, and pattern lab
// read as a spectrum rather than one flat color. Picked by hand for contrast
// against the dark ground, not generated — a hashed hue tends to clash.
const DOMAIN_COLORS = {
  "knowledge & evidence": "#c98f3f",
  "relationships": "#d9736c",
  "autonomy": "#5fb0c7",
  "morality": "#b5504a",
  "creativity": "#c77dd1",
  "classification": "#8a9a5b",
  "identity": "#e0a336",
  "memory": "#7f8fd1",
  "uncertainty": "#9a8f7a",
  "decision-making": "#4f9d8a",
  "social interpretation": "#d18f9e",
  "responsibility": "#c2703a",
  "rules & exceptions": "#6d9dc5",
  "order & spontaneity": "#e0c05c",
  "emotional reasoning": "#cf6d95",
  "aesthetics": "#a883d1",
  "trust": "#7fa88a",
  "change & continuity": "#c9a86a",
};

function domainColor(domain) {
  return DOMAIN_COLORS[domain] || "var(--accent)";
}

function domainStyleAttr(domain) {
  return `--dc: ${domainColor(domain)}`;
}

// A distinct hue per mechanism, so the move grid reads as a spectrum of
// choices rather than one uniform tile repeated twelve times.
const MECHANISM_COLORS = {
  CONDITION: "#d79b46",
  THRESHOLD: "#e0c05c",
  SEQUENCE: "#4f9d8a",
  DIFFERENT_LEVELS: "#5fb0c7",
  DIFFERENT_FUNCTIONS: "#6d9dc5",
  REVERSIBILITY: "#7fa88a",
  CONTROL_AGENCY: "#c2703a",
  FEEDBACK_LOOP: "#8a9a5b",
  CONTEXT: "#a883d1",
  NEW_VARIABLE: "#cf6d95",
  PRESERVE_CONTRADICTION: "#d9736c",
  OTHER: "#9a8f7a",
};

function mechanismColor(id) {
  return MECHANISM_COLORS[id] || "var(--accent)";
}

function mechanismPill(response) {
  const label = response.mechanism === "OTHER" ? response.mechanismOther : mechanismLabel(response.mechanism);
  return el("span", { class: "pill", style: `--mc: ${mechanismColor(response.mechanism)}`, text: label });
}

// ---------- dilemma selection ----------

function daysBetween(a, b) {
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function pickTodaysDilemma(responses) {
  const now = Date.now();
  const answeredCountByDilemma = new Map();
  const lastAnsweredByDilemma = new Map();
  const lastAnsweredByFamily = new Map();
  const domainCounts = new Map();

  for (const r of responses) {
    answeredCountByDilemma.set(r.dilemmaId, (answeredCountByDilemma.get(r.dilemmaId) || 0) + 1);
    lastAnsweredByDilemma.set(r.dilemmaId, Math.max(lastAnsweredByDilemma.get(r.dilemmaId) || 0, r.timestamp));
    const d = dilemmaById(r.dilemmaId);
    if (d) {
      domainCounts.set(d.domain, (domainCounts.get(d.domain) || 0) + 1);
      if (d.twinGroup) {
        lastAnsweredByFamily.set(d.twinGroup, Math.max(lastAnsweredByFamily.get(d.twinGroup) || 0, r.timestamp));
      }
    }
  }

  function twinSpacingOk(d) {
    if (!d.twinGroup) return true;
    const last = lastAnsweredByFamily.get(d.twinGroup);
    if (!last) return true;
    return daysBetween(now, last) >= 10; // keep twins spread apart
  }

  const unanswered = DILEMMAS.filter((d) => !answeredCountByDilemma.has(d.id));
  let pool = unanswered.filter(twinSpacingOk);
  if (pool.length === 0) pool = unanswered;

  if (pool.length === 0) {
    // bank exhausted at least once: resurface oldest-answered, respecting twin spacing when possible
    let candidates = DILEMMAS.filter(twinSpacingOk);
    if (candidates.length === 0) candidates = DILEMMAS.slice();
    candidates.sort((a, b) => (lastAnsweredByDilemma.get(a.id) || 0) - (lastAnsweredByDilemma.get(b.id) || 0));
    pool = candidates.slice(0, Math.max(3, Math.ceil(candidates.length * 0.15)));
  } else {
    // prefer domains that are under-represented so far
    const minDomainCount = Math.min(...pool.map((d) => domainCounts.get(d.domain) || 0));
    const preferred = pool.filter((d) => (domainCounts.get(d.domain) || 0) <= minDomainCount + 1);
    if (preferred.length > 0) pool = preferred;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- rendering shell ----------

function renderNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  const items = [
    ["today", "Contradiction"],
    ["archive", "Archive"],
    ["discoveries", "Discoveries"],
    ["map", "Contradiction Map"],
    ["lab", "Pattern Lab"],
    ["data", "Data / Export"],
  ];
  for (const [id, label] of items) {
    nav.appendChild(
      el("button", {
        class: "nav-btn" + (state.view === id ? " active" : ""),
        onclick: () => {
          state.view = id;
          route();
        },
        text: label,
      })
    );
  }
}

async function route() {
  renderNav();
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el("div", { class: "loading", text: "…" }));
  let view;
  if (state.view === "today") view = await renderToday();
  else if (state.view === "archive") view = await renderArchive();
  else if (state.view === "discoveries") view = await renderDiscoveries();
  else if (state.view === "map") view = await renderMapView();
  else if (state.view === "lab") view = await renderPatternLab();
  else if (state.view === "data") view = await renderDataView();
  main.innerHTML = "";
  main.appendChild(view);
}

// ---------- TODAY ----------
// There is no daily cap: the app always keeps one dilemma "loaded" and ready
// (in `pendingDilemmaId`) so you can answer as often as you like in a
// sitting. What paces the experience is the discovery gate (see
// discovery.js) and the twin-spacing rule inside pickTodaysDilemma — not a
// once-a-day lock on the entry point itself.

async function renderToday() {
  // Mid-flow: keep showing whatever stage we're on, using the dilemma already
  // picked for this session.
  if ((state.stage === "position" || state.stage === "mechanism") && state.currentDilemma) {
    const dilemma = state.currentDilemma;
    const wrap = el("div", { class: "panel today-panel" });
    wrap.appendChild(caseFileHeader(dilemma));
    wrap.appendChild(state.stage === "position" ? renderPositionStage(dilemma) : renderMechanismStage(dilemma));
    return wrap;
  }

  if (state.stage === "done" && state.lastSavedResponse) {
    const wrap = el("div", { class: "panel today-panel" });
    wrap.appendChild(caseFileHeader(state.currentDilemma));
    wrap.appendChild(await renderDoneStage(state.currentDilemma, state.lastSavedResponse));
    return wrap;
  }

  // Idle: resume an in-progress pick if the app was closed mid-answer,
  // otherwise load a fresh one immediately — no waiting required.
  const responses = await DB.getAllResponses();
  let dilemma;
  const pendingId = await DB.getMeta("pendingDilemmaId", null);
  if (pendingId) {
    dilemma = dilemmaById(pendingId) || pickTodaysDilemma(responses);
  } else {
    dilemma = pickTodaysDilemma(responses);
    await DB.putMeta("pendingDilemmaId", dilemma.id);
  }

  state.currentDilemma = dilemma;
  state.stage = "position";
  state.draftThirdPosition = "";

  const wrap = el("div", { class: "panel today-panel" });
  wrap.appendChild(caseFileHeader(dilemma));
  wrap.appendChild(renderPositionStage(dilemma));
  return wrap;
}

function caseFileHeader(dilemma) {
  return el("div", { class: "case-file-header", style: domainStyleAttr(dilemma.domain) }, [
    el("span", { class: "case-id", text: `SPECIMEN ${dilemma.id.toUpperCase()}` }),
    el("span", { class: "case-domain", text: dilemma.domain.toUpperCase() }),
  ]);
}

function renderPositionStage(dilemma) {
  const container = el("div", {});
  container.appendChild(
    el("div", { class: "position-block position-a" }, [el("div", { class: "position-tag", text: "POSITION A" }), el("p", { text: dilemma.positionA })])
  );
  container.appendChild(
    el("div", { class: "position-block position-b" }, [el("div", { class: "position-tag", text: "POSITION B" }), el("p", { text: dilemma.positionB })])
  );
  container.appendChild(el("div", { class: "divider" }));
  container.appendChild(el("h3", { class: "prompt", text: "FIND THE THIRD POSITION" }));
  container.appendChild(
    el("p", { class: "muted small", text: "Construct a position that preserves what's valid in both, without simply averaging them." })
  );

  const textarea = el("textarea", {
    class: "third-position-input",
    rows: "7",
    placeholder: "Your third position…",
  });
  textarea.value = state.draftThirdPosition;
  container.appendChild(textarea);

  const warning = el("div", { class: "warning hidden" });
  container.appendChild(warning);

  container.appendChild(
    el("button", {
      class: "btn primary",
      text: "Continue",
      onclick: () => {
        const text = textarea.value.trim();
        if (text.length < MIN_LENGTH) {
          warning.textContent = `Say a bit more — at least ${MIN_LENGTH} characters. A one-line answer rarely survives contact with a real dilemma.`;
          warning.classList.remove("hidden");
          return;
        }
        if (TRIVIAL_PATTERNS.some((re) => re.test(text))) {
          warning.textContent =
            "That reads as a pure compromise between A and B rather than a third position. What specific move are you actually making — a condition, a threshold, a different level? Try again.";
          warning.classList.remove("hidden");
          return;
        }
        state.draftThirdPosition = text;
        state.stage = "mechanism";
        route();
      },
    })
  );

  return container;
}

function renderMechanismStage(dilemma) {
  const container = el("div", {});
  container.appendChild(el("div", { class: "recap" }, [el("div", { class: "position-tag", text: "YOUR THIRD POSITION" }), el("p", { class: "recap-text", text: state.draftThirdPosition })]));
  container.appendChild(el("div", { class: "divider" }));
  container.appendChild(el("h3", { class: "prompt", text: "WHAT KIND OF MOVE DID YOU MAKE?" }));

  let selectedMechanism = null;
  const otherInput = el("input", { class: "other-input hidden", type: "text", placeholder: "Name the mechanism…", maxlength: "60" });

  const grid = el("div", { class: "mechanism-grid" });
  const buttons = [];
  for (const m of MECHANISMS) {
    const btn = el("button", { class: "mech-btn", style: `--mc: ${mechanismColor(m.id)}` }, [
      el("div", { class: "mech-label", text: m.label }),
      el("div", { class: "mech-hint", text: m.hint }),
    ]);
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedMechanism = m.id;
      otherInput.classList.toggle("hidden", m.id !== "OTHER");
      if (m.id === "OTHER") otherInput.focus();
    });
    buttons.push(btn);
    grid.appendChild(btn);
  }
  container.appendChild(grid);
  container.appendChild(otherInput);

  container.appendChild(el("div", { class: "divider" }));
  container.appendChild(el("h4", { class: "prompt small", text: "OPTIONAL" }));

  const optWrap = el("div", { class: "optional-fields" });

  const confRow = el("div", { class: "field-row" });
  confRow.appendChild(el("label", { text: "Confidence" }));
  const confSlider = el("input", { type: "range", min: "0", max: "100", value: "70" });
  const confVal = el("span", { class: "field-value", text: "70" });
  confSlider.addEventListener("input", () => (confVal.textContent = confSlider.value));
  confRow.appendChild(confSlider);
  confRow.appendChild(confVal);
  optWrap.appendChild(confRow);

  const diffRow = el("div", { class: "field-row" });
  diffRow.appendChild(el("label", { text: "Difficulty" }));
  const diffSlider = el("input", { type: "range", min: "1", max: "5", value: "3" });
  const diffVal = el("span", { class: "field-value", text: "3" });
  diffSlider.addEventListener("input", () => (diffVal.textContent = diffSlider.value));
  diffRow.appendChild(diffSlider);
  diffRow.appendChild(diffVal);
  optWrap.appendChild(diffRow);

  const noteInput = el("textarea", { class: "note-input", rows: "2", placeholder: "This bothered / interested me because… (optional)" });
  optWrap.appendChild(noteInput);

  container.appendChild(optWrap);

  const warning = el("div", { class: "warning hidden" });
  container.appendChild(warning);

  container.appendChild(
    el("button", {
      class: "btn primary",
      text: "File this response",
      onclick: async () => {
        if (!selectedMechanism) {
          warning.textContent = "Choose the move that best describes what you did.";
          warning.classList.remove("hidden");
          return;
        }
        if (selectedMechanism === "OTHER" && !otherInput.value.trim()) {
          warning.textContent = "Name the mechanism you used.";
          warning.classList.remove("hidden");
          return;
        }
        const response = {
          id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          dilemmaId: dilemma.id,
          timestamp: Date.now(),
          thirdPosition: state.draftThirdPosition,
          mechanism: selectedMechanism,
          mechanismOther: selectedMechanism === "OTHER" ? otherInput.value.trim() : null,
          confidence: Number(confSlider.value),
          difficulty: Number(diffSlider.value),
          note: noteInput.value.trim(),
        };
        await DB.addResponse(response);
        await DB.putMeta("pendingDilemmaId", null);
        state.stage = "done";
        state.lastSavedResponse = response;
        const unlock = await checkMilestonesAndMaybeUnlock();
        route().then(() => {
          if (unlock) showUnlockModal(unlock);
        });
      },
    })
  );

  return container;
}

async function renderDoneStage(dilemma, response) {
  const wrap = el("div", { class: "done-stage" });
  wrap.appendChild(el("h2", { text: "Filed." }));

  const responses = await DB.getAllResponses();
  const mechKey = response.mechanism === "OTHER" ? `OTHER:${(response.mechanismOther || "").trim().toLowerCase()}` : response.mechanism;
  const sameMechCount = responses.filter((r) => (r.mechanism === "OTHER" ? `OTHER:${(r.mechanismOther || "").trim().toLowerCase()}` : r.mechanism) === mechKey).length;
  const domainCount = responses.filter((r) => {
    const d = dilemmaById(r.dilemmaId);
    return d && d.domain === dilemma.domain;
  }).length;
  const mechLabel = response.mechanism === "OTHER" ? response.mechanismOther : mechanismLabel(response.mechanism);

  const tags = el("div", { class: "feedback-tags" });
  tags.appendChild(el("span", { class: "pill", text: `#${responses.length} logged overall` }));
  tags.appendChild(
    el("span", {
      class: "pill",
      style: `--mc: ${mechanismColor(response.mechanism)}`,
      text: sameMechCount === 1 ? `first time using "${mechLabel}"` : `${ordinal(sameMechCount)} time using "${mechLabel}"`,
    })
  );
  if (domainCount === 1) {
    tags.appendChild(el("span", { class: "pill muted-pill", text: `first entry in ${dilemma.domain}` }));
  }
  wrap.appendChild(tags);

  wrap.appendChild(
    el("p", { class: "muted", text: "The pattern this belongs to won't be fully visible for a while — that's by design. Small counts like these are just bookkeeping, not a conclusion." })
  );

  const actions = el("div", { class: "done-actions" });
  actions.appendChild(
    el("button", {
      class: "btn primary",
      text: "Answer another",
      onclick: async () => {
        const responses = await DB.getAllResponses();
        const next = pickTodaysDilemma(responses);
        await DB.putMeta("pendingDilemmaId", next.id);
        state.currentDilemma = next;
        state.stage = "position";
        state.draftThirdPosition = "";
        route();
      },
    })
  );
  actions.appendChild(
    el("button", {
      class: "btn secondary",
      text: "Stop for now",
      onclick: () => {
        state.stage = "idle";
        state.view = "archive";
        route();
      },
    })
  );
  wrap.appendChild(actions);
  return wrap;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function showUnlockModal(unlock) {
  const overlay = el("div", { class: "modal-overlay" });
  const modal = el("div", { class: "modal" });
  const headerText = unlock.timeBased ? "PERIODIC RECHECK — NEW EVIDENCE" : `MILESTONE — ${unlock.milestone} RESPONSES`;
  modal.appendChild(el("div", { class: "modal-header", text: headerText }));
  if (unlock.discoveries.length === 0) {
    modal.appendChild(el("p", { text: "No stable pattern has emerged yet. That itself is worth noting — keep going." }));
  } else {
    modal.appendChild(el("p", { class: "muted", text: `${unlock.discoveries.length} discovery(ies) unlocked or updated:` }));
    const list = el("div", { class: "discovery-list" });
    for (const d of unlock.discoveries) list.appendChild(renderDiscoveryCard(d));
    modal.appendChild(list);
  }
  modal.appendChild(
    el("button", {
      class: "btn primary",
      text: "Close",
      onclick: () => overlay.remove(),
    })
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ---------- ARCHIVE ----------

async function renderArchive() {
  const responses = (await DB.getAllResponses()).slice().reverse();
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Archive" }));
  if (responses.length === 0) {
    wrap.appendChild(el("p", { class: "muted", text: "No entries yet." }));
    return wrap;
  }

  const searchRow = el("div", { class: "field-row" });
  const search = el("input", { type: "text", placeholder: "Search archive…", class: "search-input" });
  searchRow.appendChild(search);
  wrap.appendChild(searchRow);

  const list = el("div", { class: "archive-list" });
  wrap.appendChild(list);

  function draw() {
    list.innerHTML = "";
    const q = search.value.trim().toLowerCase();
    for (const r of responses) {
      const d = dilemmaById(r.dilemmaId);
      if (!d) continue;
      const hay = `${d.domain} ${d.positionA} ${d.positionB} ${r.thirdPosition} ${r.note}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const card = el("div", { class: "archive-card", style: domainStyleAttr(d.domain) });
      card.appendChild(
        el("div", { class: "archive-card-header" }, [
          el("span", { class: "case-domain", text: d.domain }),
          el("span", { class: "muted small", text: new Date(r.timestamp).toLocaleDateString() }),
        ])
      );
      card.appendChild(el("p", { class: "archive-positions", text: `A: ${d.positionA}` }));
      card.appendChild(el("p", { class: "archive-positions", text: `B: ${d.positionB}` }));
      card.appendChild(el("p", { class: "archive-third", text: r.thirdPosition }));
      const meta = el("div", { class: "archive-meta" });
      meta.appendChild(mechanismPill(r));
      if (r.confidence != null) meta.appendChild(el("span", { class: "pill muted-pill", text: `confidence ${r.confidence}` }));
      if (r.difficulty != null) meta.appendChild(el("span", { class: "pill muted-pill", text: `difficulty ${r.difficulty}/5` }));
      card.appendChild(meta);
      if (r.note) card.appendChild(el("p", { class: "archive-note", text: `“${r.note}”` }));
      list.appendChild(card);
    }
    if (!list.children.length) list.appendChild(el("p", { class: "muted", text: "No matches." }));
  }
  search.addEventListener("input", draw);
  draw();
  return wrap;
}

// ---------- DISCOVERIES ----------

function renderDiscoveryCard(d) {
  const card = el("div", { class: `discovery-card type-${d.type.toLowerCase()}` });
  card.appendChild(el("div", { class: "discovery-type", text: d.type.replaceAll("_", " ") }));
  card.appendChild(el("h4", { class: "discovery-title", text: d.title }));
  card.appendChild(el("p", { class: "discovery-pattern", text: d.observedPattern }));

  const grid = el("div", { class: "discovery-grid" });
  grid.appendChild(el("div", { class: "dg-label", text: "EVIDENCE COUNT" }));
  grid.appendChild(el("div", { text: String(d.evidenceCount) }));
  grid.appendChild(el("div", { class: "dg-label", text: "DOMAINS" }));
  grid.appendChild(el("div", { text: d.domains.join(", ") || "—" }));
  grid.appendChild(el("div", { class: "dg-label", text: "CONFIDENCE" }));
  grid.appendChild(el("div", { text: d.confidence }));
  card.appendChild(grid);

  if (d.exampleResponses && d.exampleResponses.length) {
    const ex = el("div", { class: "discovery-examples" });
    ex.appendChild(el("div", { class: "dg-label", text: "EXAMPLE RESPONSES" }));
    for (const e of d.exampleResponses) {
      ex.appendChild(el("p", { class: "example-snippet", text: `[${e.domain}] "${e.snippet}" — ${e.mechanism}` }));
    }
    card.appendChild(ex);
  }
  if (d.counterexamples && d.counterexamples.length) {
    const cx = el("div", { class: "discovery-examples" });
    cx.appendChild(el("div", { class: "dg-label", text: "COUNTEREXAMPLES" }));
    for (const e of d.counterexamples) {
      cx.appendChild(el("p", { class: "example-snippet counter", text: `[${e.domain}] "${e.snippet}" — ${e.mechanism}` }));
    }
    card.appendChild(cx);
  }

  card.appendChild(el("p", { class: "discovery-alt" }, [el("strong", { text: "Alternative explanation: " }), document.createTextNode(d.alternativeExplanation)]));
  card.appendChild(el("p", { class: "discovery-disconfirm" }, [el("strong", { text: "What would disconfirm this: " }), document.createTextNode(d.disconfirm)]));
  return card;
}

async function renderDiscoveries() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Discoveries" }));
  const discoveries = (await DB.getAllDiscoveries()).sort((a, b) => b.computedAt - a.computedAt);
  const responses = await DB.getAllResponses();
  const schedule = nextMilestoneSchedule(responses.length);
  const nextMilestone = schedule.find((m) => m > responses.length);
  wrap.appendChild(
    el("p", {
      class: "muted small",
      text: `${responses.length} responses logged. Next check at ${nextMilestone ?? "—"} responses, or sooner if it's been a few days since the last check.`,
    })
  );

  const nearMisses = computeNearMisses(responses);
  if (nearMisses.length) {
    const section = el("div", { class: "near-miss-section" });
    section.appendChild(el("div", { class: "dg-label", text: "BUILDING EVIDENCE — not yet confirmed" }));
    for (const nm of nearMisses) {
      section.appendChild(el("div", { class: "near-miss-item" }, [el("strong", { text: nm.label }), el("p", { text: nm.detail })]));
    }
    wrap.appendChild(section);
  }

  if (discoveries.length === 0) {
    wrap.appendChild(el("p", { class: "muted", text: "Nothing confirmed yet. Discoveries require repeated evidence, not single answers." }));
    return wrap;
  }
  for (const d of discoveries) wrap.appendChild(renderDiscoveryCard(d));
  return wrap;
}

// ---------- CONTRADICTION MAP ----------

async function renderMapView() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Contradiction Map" }));
  wrap.appendChild(
    el("p", { class: "muted small", text: "Outer ring: domains. Middle ring: structural families (tensions). Inner ring: mechanisms. Line weight = frequency." })
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "contradiction-map");
  const responses = await DB.getAllResponses();
  renderMap(svg, responses);
  wrap.appendChild(svg);
  return wrap;
}

// ---------- PATTERN LAB ----------

async function renderPatternLab() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Pattern Lab" }));
  wrap.appendChild(el("p", { class: "muted small", text: "Structural twins: dilemmas that look unrelated but test the same underlying tension." }));

  const responses = await DB.getAllResponses();
  const byTwin = new Map();
  for (const r of responses) {
    const d = dilemmaById(r.dilemmaId);
    if (!d || !d.twinGroup) continue;
    if (!byTwin.has(d.twinGroup)) byTwin.set(d.twinGroup, []);
    byTwin.get(d.twinGroup).push({ r, d });
  }

  let any = false;
  for (const [twinGroup, items] of byTwin) {
    const distinct = new Map();
    for (const it of items) distinct.set(it.d.id, it); // latest response per dilemma
    if (distinct.size < 2) continue;
    any = true;
    const card = el("div", { class: "twin-card" });
    card.appendChild(el("div", { class: "discovery-type", text: twinGroup.replace("TWIN_", "").replaceAll("_", " ") }));
    for (const { r, d } of distinct.values()) {
      const side = el("div", { class: "twin-side", style: domainStyleAttr(d.domain) });
      side.appendChild(el("div", { class: "case-domain", text: d.domain }));
      side.appendChild(el("p", { class: "muted small", text: `A: ${d.positionA}` }));
      side.appendChild(el("p", { class: "muted small", text: `B: ${d.positionB}` }));
      side.appendChild(el("p", { class: "archive-third", text: r.thirdPosition }));
      side.appendChild(mechanismPill(r));
      card.appendChild(side);
    }
    wrap.appendChild(card);
  }
  if (!any) {
    wrap.appendChild(
      el("p", { class: "muted", text: "No comparable twin pairs yet. As you answer more dilemmas, structural twins will surface here automatically." })
    );
  }
  return wrap;
}

// ---------- DATA / EXPORT ----------

async function renderDataView() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Data / Export" }));
  const responses = await DB.getAllResponses();
  wrap.appendChild(el("p", { class: "muted", text: `${responses.length} responses stored locally in this browser's IndexedDB. Nothing is ever sent anywhere.` }));

  const row = el("div", { class: "data-actions" });
  row.appendChild(el("button", { class: "btn secondary", text: "Export full JSON backup", onclick: exportJSON }));
  row.appendChild(el("button", { class: "btn secondary", text: "Export responses as CSV", onclick: exportCSV }));

  const importLabel = el("label", { class: "btn secondary file-btn", text: "Import JSON backup" });
  const fileInput = el("input", { type: "file", accept: "application/json", class: "hidden" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm("Importing will REPLACE all current data with the contents of this file. Continue?")) return;
    try {
      const n = await importJSONFile(file);
      alert(`Imported ${n} responses.`);
      route();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });
  importLabel.appendChild(fileInput);
  row.appendChild(importLabel);

  row.appendChild(
    el("button", {
      class: "btn danger",
      text: "Delete all data",
      onclick: async () => {
        if (!confirm("This permanently deletes every response, discovery, and setting stored in this browser. This cannot be undone. Continue?")) return;
        if (!confirm("Really sure? Type OK in the next prompt to confirm.")) return;
        const val = prompt('Type "DELETE" to confirm permanent deletion:');
        if (val !== "DELETE") return;
        await DB.clearAll();
        alert("All data deleted.");
        route();
      },
    })
  );

  wrap.appendChild(row);

  wrap.appendChild(el("div", { class: "divider" }));
  wrap.appendChild(el("h3", { text: "Dilemma bank" }));
  wrap.appendChild(
    el("p", {
      class: "muted small",
      text: `${DILEMMAS.length} dilemmas across ${DOMAINS.length} domains, defined in js/dilemmas.js. See the README for how to add your own.`,
    })
  );

  return wrap;
}

// ---------- boot ----------

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
  route();
}

document.addEventListener("DOMContentLoaded", boot);
