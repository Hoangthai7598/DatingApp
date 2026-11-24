/**
 * Showtimes proxy (Cloudflare Worker). The page can't read CGV/Lotte directly (no CORS headers),
 * so it calls this Worker, which calls them and adds CORS headers.
 *
 * Locked down on purpose:
 * - only the showtime endpoints below, with validated parameters (not an open proxy);
 * - Lotte: only GetTicketingPageTOBE / GetPlaySequence; the body is rebuilt from validated fields;
 * - browser requests only from ALLOWED_ORIGINS;
 * - responses cached for CACHE_SECONDS, so each schedule is fetched from the cinema at most once per period.
 *
 *   GET  /cgv/{default|en}/api/cinema/list
 *   GET  /cgv/{default|en}/cinemas/catalog_mobile/siteschedules/id/{id}/date/{DDMMYYYY}
 *   POST /lotte            form field paramList = JSON (same as Lotte's own site)
 *   GET  /health
 */

export interface Env {
  /** Comma-separated origins allowed to call the proxy, e.g. "https://hoangthai7598.github.io,http://localhost:3000". */
  ALLOWED_ORIGINS?: string;
  CACHE_SECONDS?: string;
}

/** Subset of the Workers Cache API we use (caches.default). */
export interface CacheLike {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}

export interface Deps {
  fetch: typeof fetch;
  cache?: CacheLike;
  /** Let a cache write finish after the response is sent (ctx.waitUntil). */
  waitUntil?: (p: Promise<unknown>) => void;
}

const CGV = "https://www.cgv.vn";
const LOTTE = "https://www.lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const CGV_LIST = /^\/cgv\/(default|en)\/api\/cinema\/list$/;
const CGV_SCHEDULE = /^\/cgv\/(default|en)\/cinemas\/catalog_mobile\/siteschedules\/id\/([A-Za-z0-9_-]{1,20})\/date\/(\d{8})$/;

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const ok = origin && allowedOrigins(env).includes(origin);
  return ok
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });

/** Validate a Lotte paramList and rebuild it with only the fields we allow. */
export function sanitizeLotte(paramList: string | null): Record<string, string> | null {
  if (!paramList || paramList.length > 2000) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(paramList);
  } catch {
    return null;
  }
  const base = { channelType: "HO", osType: "Chrome", osVersion: UA, multiLanguageID: typeof p.multiLanguageID === "string" && /^[A-Z]{2}$/.test(p.multiLanguageID) ? p.multiLanguageID : "LL" };
  if (p.MethodName === "GetTicketingPageTOBE") return { ...base, MethodName: "GetTicketingPageTOBE", memberOnNo: "0" };
  if (
    p.MethodName === "GetPlaySequence" &&
    typeof p.playDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.playDate) &&
    typeof p.cinemaID === "string" &&
    /^\d{1,3}\|\d{1,6}\|\d{1,8}$/.test(p.cinemaID)
  ) {
    return { ...base, MethodName: "GetPlaySequence", playDate: p.playDate, cinemaID: p.cinemaID, representationMovieCode: "" };
  }
  return null;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin, env);

  if (req.method === "OPTIONS") return new Response(null, { status: origin && cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
  // Browsers always send Origin on cross-site requests: refuse other sites. (No Origin = curl/testing, allowed.)
  if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin not allowed" }, 403, cors);
  if (url.pathname === "/health") return json({ ok: true }, 200, cors);

  let upstream: Request;
  let cacheKey: Request;
  const list = url.pathname.match(CGV_LIST);
  const sched = url.pathname.match(CGV_SCHEDULE);

  if (req.method === "GET" && (list || sched)) {
    const path = list ? `/${list[1]}/api/cinema/list` : `/${sched![1]}/cinemas/catalog_mobile/siteschedules/id/${sched![2]}/date/${sched![3]}`;
    upstream = new Request(`${CGV}${path}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
    cacheKey = new Request(`https://showtimes-cache.local/cgv${path}`);
  } else if (req.method === "POST" && url.pathname === "/lotte") {
    const form = new URLSearchParams(await req.text());
    const params = sanitizeLotte(form.get("paramList"));
    if (!params) return json({ error: "bad paramList" }, 400, cors);
    const body = new URLSearchParams({ paramList: JSON.stringify(params) }).toString();
    upstream = new Request(LOTTE, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: "https://www.lottecinemavn.com",
        Referer: "https://www.lottecinemavn.com/",
      },
      body,
    });
    cacheKey = new Request(`https://showtimes-cache.local/lotte/${await sha256(body)}`);
  } else {
    return json({ error: "not found" }, 404, cors);
  }

  const ttl = Math.max(60, Number(env.CACHE_SECONDS) || 1800);
  const hit = await deps.cache?.match(cacheKey);
  if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...cors, "X-Proxy-Cache": "HIT" } });

  let res: Response;
  try {
    res = await deps.fetch(upstream, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    return json({ error: `upstream unreachable: ${(e as Error).message}` }, 502, cors);
  }
  const text = await res.text();
  const isJson = (() => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  })();
  if (!res.ok || !isJson) {
    // Pass the reason through (e.g. 403 = the cinema blocked this Worker's IP), but never cache it.
    return json({ error: `upstream ${res.status}${isJson ? "" : " (not JSON)"}`, sample: text.slice(0, 120) }, 502, cors);
  }

  const out = new Response(text, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${ttl}` },
  });
  if (deps.cache) {
    const put = deps.cache.put(cacheKey, out.clone());
    if (deps.waitUntil) deps.waitUntil(put);
    else await put;
  }
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, "X-Proxy-Cache": "MISS" } });
}
