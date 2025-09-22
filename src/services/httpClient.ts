import { fetchWithRateLimit, NetworkError } from "./adapterUtils";
import settingsStore from "./settings";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import logger from "./logger";

export type HttpRequestOptions = {
  headers?: Record<string, string>;
  timeout?: number; // ms
  adapterName: string; // for metrics/logging context
  useProxy?: boolean; // override per-request; defaults from settings
  cookieHeader?: string; // optional Cookie header
  referer?: string;
  agentOverride?: any; // provide a custom agent if needed
};

function buildDefaultHeaders(referer?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
  };
  if (referer) headers["Referer"] = referer;
  return headers;
}

function pickProxyAgent(): any | undefined {
  try {
    const proxies: string[] = settingsStore.get("proxies") || [];
    if (!proxies || proxies.length === 0) return undefined;
    const url = proxies[0];
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new HttpsProxyAgent(url);
    }
    if (url.startsWith("socks://") || url.startsWith("socks5://")) {
      return new SocksProxyAgent(url);
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to construct proxy agent");
  }
  return undefined;
}

export async function httpGet(url: string, opts: HttpRequestOptions) {
  const { headers = {}, timeout = 20000, adapterName, useProxy, cookieHeader, referer, agentOverride } = opts;

  const finalHeaders: Record<string, string> = {
    ...buildDefaultHeaders(referer),
    ...headers,
  };
  if (cookieHeader) finalHeaders["Cookie"] = cookieHeader;

  const globalProxyEnabled = Boolean(settingsStore.get("mangafireProxyEnabled") || settingsStore.get("nhentaiProxyEnabled") || settingsStore.get("asmhentaiProxyEnabled") || settingsStore.get("hitomiProxyEnabled"));
  const shouldUseProxy = typeof useProxy === "boolean" ? useProxy : globalProxyEnabled;
  const agent = agentOverride || (shouldUseProxy ? pickProxyAgent() : undefined);

  try {
    const res = await fetchWithRateLimit(
      url,
      {
        headers: finalHeaders,
        timeout,
        // @ts-ignore agent is node-only
        agent,
      },
      adapterName
    );
    return res;
  } catch (e: any) {
    // surface additional context
    const status = e?.statusCode;
    logger.warn({ url, status, adapterName, err: e }, "httpGet failed");
    throw e instanceof NetworkError ? e : new NetworkError(e?.message || "HTTP error");
  }
}
