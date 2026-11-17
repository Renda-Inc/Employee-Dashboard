// Operations dataset cache. React reads a synchronous snapshot (`useDB`); loading and saving go
// through an `OperationsRepository`, so the storage behind it can change without touching pages.
import { useSyncExternalStore } from "react";
import type { DB } from "@/types/models";
import type { OperationsRepository } from "./contracts/operations";
import { buildSeed } from "@/data/demo/seed";

const KEY = "renda-ops-demo-v1";

/** Demo repository: the dataset lives in this browser's localStorage. */
export const localStorageRepository: OperationsRepository = {
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DB;
        if (parsed.version === 4) return parsed;
      }
    } catch {
      /* fall through to seed */
    }
    return buildSeed();
  },
  async save(db) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* storage full, keep in memory */
    }
  },
  async reset() {
    window.localStorage.removeItem(KEY);
    return buildSeed();
  },
};

const repository: OperationsRepository = localStorageRepository;
const listeners = new Set<() => void>();
let state: DB | null = null;
let loading: Promise<void> | null = null;
let loaded = false;

const notify = () => listeners.forEach((l) => l());

/** Loads the dataset once per page load. The employee workspace gate awaits this before rendering. */
export function loadOperations(): Promise<void> {
  loading ??= repository.load().then((db) => {
    state = db;
    loaded = true;
    notify();
  });
  return loading;
}

export function getState(): DB {
  state ??= buildSeed();
  return state;
}

/**
 * Applies a change to the snapshot, notifies subscribers and persists it. Changes made before the
 * dataset has loaded (such as clearing the session on sign-out) stay in memory so they can't
 * overwrite saved records.
 */
export function setState(mutator: (draft: DB) => void) {
  const draft = structuredClone(getState());
  mutator(draft);
  state = draft;
  if (loaded) void repository.save(draft);
  notify();
}

export async function resetState() {
  state = await repository.reset();
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getState, getState);
}
