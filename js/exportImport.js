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
  const patternChecks = await DB.getAllPatternChecks();
  const discoveries = await DB.getAllDiscoveries();
  const meta = await DB.getAllMeta();
  const payload = {
    app: "the-third-position",
    exportVersion: 4,
    exportedAt: new Date().toISOString(),
    patternChecks,
    discoveries,
    meta,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`pattern-check-export-${stamp}.json`, "application/json", JSON.stringify(payload, null, 2));
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
  const checks = await DB.getAllPatternChecks();
  const headers = ["id", "timestamp", "date", "source", "modelUsed", "stance0", "stance1", "stance2", "oddIndex", "chosenUnselectedIndex", "sharedLogic", "correct", "note"];
  const rows = [headers.join(",")];
  for (const c of checks) {
    rows.push(
      [
        c.id,
        c.timestamp,
        new Date(c.timestamp).toISOString(),
        c.source,
        c.modelUsed || "",
        c.stances?.[0] || "",
        c.stances?.[1] || "",
        c.stances?.[2] || "",
        c.oddIndex,
        c.chosenUnselectedIndex,
        c.sharedLogic || "",
        c.correct,
        c.note || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`pattern-check-attempts-${stamp}.csv`, "text/csv", rows.join("\n"));
}

function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.patternChecks)) {
          throw new Error("This file doesn't look like a Pattern Check export.");
        }
        await DB.replaceAll({
          patternChecks: data.patternChecks,
          discoveries: Array.isArray(data.discoveries) ? data.discoveries : [],
          meta: Array.isArray(data.meta) ? data.meta : [],
        });
        resolve(data.patternChecks.length);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
