/* Minimal IndexedDB wrapper. Everything stays on-device. */

const DB_NAME = "third-position-db";
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("responses")) {
        const store = db.createObjectStore("responses", { keyPath: "id" });
        store.createIndex("dilemmaId", "dilemmaId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("discoveries")) {
        db.createObjectStore("discoveries", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  async addResponse(response) {
    const t = await tx(["responses"], "readwrite");
    t.objectStore("responses").add(response);
    return new Promise((res, rej) => {
      t.oncomplete = () => res(response);
      t.onerror = () => rej(t.error);
    });
  },

  async getAllResponses() {
    const t = await tx(["responses"], "readonly");
    const all = await reqToPromise(t.objectStore("responses").getAll());
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
  },

  async deleteResponse(id) {
    const t = await tx(["responses"], "readwrite");
    t.objectStore("responses").delete(id);
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },

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
    const t = await tx(["responses", "meta", "discoveries"], "readwrite");
    t.objectStore("responses").clear();
    t.objectStore("meta").clear();
    t.objectStore("discoveries").clear();
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },

  async replaceAll({ responses = [], meta = [], discoveries = [] }) {
    const t = await tx(["responses", "meta", "discoveries"], "readwrite");
    const rs = t.objectStore("responses");
    const ms = t.objectStore("meta");
    const ds = t.objectStore("discoveries");
    rs.clear();
    ms.clear();
    ds.clear();
    for (const r of responses) rs.put(r);
    for (const m of meta) ms.put(m);
    for (const d of discoveries) ds.put(d);
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
};
