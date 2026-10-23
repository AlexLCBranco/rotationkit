// Polite JSON fetching for NBA endpoints: browser-like headers, timeout,
// retries with exponential backoff, and a fixed delay between requests.

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Cloud sessions route HTTPS through a proxy; Node's fetch ignores HTTPS_PROXY by default.
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());

export const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];
export const REQUEST_GAP_MS = 600;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function once(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const err = e as Error & { cause?: Error };
    const msg = err.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS / 1000}s` : `${err.message} ${err.cause?.message ?? ''}`.trim();
    throw new FetchError(msg);
  }
  const text = await res.text();
  if (!res.ok) throw new FetchError(`HTTP ${res.status} ${text.replace(/\s+/g, " ").slice(0, 120)}`.trim(), res.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new FetchError(`non-JSON body: ${text.slice(0, 120)}`, res.status);
  }
}

/** Fetch JSON with retries. 403/404 are not retried (policy block / missing resource). */
export async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(url);
    } catch (e) {
      const err = e as FetchError;
      const retryable = err.status !== 403 && err.status !== 404;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!retryable || delay === undefined) throw err;
      console.warn(`  retry ${attempt + 1} in ${delay / 1000}s: ${url} (${err.message})`);
      await sleep(delay);
    }
  }
}
