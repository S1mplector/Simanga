const MAX_REQUESTS_PER_SECOND = 2;
const INITIAL_BACKOFF_MS = 5_000; // 5s
const MAX_BACKOFF_MS = 5 * 60_000; // 5 min

let windowStart = Date.now();
let requestCount = 0;
let backoffUntil = 0;
let currentBackoff = INITIAL_BACKOFF_MS;

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function acquire() {
  // respect backoff
  const now = Date.now();
  if (now < backoffUntil) {
    await sleep(backoffUntil - now);
  }

  while (true) {
    const now2 = Date.now();
    if (now2 - windowStart >= 1000) {
      windowStart = now2;
      requestCount = 0;
    }

    if (requestCount < MAX_REQUESTS_PER_SECOND) {
      requestCount += 1;
      return;
    }
    await sleep(windowStart + 1000 - now2 + 1);
  }
}

export function noteSuccess() {
  if (currentBackoff > INITIAL_BACKOFF_MS) {
    currentBackoff = INITIAL_BACKOFF_MS;
  }
}

export function noteRateLimit() {
  const now = Date.now();
  backoffUntil = now + currentBackoff;
  currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
}

export default { acquire, noteSuccess, noteRateLimit }; 