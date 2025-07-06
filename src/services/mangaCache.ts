import type { MangaMeta } from "../adapters/Adapter";

// A very small in-memory cache keyed by <source>|<search>.
// The cache only lives for the lifetime of the Electron main process, which is
// good enough to avoid hammering the API during a dev session.
//
// We evict entries after a TTL so stale data will eventually refresh.

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Entry {
  data: MangaMeta[];
  timestamp: number;
}

const store = new Map<string, Entry>();

function makeKey(sourceId: string, search: string | undefined): string {
  return `${sourceId}|${(search ?? "").trim().toLowerCase()}`;
}

export function get(sourceId: string, search?: string): MangaMeta[] | undefined {
  const key = makeKey(sourceId, search);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

export function set(sourceId: string, search: string | undefined, data: MangaMeta[]): void {
  const key = makeKey(sourceId, search);
  store.set(key, { data, timestamp: Date.now() });
} 