/* Minimal IndexedDB wrapper. Everything stays on-device. */

const DB_NAME = "third-position-db";
const DB_VERSION = 4;

let _dbPromise = null;

// indexedDB.open() with a bumped DB_VERSION never fires onsuccess *or*
// onerror while an older-version connection is still open somewhere else
// (another tab, or a backgrounded PWA instance) — it just hangs forever.
// This project has bumped DB_VERSION multiple times, so an already-
// installed instance is exactly the case that can get silently stuck.
// onblocked plus a hard timeout turn that hang into a real, catchable
// error instead.
const DB_OPEN_TIMEOUT_MS = 4000;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      _dbPromise = null;
      reject(new Error("Couldn't open local storage — it's taking too long. Close any other open tabs or windows of this app (including a backgrounded installed copy) and reload."));
    }, DB_OPEN_TIMEOUT_MS);

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("patternChecks")) {
        // Every Pattern Check attempt, fully self-contained: the triad text
        // itself is stored on the record (not just a reference), since
        // AI-generated triads are one-off and never reproducible from a
        // static bank the way the authored fallback triads are.
        db.createObjectStore("patternChecks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("discoveries")) {
        // Evidence-gated insights about the user's own pattern-recognition,
        // computed by js/insights.js. Never mixed with raw attempts.
        db.createObjectStore("discoveries", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const db = req.result;
      // Don't let this tab go on to block a *future* version bump the same way.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      _dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      _dbPromise = null;
      reject(new Error("Couldn't open local storage — another open tab or window of this app (including a backgrounded installed copy) is running an older version. Close it, then reload this page."));
    };
  });
  return _dbPromise;
}

function tx(storeNames, mode) {
  return openDB().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async putMeta(key, value) {
    const t = await tx(["meta"], "readwrite");
    t.objectStore("meta").put({ key, value });
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },

  async getMeta(key, fallback = null) {
    const t = await tx(["meta"], "readonly");
    const rec = await reqToPromise(t.objectStore("meta").get(key));
    return rec ? rec.value : fallback;
  },

  async getAllMeta() {
    const t = await tx(["meta"], "readonly");
    return reqToPromise(t.objectStore("meta").getAll());
  },

  async addPatternCheck(check) {
    const t = await tx(["patternChecks"], "readwrite");
    t.objectStore("patternChecks").add(check);
    return new Promise((res, rej) => {
      t.oncomplete = () => res(check);
      t.onerror = () => rej(t.error);
    });
  },

  async getAllPatternChecks() {
    const t = await tx(["patternChecks"], "readonly");
    const all = await reqToPromise(t.objectStore("patternChecks").getAll());
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
  },

  async saveDiscoveries(discoveries) {
    const t = await tx(["discoveries"], "readwrite");
    const store = t.objectStore("discoveries");
    for (const d of discoveries) store.put(d);
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },

  async getAllDiscoveries() {
    const t = await tx(["discoveries"], "readonly");
    return reqToPromise(t.objectStore("discoveries").getAll());
  },

  async clearAll() {
    const stores = ["meta", "patternChecks", "discoveries"];
    const t = await tx(stores, "readwrite");
    for (const s of stores) t.objectStore(s).clear();
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },

  async replaceAll({ meta = [], patternChecks = [], discoveries = [] }) {
    const stores = ["meta", "patternChecks", "discoveries"];
    const t = await tx(stores, "readwrite");
    const ms = t.objectStore("meta");
    const ps = t.objectStore("patternChecks");
    const ds = t.objectStore("discoveries");
    for (const s of stores) t.objectStore(s).clear();
    for (const m of meta) ms.put(m);
    for (const p of patternChecks) ps.put(p);
    for (const d of discoveries) ds.put(d);
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
};
