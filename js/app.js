/* THE THIRD POSITION — app controller (Pattern Check core) */

const SVG_NS = "http://www.w3.org/2000/svg";

const state = {
  view: "patterncheck",
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

function shuffledIndices(n) {
  const idx = [...Array(n).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// A distinct hue per shared-logic label, hashed deterministically since
// labels are open-ended (hand-written or AI-invented) rather than a fixed
// enum — so this can't be a hardcoded lookup table the way domain colors
// used to be.
const LABEL_PALETTE = ["#c98f3f", "#d9736c", "#5fb0c7", "#b5504a", "#c77dd1", "#8a9a5b", "#e0a336", "#7f8fd1", "#9a8f7a", "#4f9d8a", "#d18f9e", "#6d9dc5"];
function colorForLabel(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_PALETTE[hash % LABEL_PALETTE.length];
}

// If a request quietly fell through to a fallback model, say so — never
// hide that the configured model wasn't actually the one that answered.
function aiModelFootnote(modelUsed) {
  const configured = getGroqSettings().model || GROQ_DEFAULT_MODEL;
  if (!modelUsed || modelUsed === configured) return null;
  return el("p", { class: "muted small", text: `(answered by fallback model ${modelUsed} — ${configured} was unavailable)` });
}

// ---------- nav / routing ----------

function renderNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  const items = [
    ["patterncheck", "Pattern Check"],
    ["archive", "Archive"],
    ["discoveries", "Discoveries"],
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

function renderRouteError(err) {
  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Couldn't load this view" }));
  panel.appendChild(el("p", { class: "warning", text: err && err.message ? err.message : "Something went wrong loading local data." }));
  panel.appendChild(el("button", { class: "btn primary", text: "Reload", onclick: () => location.reload() }));
  return panel;
}

async function route() {
  renderNav();
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el("div", { class: "loading", text: "…" }));
  let view;
  try {
    if (state.view === "patterncheck") view = await renderPatternCheck();
    else if (state.view === "archive") view = await renderArchive();
    else if (state.view === "discoveries") view = await renderDiscoveries();
    else if (state.view === "data") view = await renderDataView();
  } catch (err) {
    view = renderRouteError(err);
  }
  main.innerHTML = "";
  main.appendChild(view);
}

// ---------- PATTERN CHECK ----------

async function renderPatternCheck() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Pattern Check" }));
  wrap.appendChild(
    el("p", {
      class: "muted small",
      text: "Three stances, pinned loosely. Two share a real underlying logic. Tap those two to connect them with a string — whichever one is left over is the odd one out.",
    })
  );

  const recentKeys = (await DB.getMeta("recentTriadKeys", [])) || [];
  const recentLogics = (await DB.getMeta("recentLogics", [])) || [];
  const triad = await pickTriad(recentKeys, recentLogics);

  const puzzleBox = el("div", { class: "triad-box" });
  wrap.appendChild(puzzleBox);

  function renderPuzzle() {
    puzzleBox.innerHTML = "";
    const tag =
      triad.source === "ai"
        ? "AI-GENERATED (GROQ)"
        : triad.aiError
        ? "OFFLINE BANK — AI GENERATION FAILED"
        : "OFFLINE BANK";
    puzzleBox.appendChild(el("div", { class: "dg-label", text: tag }));
    if (triad.aiError) {
      puzzleBox.appendChild(el("p", { class: "muted small", text: triad.aiError }));
    }

    const board = el("div", { class: "triad-board" });
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "triad-connector-svg");
    board.appendChild(svg);

    const order = shuffledIndices(3);
    const cards = [];
    let selected = [];
    let answered = false;

    function drawString(color) {
      if (selected.length !== 2) return;
      const boardRect = board.getBoundingClientRect();
      const [c1, c2] = selected;
      const r1 = c1.getBoundingClientRect();
      const r2 = c2.getBoundingClientRect();
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", r1.left + r1.width / 2 - boardRect.left);
      line.setAttribute("y1", r1.top + r1.height / 2 - boardRect.top);
      line.setAttribute("x2", r2.left + r2.width / 2 - boardRect.left);
      line.setAttribute("y2", r2.top + r2.height / 2 - boardRect.top);
      line.setAttribute("class", "triad-string");
      line.style.stroke = color;
      svg.appendChild(line);
    }

    async function commitPair() {
      answered = true;
      const unselectedCard = cards.find((c) => !selected.includes(c));
      const unselectedCanonical = Number(unselectedCard.dataset.canonical);
      const correct = unselectedCanonical === triad.oddIndex;

      cards.forEach((c) => c.classList.add("triad-disabled"));
      selected.forEach((c) => c.classList.add(correct ? "triad-pair-correct" : "triad-pair-incorrect"));
      const trueOddCard = cards.find((c) => Number(c.dataset.canonical) === triad.oddIndex);
      if (trueOddCard) trueOddCard.classList.add("triad-outlier-reveal");
      drawString(correct ? "var(--accent-2)" : "var(--danger)");

      const check = {
        id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        source: triad.source,
        modelUsed: triad.modelUsed || null,
        stances: triad.stances,
        oddIndex: triad.oddIndex,
        chosenUnselectedIndex: unselectedCanonical,
        sharedLogic: triad.sharedLogic,
        explanation: triad.explanation,
        correct,
        note: "",
      };
      await DB.addPatternCheck(check);
      const updatedKeys = [triad.triadKey, ...recentKeys].slice(0, RECENT_TRIAD_KEYS_TO_TRACK);
      await DB.putMeta("recentTriadKeys", updatedKeys);
      const updatedLogics = [triad.sharedLogic, ...recentLogics].slice(0, RECENT_TRIAD_KEYS_TO_TRACK);
      await DB.putMeta("recentLogics", updatedLogics);

      const result = el("div", { class: `triad-result ${correct ? "triad-result-correct" : "triad-result-incorrect"}` });
      result.appendChild(el("div", { class: "dg-label", text: correct ? "CONNECTED CORRECTLY" : "NOT QUITE" }));
      result.appendChild(el("p", { text: `Shared logic: ${triad.sharedLogic}.` }));
      result.appendChild(el("p", { class: "muted small", text: triad.explanation }));
      const footnote = aiModelFootnote(triad.modelUsed);
      if (footnote) result.appendChild(footnote);
      puzzleBox.appendChild(result);

      const noteRow = el("div", { class: "field-row" });
      const noteInput = el("textarea", { class: "note-input", rows: "2", placeholder: "What made this tricky or obvious? (optional)" });
      noteRow.appendChild(noteInput);
      puzzleBox.appendChild(noteRow);
      puzzleBox.appendChild(
        el("button", {
          class: "btn secondary",
          text: "Save note",
          onclick: async () => {
            await updatePatternCheckNote(check.id, noteInput.value.trim());
            noteRow.remove();
          },
        })
      );

      const actions = el("div", { class: "done-actions" });
      actions.appendChild(el("button", { class: "btn primary", text: "Next puzzle", onclick: () => route() }));
      puzzleBox.appendChild(actions);

      const unlock = await checkMilestonesAndMaybeUnlock();
      if (unlock) showUnlockModal(unlock);
    }

    order.forEach((canonicalIndex) => {
      const card = el("div", { class: "triad-card" }, [el("p", { text: triad.stances[canonicalIndex] })]);
      card.dataset.canonical = canonicalIndex;
      card.addEventListener("click", () => {
        if (answered) return;
        if (selected.includes(card)) {
          selected = selected.filter((c) => c !== card);
          card.classList.remove("triad-selected");
          return;
        }
        if (selected.length >= 2) return;
        selected.push(card);
        card.classList.add("triad-selected");
        if (selected.length === 2) commitPair();
      });
      cards.push(card);
      board.appendChild(card);
    });

    puzzleBox.appendChild(board);
  }

  renderPuzzle();

  const checks = await DB.getAllPatternChecks();
  wrap.appendChild(el("div", { class: "divider" }));
  const statsLine =
    checks.length === 0
      ? "No puzzles solved yet."
      : `${checks.length} puzzle(s) solved, ${Math.round((checks.filter((c) => c.correct).length / checks.length) * 100)}% correct.`;
  wrap.appendChild(el("p", { class: "muted small", text: statsLine }));

  return wrap;
}

async function updatePatternCheckNote(id, note) {
  // db.js only exposes add(); patternChecks are keyed by id, so a direct
  // put() through the same store works as an upsert/update here.
  const dbHandle = await openDB();
  const t = dbHandle.transaction(["patternChecks"], "readwrite");
  return new Promise((resolve, reject) => {
    const store = t.objectStore("patternChecks");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.note = note;
        store.put(record);
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

function showUnlockModal(unlock) {
  const overlay = el("div", { class: "modal-overlay" });
  const modal = el("div", { class: "modal" });
  const headerText = unlock.timeBased ? "PERIODIC RECHECK — NEW EVIDENCE" : `MILESTONE — ${unlock.milestone} ATTEMPTS`;
  modal.appendChild(el("div", { class: "modal-header", text: headerText }));
  if (unlock.discoveries.length === 0) {
    modal.appendChild(el("p", { text: "No stable pattern has emerged yet. That itself is worth noting — keep going." }));
  } else {
    modal.appendChild(el("p", { class: "muted", text: `${unlock.discoveries.length} discovery(ies) unlocked or updated:` }));
    const list = el("div", { class: "discovery-list" });
    for (const d of unlock.discoveries) list.appendChild(renderDiscoveryCard(d));
    modal.appendChild(list);
  }
  modal.appendChild(el("button", { class: "btn primary", text: "Close", onclick: () => overlay.remove() }));
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ---------- ARCHIVE ----------

async function renderArchive() {
  const checks = (await DB.getAllPatternChecks()).slice().reverse();
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Archive" }));
  if (checks.length === 0) {
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
    for (const c of checks) {
      const hay = `${c.sharedLogic} ${c.stances.join(" ")} ${c.note || ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const dc = colorForLabel(c.sharedLogic);
      const card = el("div", { class: "archive-card", style: `--dc: ${dc}` });
      card.appendChild(
        el("div", { class: "archive-card-header" }, [
          el("span", { class: "case-domain", text: c.sharedLogic }),
          el("span", { class: "muted small", text: new Date(c.timestamp).toLocaleDateString() }),
        ])
      );
      c.stances.forEach((s, i) => {
        const label = i === c.oddIndex ? "ODD ONE OUT" : "PAIR";
        card.appendChild(el("p", { class: "archive-positions", text: `${label}: ${s}` }));
      });
      const meta = el("div", { class: "archive-meta" });
      meta.appendChild(el("span", { class: "pill", style: `--mc: ${c.correct ? "var(--accent-2)" : "var(--danger)"}`, text: c.correct ? "correct" : "missed" }));
      meta.appendChild(el("span", { class: "pill muted-pill", text: c.source === "ai" ? "ai-generated" : "offline bank" }));
      card.appendChild(meta);
      if (c.note) card.appendChild(el("p", { class: "archive-note", text: `“${c.note}”` }));
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
  if (d.domains && d.domains.length) {
    grid.appendChild(el("div", { class: "dg-label", text: "CATEGORIES" }));
    grid.appendChild(el("div", { text: d.domains.join(", ") }));
  }
  grid.appendChild(el("div", { class: "dg-label", text: "CONFIDENCE" }));
  grid.appendChild(el("div", { text: d.confidence }));
  card.appendChild(grid);

  if (d.examples && d.examples.length) {
    const ex = el("div", { class: "discovery-examples" });
    ex.appendChild(el("div", { class: "dg-label", text: "EXAMPLES" }));
    for (const e of d.examples) ex.appendChild(el("p", { class: "example-snippet", text: e }));
    card.appendChild(ex);
  }

  card.appendChild(el("p", { class: "discovery-alt" }, [el("strong", { text: "Alternative explanation: " }), document.createTextNode(d.alternativeExplanation)]));
  card.appendChild(el("p", { class: "discovery-disconfirm" }, [el("strong", { text: "What would disconfirm this: " }), document.createTextNode(d.disconfirm)]));
  return card;
}

async function renderDiscoveries() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Discoveries" }));
  const discoveries = (await DB.getAllDiscoveries()).sort((a, b) => b.computedAt - a.computedAt);
  const checks = await DB.getAllPatternChecks();
  const schedule = nextMilestoneSchedule(checks.length);
  const nextMilestone = schedule.find((m) => m > checks.length);
  wrap.appendChild(
    el("p", {
      class: "muted small",
      text: `${checks.length} attempts logged. Next check at ${nextMilestone ?? "—"} attempts, or sooner if it's been a few days since the last check.`,
    })
  );

  const nearMisses = computeNearMisses(checks);
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
  } else {
    for (const d of discoveries) wrap.appendChild(renderDiscoveryCard(d));
  }
  return wrap;
}

// ---------- DATA / EXPORT ----------

async function renderDataView() {
  const wrap = el("div", { class: "panel" });
  wrap.appendChild(el("h2", { text: "Data / Export" }));
  const checks = await DB.getAllPatternChecks();
  wrap.appendChild(
    el("p", { class: "muted", text: `${checks.length} attempts stored locally in this browser's IndexedDB. Nothing is ever sent anywhere, unless you opt into AI Assist below.` })
  );

  const row = el("div", { class: "data-actions" });
  row.appendChild(el("button", { class: "btn secondary", text: "Export full JSON backup", onclick: exportJSON }));
  row.appendChild(el("button", { class: "btn secondary", text: "Export attempts as CSV", onclick: exportCSV }));

  const importLabel = el("label", { class: "btn secondary file-btn", text: "Import JSON backup" });
  const fileInput = el("input", { type: "file", accept: "application/json", class: "hidden" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm("Importing will REPLACE all current data with the contents of this file. Continue?")) return;
    try {
      const n = await importJSONFile(file);
      alert(`Imported ${n} attempts.`);
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
        if (!confirm("This permanently deletes every attempt, discovery, and setting stored in this browser. This cannot be undone. Continue?")) return;
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
  wrap.appendChild(renderAppearanceSection());
  wrap.appendChild(el("div", { class: "divider" }));
  wrap.appendChild(renderAIAssistSection());
  wrap.appendChild(el("div", { class: "divider" }));
  wrap.appendChild(el("h3", { text: "Offline fallback bank" }));
  wrap.appendChild(
    el("p", { class: "muted small", text: `${ODD_ONE_OUT.length} hand-written triads, defined in js/oddOneOut.js. Used whenever AI Assist is off or unavailable. See the README for how to add your own.` })
  );

  return wrap;
}

function renderAppearanceSection() {
  const section = el("div", {});
  section.appendChild(el("h3", { text: "Appearance" }));

  const settings = getThemeSettings();
  const resolved = resolveMode(settings.mode);

  const modeRow = el("div", { class: "field-row" });
  modeRow.appendChild(el("label", { text: "Mode" }));
  const modeSelect = el("select", { class: "other-input", style: "margin-top:0" });
  for (const [val, label] of [
    ["dark", "Dark"],
    ["light", "Light"],
    ["auto", "Auto (match system)"],
  ]) {
    const opt = el("option", { value: val, text: label });
    if (settings.mode === val) opt.selected = true;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener("change", () => {
    saveThemeSettings({ ...getThemeSettings(), mode: modeSelect.value });
    applyTheme();
    updateThemeToggleButton();
    route();
  });
  modeRow.appendChild(modeSelect);
  section.appendChild(modeRow);

  section.appendChild(
    el("p", {
      class: "muted small",
      text: "Palette is independent of mode — each preset below has its own dark and light variant, so switching modes never resets your color choice.",
    })
  );

  const paletteRow = el("div", { class: "palette-row" });
  for (const [id, preset] of Object.entries(PALETTES)) {
    const isCustom = id === "custom";
    const swatchColors = isCustom
      ? settings.customColors
        ? [settings.customColors.accent, settings.customColors.accent2, settings.customColors.accent3]
        : ["#999", "#999", "#999"]
      : [preset[resolved].accent, preset[resolved].accent2, preset[resolved].accent3];
    const dots = el(
      "span",
      { class: "palette-swatch-dots" },
      swatchColors.map((c) => el("span", { style: `background:${c}` }))
    );
    paletteRow.appendChild(
      el(
        "button",
        {
          class: "palette-swatch" + (settings.paletteId === id ? " active" : ""),
          onclick: () => {
            const current = getThemeSettings();
            let customColors = current.customColors;
            if (isCustom && !customColors) {
              const seedPreset = current.paletteId !== "custom" && PALETTES[current.paletteId] ? PALETTES[current.paletteId] : PALETTES.lab;
              customColors = { ...seedPreset[resolveMode(current.mode)] };
            }
            saveThemeSettings({ ...current, paletteId: id, customColors });
            applyTheme();
            route();
          },
        },
        [dots, preset.label]
      )
    );
  }
  section.appendChild(paletteRow);

  if (settings.paletteId === "custom") {
    const colors = settings.customColors || PALETTES.lab[resolved];
    const fieldsWrap = el("div", { class: "custom-color-row" });
    for (const [key, label] of [
      ["accent", "Accent"],
      ["accent2", "Accent 2"],
      ["accent3", "Accent 3"],
      ["danger", "Danger"],
    ]) {
      const field = el("div", { class: "custom-color-field" });
      field.appendChild(el("label", { text: label }));
      const input = el("input", { type: "color" });
      input.value = colors[key];
      input.addEventListener("input", () => {
        const current = getThemeSettings();
        const updated = { ...(current.customColors || colors), [key]: input.value };
        saveThemeSettings({ ...current, paletteId: "custom", customColors: updated });
        applyTheme();
      });
      field.appendChild(input);
      fieldsWrap.appendChild(field);
    }
    section.appendChild(fieldsWrap);
  }

  return section;
}

function renderAIAssistSection() {
  const section = el("div", {});
  section.appendChild(el("h3", { text: "AI Assist — Pattern Generation (optional, off by default)" }));
  section.appendChild(
    el("p", {
      class: "warning",
      text:
        "Turning this on sends a request to Groq's API, using your own key, directly from this browser, every time a new puzzle is generated. Everything else about this app stays local — this is the one exception. Leave it off to use only the offline hand-written bank.",
    })
  );

  const settings = getGroqSettings();

  const enableRow = el("div", { class: "field-row" });
  const enableCheckbox = el("input", { type: "checkbox" });
  enableCheckbox.checked = settings.enabled;
  enableRow.appendChild(enableCheckbox);
  enableRow.appendChild(el("label", { text: "Enable AI-generated puzzles" }));
  section.appendChild(enableRow);

  const keyRow = el("div", { class: "field-row" });
  keyRow.appendChild(el("label", { text: "Groq API key" }));
  const keyInput = el("input", { type: "password", class: "other-input", placeholder: "gsk_…", style: "margin-top:0;flex:1" });
  keyInput.value = settings.apiKey;
  keyRow.appendChild(keyInput);
  section.appendChild(keyRow);

  const modelRow = el("div", { class: "field-row" });
  modelRow.appendChild(el("label", { text: "Model" }));
  const modelInput = el("input", { type: "text", class: "other-input", style: "margin-top:0;flex:1" });
  modelInput.value = settings.model;
  modelRow.appendChild(modelInput);
  section.appendChild(modelRow);
  section.appendChild(
    el("p", {
      class: "muted small",
      text: `Default is ${GROQ_DEFAULT_MODEL}. If that model 404s or hits a rate limit, requests automatically fall through to ${GROQ_FALLBACK_MODELS.join(" then ")} before giving up. Groq's catalog changes independently of this app, so use "Check available models" below with your key for the current, authoritative list.`,
    })
  );

  const modelListOutput = el("div", { class: "hidden" });
  section.appendChild(
    el("button", {
      class: "btn secondary",
      text: "Check available models",
      onclick: async () => {
        modelListOutput.classList.remove("hidden");
        modelListOutput.textContent = "Checking…";
        const keyToUse = keyInput.value.trim() || getGroqSettings().apiKey;
        if (!keyToUse) {
          modelListOutput.textContent = "Enter a key above first — it doesn't need to be saved to check it.";
          return;
        }
        const result = await listAvailableGroqModels(keyToUse);
        if (!result.ok) {
          modelListOutput.textContent = `Couldn't check: ${result.error}`;
          return;
        }
        modelListOutput.textContent = result.ids.length ? `Available to this key: ${result.ids.join(", ")}` : "Key is valid but returned no models.";
      },
    })
  );
  modelListOutput.classList.add("muted", "small");
  section.appendChild(modelListOutput);

  const status = el("p", { class: "muted small", text: groqIsActive() ? "Currently active." : "Currently off." });
  section.appendChild(status);

  const btnRow = el("div", { class: "data-actions" });
  btnRow.appendChild(
    el("button", {
      class: "btn secondary",
      text: "Save AI Assist settings",
      onclick: () => {
        saveGroqSettings({ enabled: enableCheckbox.checked, apiKey: keyInput.value.trim(), model: modelInput.value.trim() || GROQ_DEFAULT_MODEL });
        route();
      },
    })
  );
  btnRow.appendChild(
    el("button", {
      class: "btn danger",
      text: "Forget saved key",
      onclick: () => {
        saveGroqSettings({ enabled: false, apiKey: "", model: GROQ_DEFAULT_MODEL });
        route();
      },
    })
  );
  section.appendChild(btnRow);

  return section;
}

// ---------- theme toggle ----------

function updateThemeToggleButton() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const resolved = document.documentElement.getAttribute("data-theme") || "dark";
  btn.textContent = resolved === "light" ? "☀" : "☾";
  btn.title = resolved === "light" ? "Switch to dark mode" : "Switch to light mode";
}

function toggleThemeMode() {
  const settings = getThemeSettings();
  const resolved = resolveMode(settings.mode);
  saveThemeSettings({ ...settings, mode: resolved === "light" ? "dark" : "light" });
  applyTheme();
  updateThemeToggleButton();
}

// ---------- boot ----------

function showUpdateBanner() {
  if (document.getElementById("update-banner")) return;
  const banner = el("div", { id: "update-banner", class: "update-banner" }, [
    el("span", { text: "A new version of this app is ready." }),
    el("button", { class: "btn primary", text: "Refresh", onclick: () => location.reload() }),
    el("button", { class: "btn secondary", text: "Later", onclick: () => banner.remove() }),
  ]);
  document.body.appendChild(banner);
}

async function boot() {
  updateThemeToggleButton();
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) themeToggle.addEventListener("click", toggleThemeMode);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("service-worker.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(() => {});
  }
  route();
}

document.addEventListener("DOMContentLoaded", boot);
