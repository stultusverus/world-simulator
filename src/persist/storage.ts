import { SAVE_VERSION } from '../config';
import type { GameSave, SaveMeta } from '../sim/save-types';

const DB_NAME = 'worldsmith';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export const AUTOSAVE_SLOT = 'autosave';
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'] as const;

interface StoredRecord {
  slot: string;
  save: GameSave;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, GameSave>();
export type StorageStatus = 'pending' | 'persistent' | 'temporary';
let storageStatus: StorageStatus = 'pending';

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const fallback = (): void => {
        storageStatus = 'temporary';
        resolve(null);
      };
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        fallback();
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
        }
      };
      request.onsuccess = () => {
        // A blocked request can succeed later; keep the selected memory backend.
        if (storageStatus === 'temporary') {
          request.result.close();
          return;
        }
        storageStatus = 'persistent';
        resolve(request.result);
      };
      request.onerror = fallback;
      request.onblocked = fallback;
    });
  }
  return dbPromise;
}

function metaFor(slot: string, save: GameSave): SaveMeta {
  let population = 0;
  for (let i = 0; i < save.agents.alive.length; i += 1) {
    if (save.agents.alive[i] === 1) population += 1;
  }
  return {
    slot,
    year: save.world.tick,
    population,
    factions: save.civs.filter((civ) => civ.alive).length,
    size: save.size,
    savedAt: save.savedAt,
  };
}

export function getStorageStatus(): StorageStatus {
  return storageStatus;
}

export async function initializeStorage(): Promise<StorageStatus> {
  await openDb();
  return storageStatus;
}

export function isPersistentStorage(): boolean {
  return storageStatus === 'persistent';
}

export function slotLabel(slot: string): string {
  if (slot === AUTOSAVE_SLOT) return 'Autosave';
  if (slot === 'slot1') return 'Slot I';
  if (slot === 'slot2') return 'Slot II';
  if (slot === 'slot3') return 'Slot III';
  return slot;
}

export async function saveToSlot(slot: string, save: GameSave): Promise<SaveMeta> {
  if (save.version !== SAVE_VERSION) throw new Error('Save version mismatch');
  const db = await openDb();
  if (!db) {
    memory.set(slot, save);
    return metaFor(slot, save);
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ slot, save } satisfies StoredRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Save failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Save aborted'));
  });
  return metaFor(slot, save);
}

export async function readFromSlot(slot: string): Promise<GameSave | null> {
  const db = await openDb();
  if (!db) return memory.get(slot) ?? null;
  const record = await new Promise<StoredRecord | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(slot);
    request.onsuccess = () => resolve((request.result as StoredRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Read failed'));
  });
  if (!record) return null;
  if (record.save.version !== SAVE_VERSION) {
    throw new Error('This save was created by an incompatible version.');
  }
  return record.save;
}

export async function deleteSlot(slot: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.delete(slot);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(slot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Delete failed'));
  });
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await openDb();
  let records: StoredRecord[];
  if (!db) {
    records = [...memory.entries()].map(([slot, save]) => ({ slot, save }));
  } else {
    records = await new Promise<StoredRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        resolve(((request.result as StoredRecord[] | undefined) ?? []).filter(Boolean));
      };
      request.onerror = () => reject(request.error ?? new Error('List failed'));
    });
  }
  return records.map((record) => metaFor(record.slot, record.save)).sort((a, b) => b.savedAt - a.savedAt);
}
