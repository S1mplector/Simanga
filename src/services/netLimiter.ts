const DEFAULT_MAX_RPS = 2;
const INITIAL_BACKOFF_MS = 5_000; // 5s
const MAX_BACKOFF_MS = 5 * 60_000; // 5 min

// Per-adapter state
const windowStartMap = new Map<string, number>();
const requestCountMap = new Map<string, number>();
const backoffUntilMap = new Map<string, number>();
const currentBackoffMap = new Map<string, number>();
const adapterRates = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function setRate(adapter: string, rps: number) {
  if (!adapter) return;
  adapterRates.set(adapter, Math.max(1, Math.floor(rps)));
}

export async function acquire(adapter: string = "__default__") {
  const rate = adapterRates.get(adapter) ?? DEFAULT_MAX_RPS;

  // respect backoff (per adapter)
  const now = Date.now();
  const backoffUntil = backoffUntilMap.get(adapter) || 0;
  if (now < backoffUntil) {
    await sleep(backoffUntil - now);
  }

  while (true) {
    const now2 = Date.now();
    const windowStart = windowStartMap.get(adapter) || now2;
    let requestCount = requestCountMap.get(adapter) || 0;

    if (now2 - windowStart >= 1000) {
      windowStartMap.set(adapter, now2);
      requestCount = 0;
    }

    if (requestCount < rate) {
      requestCountMap.set(adapter, requestCount + 1);
      return;
    }
    // Sleep until the end of the current window
    await sleep(windowStart + 1000 - now2 + 1);
  }
}

export function noteSuccess(adapter: string = "__default__") {
  const current = currentBackoffMap.get(adapter) ?? INITIAL_BACKOFF_MS;
  if (current > INITIAL_BACKOFF_MS) {
    currentBackoffMap.set(adapter, INITIAL_BACKOFF_MS);
  }
}

export function noteRateLimit(adapter: string = "__default__") {
  const now = Date.now();
  const current = currentBackoffMap.get(adapter) ?? INITIAL_BACKOFF_MS;
  backoffUntilMap.set(adapter, now + current);
  currentBackoffMap.set(adapter, Math.min(current * 2, MAX_BACKOFF_MS));
}

export default { acquire, noteSuccess, noteRateLimit }; 