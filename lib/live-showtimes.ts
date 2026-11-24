/**
 * Fetch showtimes live from CGV/Lotte when she opens "Xem phim".
 *
 * Browsers only let the page read a cross-site response if the site sends CORS headers,
 * and CGV/Lotte don't. So the page calls our Cloudflare Worker (worker/), which calls them
 * and adds CORS headers. Without a proxy configured it tries the cinemas directly (blocked by CORS).
 * Any failure falls back to public/showtimes.json. Turn it off with LIVE_SHOWTIMES = false in lib/config.ts.
 */
import type { CinemaConfig } from "./config";
import {
  cgvDate,
  isoDate,
  listCgvCinemas,
  listLotteCinemas,
  matchCinemaList,
  mergeShowtimes,
  parseCinemaSchedule,
  parseLotteSchedule,
  type MatchedCinema,
  type Show,
  type ShowMovie,
  type ShowtimesData,
} from "./showtimes";

export const CGV_BASES = ["https://www.cgv.vn/default", "https://www.cgv.vn/en"];
export const LOTTE_URL = "https://www.lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx";

interface LiveOptions {
  cinemas: CinemaConfig[];
  /** Base URL of the showtimes proxy (worker/), e.g. https://moi-thuy-showtimes.<you>.workers.dev. Empty = call cinemas directly. */
  proxy?: string;
  days: number;
  today?: Date;
  fetchImpl?: typeof fetch;
  /** Max parallel schedule requests. */
  concurrency?: number;
  timeoutMs?: number;
}

export interface LiveResult {
  data: ShowtimesData | null;
  /** One line per chain explaining what happened (shown in the console). */
  log: string[];
}

type Part = { movies: ShowMovie[]; shows: Show[] };

async function getJson(doFetch: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const res = await doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Run tasks with limited parallelism, keeping successes and collecting errors. */
async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<{ ok: T[]; errors: string[] }> {
  const ok: T[] = [];
  const errors: string[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (i < tasks.length) {
        const t = tasks[i++];
        try {
          ok.push(await t());
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
    }),
  );
  return { ok, errors };
}

const dates = (today: Date, days: number) =>
  Array.from({ length: days }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12));

/** Try one chain: list cinemas first (fails fast if blocked), then fetch each cinema × day. */
async function chain(
  name: "cgv" | "lotte",
  opts: Required<Pick<LiveOptions, "days" | "concurrency" | "timeoutMs" | "proxy">> & { cinemas: CinemaConfig[]; today: Date; fetchImpl: typeof fetch },
): Promise<{ parts: Part[]; found: MatchedCinema[]; note: string }> {
  const configs = opts.cinemas.filter((c) => c.chain === name);
  if (!configs.length) return { parts: [], found: [], note: `${name}: no cinemas configured` };
  const f = opts.fetchImpl;

  let found: MatchedCinema[] = [];
  let schedule: (c: MatchedCinema, d: Date) => Promise<Part>;

  if (name === "cgv") {
    let base = "";
    let lastErr = "";
    // Through the proxy: /cgv/{default|en}/… ; directly: https://www.cgv.vn/{default|en}/…
    const bases = opts.proxy ? CGV_BASES.map((b) => `${opts.proxy}/cgv/${b.split("/").pop()}`) : CGV_BASES;
    for (const b of bases) {
      try {
        found = matchCinemaList(listCgvCinemas(await getJson(f, `${b}/api/cinema/list`, {}, opts.timeoutMs)), configs).found;
        if (found.length) {
          base = b;
          break;
        }
      } catch (e) {
        lastErr = (e as Error).message;
      }
    }
    if (!base) return { parts: [], found: [], note: `cgv: blocked or unavailable (${lastErr || "no cinemas matched"})` };
    schedule = async (c, d) =>
      parseCinemaSchedule(
        await getJson(f, `${base}/cinemas/catalog_mobile/siteschedules/id/${encodeURIComponent(c.id)}/date/${cgvDate(d)}`, {}, opts.timeoutMs),
        c.key,
        isoDate(d),
      );
  } else {
    const call = (params: Record<string, unknown>) =>
      getJson(
        f,
        opts.proxy ? `${opts.proxy}/lotte` : LOTTE_URL,
        {
          method: "POST",
          // A plain form POST: no CORS preflight, but the response is still unreadable without CORS headers.
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: new URLSearchParams({
            paramList: JSON.stringify({ channelType: "HO", osType: "Chrome", osVersion: navigatorUA(), multiLanguageID: "LL", ...params }),
          }).toString(),
        },
        opts.timeoutMs,
      );
    try {
      found = matchCinemaList(listLotteCinemas(await call({ MethodName: "GetTicketingPageTOBE", memberOnNo: "0" })), configs).found;
    } catch (e) {
      return { parts: [], found: [], note: `lotte: blocked or unavailable (${(e as Error).message})` };
    }
    if (!found.length) return { parts: [], found: [], note: "lotte: no cinemas matched" };
    schedule = async (c, d) =>
      parseLotteSchedule(await call({ MethodName: "GetPlaySequence", playDate: isoDate(d), cinemaID: c.id, representationMovieCode: "" }), c.key, isoDate(d));
  }

  const tasks = dates(opts.today, opts.days).flatMap((d) => found.map((c) => () => schedule(c, d)));
  const { ok, errors } = await pool(tasks, opts.concurrency);
  const shows = ok.reduce((n, p) => n + p.shows.length, 0);
  return { parts: ok, found, note: `${name}: ${shows} shows from ${found.map((c) => c.key).join(", ")}${errors.length ? `, ${errors.length} errors` : ""}` };
}

const navigatorUA = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

/** Fetch live showtimes from every chain in the browser. Returns null data if nothing could be read. */
export async function fetchLiveShowtimes(opts: LiveOptions): Promise<LiveResult> {
  const o = {
    cinemas: opts.cinemas,
    proxy: (opts.proxy ?? "").replace(/\/+$/, ""),
    days: opts.days,
    today: opts.today ?? new Date(),
    fetchImpl: opts.fetchImpl ?? fetch.bind(globalThis),
    concurrency: opts.concurrency ?? 6,
    timeoutMs: opts.timeoutMs ?? 8000,
  };
  const names = ["cgv", "lotte"] as const;
  const results = await Promise.all(
    names.map((n) => chain(n, o).catch((e) => ({ parts: [] as Part[], found: [] as MatchedCinema[], note: `${n}: ${(e as Error).message}` }))),
  );
  const log = results.map((r) => r.note);
  const ok = results.map((r) => r.parts.some((p) => p.shows.length > 0));
  const merged = mergeShowtimes(results.filter((_, i) => ok[i]).flatMap((r) => r.parts));
  if (!merged.shows.length) return { data: null, log };
  const found = results.filter((_, i) => ok[i]).flatMap((r) => r.found);
  return {
    data: {
      fetchedAt: new Date().toISOString(),
      source: names.filter((_, i) => ok[i]).map((n) => n.toUpperCase()).join(", "),
      cinemas: found.map((c) => ({ key: c.key, label: c.label, name: c.name, ...(c.address ? { address: c.address } : {}) })),
      movies: merged.movies,
      shows: merged.shows,
    },
    log,
  };
}

/**
 * Live data for the cinemas that worked, plus the static file's data for the others
 * (e.g. CGV live works but Lotte is blocked: keep Lotte from public/showtimes.json).
 */
export function combineShowtimes(live: ShowtimesData, fallback: ShowtimesData | null): ShowtimesData {
  const liveKeys = new Set(live.shows.map((s) => s.cinema));
  const keep = (fallback?.shows ?? []).filter((s) => !liveKeys.has(s.cinema));
  const keptSkus = new Set(keep.map((s) => s.sku));
  const merged = mergeShowtimes([live, { movies: (fallback?.movies ?? []).filter((m) => keptSkus.has(m.sku)), shows: keep }]);
  const sources = [live.source, ...(keep.length ? [fallback?.source ?? ""] : [])].join(", ").split(/,\s*/).filter(Boolean);
  return {
    ...live,
    source: [...new Set(sources.map((x) => x.toUpperCase()))].join(", "),
    cinemas: [...live.cinemas, ...(fallback?.cinemas ?? []).filter((c) => !liveKeys.has(c.key))],
    movies: merged.movies,
    shows: merged.shows,
  };
}
