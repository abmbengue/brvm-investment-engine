/**
 * Client-side internal market database (IndexedDB with memory fallback).
 * Stores normalized historical bars for the Predictor — never labeled LIVE.
 */

const DB_NAME = 'brvm-internal-market-db';
const DB_VERSION = 1;
const STORE = 'bars';
const META = 'meta';
const MEMORY_KEY = 'brvm-internal-db-v1';

/** In-process fallback when IndexedDB/localStorage unavailable (tests / SSR). */
let memoryState = { bars: [], meta: {} };

function canUseIDB() {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('symbol', 'symbol', { unique: false });
        s.createIndex('date', 'date', { unique: false });
        s.createIndex('symbol_date', ['symbol', 'date'], { unique: true });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function memoryLoad() {
  if (typeof localStorage !== 'undefined') {
    try {
      return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{"bars":[],"meta":{}}');
    } catch {
      return { bars: [], meta: {} };
    }
  }
  return memoryState;
}

function memorySave(bars, meta) {
  memoryState = { bars, meta };
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify({ bars, meta }));
  } catch {
    /* ignore */
  }
}

/** Test helper */
export function __resetMemoryDbForTests() {
  memoryState = { bars: [], meta: {} };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(MEMORY_KEY);
    } catch {
      /* ignore */
    }
  }
}

function barId(bar) {
  return `${bar.symbol}|${bar.date}`;
}

/**
 * Upsert normalized bars into the internal DB.
 * @param {import('./types.js').NormalizedBar[]} bars
 * @param {object} metaPatch
 */
export async function upsertBars(bars, metaPatch = {}) {
  const cleaned = (bars || [])
    .filter((b) => b && b.symbol && b.date && b.close > 0)
    .map((b) => ({ ...b, id: barId(b) }));

  if (!canUseIDB()) {
    const mem = memoryLoad();
    const map = new Map(mem.bars.map((b) => [b.id || barId(b), b]));
    for (const b of cleaned) map.set(b.id, b);
    const nextBars = [...map.values()];
    const meta = { ...mem.meta, ...metaPatch, rowCount: nextBars.length, updatedAt: new Date().toISOString() };
    memorySave(nextBars, meta);
    return meta;
  }

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, META], 'readwrite');
    const store = tx.objectStore(STORE);
    for (const b of cleaned) store.put(b);
    const metaStore = tx.objectStore(META);
    metaStore.get('summary').onsuccess = (ev) => {
      const prev = ev.target.result?.value || {};
      metaStore.put({
        key: 'summary',
        value: {
          ...prev,
          ...metaPatch,
          updatedAt: new Date().toISOString(),
        },
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const summary = await getDbSummary();
  return summary;
}

export async function getAllBars() {
  if (!canUseIDB()) {
    return memoryLoad().bars;
  }
  const db = await openDb();
  const bars = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return bars;
}

export async function getDbSummary() {
  if (!canUseIDB()) {
    const mem = memoryLoad();
    const symbols = [...new Set(mem.bars.map((b) => b.symbol))];
    return {
      ...(mem.meta || {}),
      rowCount: mem.bars.length,
      symbolCount: symbols.length,
      symbols,
    };
  }
  const db = await openDb();
  const summary = await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, META], 'readonly');
    const metaReq = tx.objectStore(META).get('summary');
    const countReq = tx.objectStore(STORE).getAll();
    let meta = {};
    let bars = [];
    metaReq.onsuccess = () => {
      meta = metaReq.result?.value || {};
    };
    countReq.onsuccess = () => {
      bars = countReq.result || [];
    };
    tx.oncomplete = () => {
      const symbols = [...new Set(bars.map((b) => b.symbol))].sort();
      resolve({
        ...meta,
        rowCount: bars.length,
        symbolCount: symbols.length,
        symbols,
      });
    };
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return summary;
}

export async function clearInternalDb() {
  if (!canUseIDB()) {
    memorySave([], {});
    return;
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, META], 'readwrite');
    tx.objectStore(STORE).clear();
    tx.objectStore(META).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
