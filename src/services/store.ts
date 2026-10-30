// Demo data layer: one shared dataset, persisted to localStorage.
// Swap this module for authenticated API calls when a backend exists.
import { useSyncExternalStore } from "react";
import type { DB } from "@/types/models";
import { buildSeed } from "@/data/demo/seed";

const KEY = "renda-ops-demo-v1";
const listeners = new Set<() => void>();

function load(): DB {
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* fall through to seed */
  }
  return buildSeed();
}

let state: DB = load();

export function getState() {
  return state;
}

export function setState(mutator: (draft: DB) => void) {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full — keep in memory */
    }
  }
  listeners.forEach((l) => l());
}

export function resetDemo() {
  state = buildSeed();
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getState, getState);
}
