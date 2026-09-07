/* JSON / CSV export & import. Everything stays local — this only ever
   writes to a file the user chooses to download, and only ever reads
   a file the user chooses to pick. Nothing is transmitted anywhere. */

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJSON() {
  const responses = await DB.getAllResponses();
  const discoveries = await DB.getAllDiscoveries();
  const aiNotes = await DB.getAllAINotes();
  const patternChecks = await DB.getAllPatternChecks();
  const meta = await DB.getAllMeta();
  const payload = {
    app: "the-third-position",
    exportVersion: 3,
    exportedAt: new Date().toISOString(),
    responses,
    discoveries,
    aiNotes,
    patternChecks,
    meta,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`third-position-export-${stamp}.json`, "application/json", JSON.stringify(payload, null, 2));
  // Deliberately excluded: the Groq API key and AI-Assist on/off toggle,
  // which live in localStorage, not IndexedDB — a backup file should never
  // carry a credential, and each browser/device needs its own key anyway.
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportCSV() {
  const responses = await DB.getAllResponses();
  const headers = [
    "id",
    "timestamp",
    "date",
    "dilemmaId",
    "domain",
    "positionA",
    "positionB",
    "thirdPosition",
    "mechanism",
    "mechanismOther",
    "confidence",
    "difficulty",
    "note",
  ];
  const rows = [headers.join(",")];
  for (const r of responses) {
    const d = dilemmaById(r.dilemmaId) || {};
    rows.push(
      [
        r.id,
        r.timestamp,
        new Date(r.timestamp).toISOString(),
        r.dilemmaId,
        d.domain || "",
        d.positionA || "",
        d.positionB || "",
        r.thirdPosition || "",
        r.mechanism || "",
        r.mechanismOther || "",
        r.confidence ?? "",
        r.difficulty ?? "",
        r.note || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`third-position-responses-${stamp}.csv`, "text/csv", rows.join("\n"));
}

function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.responses)) {
          throw new Error("This file doesn't look like a Third Position export.");
        }
        await DB.replaceAll({
          responses: data.responses,
          discoveries: Array.isArray(data.discoveries) ? data.discoveries : [],
          meta: Array.isArray(data.meta) ? data.meta : [],
          aiNotes: Array.isArray(data.aiNotes) ? data.aiNotes : [],
          patternChecks: Array.isArray(data.patternChecks) ? data.patternChecks : [],
        });
        resolve(data.responses.length);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
