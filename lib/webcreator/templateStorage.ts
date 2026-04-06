/**
 * Standalone IndexedDB-based template storage for GrapesJS.
 * Replaces grapesjs-template-manager which is incompatible with GrapesJS v0.22+.
 */

const DB_NAME = "volkern-templates";
const DB_VERSION = 1;
const STORE_NAME = "templates";

export interface TemplateRecord {
  idx: string;
  id: string; // user-visible name
  html: string;
  css: string;
  projectData: Record<string, unknown>;
  thumbnail: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "idx" });
      }
    };
  });
}

export async function saveTemplate(record: TemplateRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllTemplates(): Promise<TemplateRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as TemplateRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTemplate(idx: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(idx);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getTemplateById(id: string): Promise<TemplateRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const templates = req.result as TemplateRecord[];
      const template = templates.find(t => t.id === id);
      resolve(template || null);
    };
    req.onerror = () => reject(req.error);
  });
}
