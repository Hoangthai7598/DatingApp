/**
 * Fetches the next SHOWTIME_DAYS days of showtimes for the cinemas in lib/config.ts (CINEMAS),
 * from each chain (CGV, Lotte), and writes public/showtimes.json for the page.
 *
 *   npm run showtimes                 # writes public/showtimes.json
 *   npm run showtimes -- out.json     # custom output path
 *   npm run showtimes -- --probe      # print what each chain's endpoints return, write nothing
 *   npm run showtimes -- --strict     # exit 1 if nothing could be fetched
 *
 * Runs in GitHub Actions before every deploy, including a daily scheduled run. It never fails the build:
 * - if one chain fails, that chain's showtimes from the previous file are kept (if < SHOWTIMES_MAX_AGE_HOURS old);
 * - if everything fails, the previous file is kept, or an empty file with `error` is written,
 *   and the page falls back to picking a pick-up time.
 *
 * Endpoints are undocumented and used by the chains' own websites/apps; they may change without notice.
 *   CGV:   GET  {base}/api/cinema/list
 *          GET  {base}/cinemas/catalog_mobile/siteschedules/id/{cinemaId}/date/{DDMMYYYY}
 *   Lotte: POST https://www.lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx  (form field paramList = JSON)
 *          MethodName GetTicketingPageTOBE (cinemas), GetPlaySequence (schedule)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CINEMAS, SHOWTIME_DAYS, SHOWTIMES_MAX_AGE_HOURS, type CinemaChain, type CinemaConfig } from "../lib/config";
import {
  cgvDate,
  emptyShowtimes,
  isoDate,
  listCgvCinemas,
  listLotteCinemas,
  matchCinemaList,
  mergeShowtimes,
  parseCinemaSchedule,
  parseLotteSchedule,
  type ListedCinema,
  type MatchedCinema,
  type Show,
  type ShowMovie,
  type ShowtimesData,
} from "../lib/showtimes";

// Dates are Vietnam dates regardless of where this runs (GitHub runners are UTC).
process.env.TZ = process.env.TZ || "Asia/Ho_Chi_Minh";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const USER_AGENT = process.env.SHOWTIMES_USER_AGENT ?? process.env.CGV_USER_AGENT ?? BROWSER_UA;
const CGV_BASES = (process.env.CGV_BASE_URL ?? "https://www.cgv.vn/default,https://www.cgv.vn/en")
  .split(",")
  .map((b) => b.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const LOTTE_URL = process.env.LOTTE_URL ?? "https://www.lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx";
const LOTTE_LANG = process.env.LOTTE_LANG ?? "LL";

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const PROBE = args.includes("--probe");
const OUT = args.find((a) => !a.startsWith("--")) ?? "public/showtimes.json";
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const warn = (msg: string) => console.log(`::warning title=Showtimes::${msg}`);

async function request(url: string, init: RequestInit = {}, attempts = 3): Promise<unknown> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*", ...init.headers },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Not JSON (starts with: ${JSON.stringify(text.slice(0, 80))})`);
      }
    } catch (e) {
      last = e;
      if (i < attempts) await sleep(1000 * i);
    }
  }
  throw new Error(`${(last as Error)?.message ?? last}`);
}

/* ───────────────────────── chains ───────────────────────── */

interface Chain {
  name: CinemaChain;
  listCinemas(): Promise<ListedCinema[]>;
  schedule(cinema: MatchedCinema, day: Date): Promise<{ movies: ShowMovie[]; shows: Show[] }>;
  /** Raw responses for --probe. */
  probe(): Promise<Record<string, unknown>>;
}

function cgv(): Chain {
  let base = CGV_BASES[0];
  return {
    name: "cgv",
    async listCinemas() {
      let lastErr: unknown;
      for (const b of CGV_BASES) {
        try {
          const list = listCgvCinemas(await request(`${b}/api/cinema/list`));
          if (list.length) {
            base = b;
            console.log(`  CGV: using ${b}`);
            return list;
          }
          lastErr = new Error("empty cinema list");
        } catch (e) {
          lastErr = e;
          console.log(`  CGV: ${b} failed: ${(e as Error).message}`);
        }
      }
      throw lastErr;
    },
    async schedule(c, day) {
      const resp = await request(`${base}/cinemas/catalog_mobile/siteschedules/id/${encodeURIComponent(c.id)}/date/${cgvDate(day)}`);
      return parseCinemaSchedule(resp, c.key, isoDate(day));
    },
    async probe() {
      const out: Record<string, unknown> = {};
      for (const b of CGV_BASES) {
        try {
          out[`${b}/api/cinema/list`] = await request(`${b}/api/cinema/list`, {}, 1);
        } catch (e) {
          out[`${b}/api/cinema/list`] = `ERROR ${(e as Error).message}`;
        }
      }
      return out;
    },
  };
}

function lotte(): Chain {
  const common = { channelType: "HO", osType: "Chrome", osVersion: USER_AGENT, multiLanguageID: LOTTE_LANG };
  const call = (params: Record<string, unknown>, attempts = 3) =>
    request(
      LOTTE_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: "https://www.lottecinemavn.com/" },
        body: new URLSearchParams({ paramList: JSON.stringify({ ...common, ...params }) }).toString(),
      },
      attempts,
    );
  return {
    name: "lotte",
    async listCinemas() {
      return listLotteCinemas(await call({ MethodName: "GetTicketingPageTOBE", memberOnNo: "0" }));
    },
    async schedule(c, day) {
      const resp = await call({ MethodName: "GetPlaySequence", playDate: isoDate(day), cinemaID: c.id, representationMovieCode: "" });
      return parseLotteSchedule(resp, c.key, isoDate(day));
    },
    async probe() {
      const out: Record<string, unknown> = {};
      try {
        const cinemas = await call({ MethodName: "GetTicketingPageTOBE", memberOnNo: "0" }, 1);
        out.GetTicketingPageTOBE = cinemas;
        const first = matchCinemaList(listLotteCinemas(cinemas), CINEMAS.filter((c) => c.chain === "lotte")).found[0];
        if (first) {
          out[`GetPlaySequence ${first.id} ${isoDate(new Date())}`] = await call(
            { MethodName: "GetPlaySequence", playDate: isoDate(new Date()), cinemaID: first.id, representationMovieCode: "" },
            1,
          );
        }
      } catch (e) {
        out.error = (e as Error).message;
      }
      return out;
    },
  };
}

const CHAINS: Record<CinemaChain, () => Chain> = { cgv, lotte };

/* ───────────────────────── probe ───────────────────────── */

/** Short structural summary of a JSON value: keys, array lengths, first item. */
function describe(v: unknown, depth = 0): string {
  const pad = "  ".repeat(depth + 2);
  if (Array.isArray(v)) return `[${v.length} items]${v.length && depth < 4 ? `\n${pad}first: ${describe(v[0], depth + 1)}` : ""}`;
  if (v && typeof v === "object") {
    if (depth >= 4) return `{${Object.keys(v).slice(0, 15).join(", ")}}`;
    return `{\n${Object.entries(v as Record<string, unknown>)
      .slice(0, 25)
      .map(([k, x]) => `${pad}${k}: ${describe(x, depth + 1)}`)
      .join("\n")}\n${"  ".repeat(depth + 1)}}`;
  }
  return JSON.stringify(typeof v === "string" && v.length > 100 ? `${v.slice(0, 100)}…` : v);
}

async function probe() {
  for (const name of Object.keys(CHAINS) as CinemaChain[]) {
    console.log(`\n===== ${name.toUpperCase()} =====`);
    const out = await CHAINS[name]().probe();
    for (const [k, v] of Object.entries(out)) console.log(`\n--- ${k}\n${describe(v)}`);
  }
}

/* ───────────────────────── main ───────────────────────── */

async function readPrevious(): Promise<ShowtimesData | null> {
  try {
    const d = JSON.parse(await readFile(OUT, "utf8")) as ShowtimesData;
    return Array.isArray(d.shows) && Array.isArray(d.movies) ? d : null;
  } catch {
    return null;
  }
}

async function fetchChain(chain: Chain, configs: CinemaConfig[], today: Date) {
  console.log(`\n${chain.name.toUpperCase()}`);
  const list = await chain.listCinemas();
  const { found, missing, all } = matchCinemaList(list, configs);
  if (missing.length) warn(`${chain.name}: cinemas not found: ${missing.join(", ")}. Hà Nội cinemas listed: ${all.join("; ") || "(none)"}`);
  for (const c of found) console.log(`  ${c.key} → ${c.name} (id ${c.id})`);
  const parts: { movies: ShowMovie[]; shows: Show[] }[] = [];
  const errors: string[] = [];
  for (let i = 0; i < SHOWTIME_DAYS; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
    for (const c of found) {
      try {
        const part = await chain.schedule(c, day);
        parts.push(part);
        console.log(`  ${isoDate(day)} ${c.key}: ${part.shows.length} shows`);
      } catch (e) {
        errors.push(`${c.key} ${isoDate(day)}: ${(e as Error).message}`);
        console.log(`  ${isoDate(day)} ${c.key}: error ${(e as Error).message}`);
      }
      await sleep(DELAY_MS);
    }
  }
  return { found, parts, errors };
}

async function main() {
  if (PROBE) return probe();

  const today = new Date();
  const todayIso = isoDate(today);
  const previous = await readPrevious();
  const prevFresh =
    previous?.fetchedAt && Date.now() - Date.parse(previous.fetchedAt) < SHOWTIMES_MAX_AGE_HOURS * 3600_000 ? previous : null;

  const cinemas: ShowtimesData["cinemas"] = [];
  const parts: { movies: ShowMovie[]; shows: Show[] }[] = [];
  const problems: string[] = [];
  let anyFresh = false;

  for (const name of Object.keys(CHAINS) as CinemaChain[]) {
    const configs = CINEMAS.filter((c) => c.chain === name);
    if (!configs.length) continue;
    let ok = false;
    try {
      const r = await fetchChain(CHAINS[name](), configs, today);
      const shows = r.parts.reduce((n, p) => n + p.shows.length, 0);
      if (r.errors.length) warn(`${name}: ${r.errors.length} requests failed (first: ${r.errors[0]})`);
      if (shows > 0) {
        ok = anyFresh = true;
        parts.push(...r.parts);
        for (const c of r.found) cinemas.push({ key: c.key, label: c.label, name: c.name, ...(c.address ? { address: c.address } : {}) });
      } else {
        problems.push(`${name}: no showtimes${r.errors[0] ? ` (${r.errors[0]})` : ""}`);
      }
    } catch (e) {
      problems.push(`${name}: ${(e as Error).message}`);
    }

    if (!ok) {
      // Keep this chain's upcoming showtimes from the previous file, if it's recent enough.
      const keys = new Set(configs.map((c) => c.key));
      const keptShows = (prevFresh?.shows ?? []).filter((s) => keys.has(s.cinema) && s.date >= todayIso);
      if (keptShows.length) {
        const skus = new Set(keptShows.map((s) => s.sku));
        parts.push({ movies: (prevFresh?.movies ?? []).filter((m) => skus.has(m.sku)), shows: keptShows });
        cinemas.push(...(prevFresh?.cinemas ?? []).filter((c) => keys.has(c.key)));
        warn(`${name}: fetch failed, kept ${keptShows.length} showtimes from ${prevFresh?.fetchedAt}. ${problems.at(-1)}`);
      } else {
        warn(`${name}: fetch failed and no recent previous data. ${problems.at(-1)}`);
      }
    }
  }

  const merged = mergeShowtimes(parts);
  if (!merged.shows.length) {
    const msg = `No showtimes. ${problems.join(" | ")}`;
    warn(msg);
    if (!(previous && previous.shows.length)) await write(emptyShowtimes(msg));
    else console.log(`Keeping existing ${OUT} unchanged.`);
    process.exit(STRICT ? 1 : 0);
  }

  await write({
    fetchedAt: anyFresh ? new Date().toISOString() : (prevFresh?.fetchedAt ?? null),
    source: [...new Set(cinemas.map((c) => CINEMAS.find((x) => x.key === c.key)?.chain.toUpperCase()))].filter(Boolean).join(", "),
    ...(problems.length ? { error: problems.join(" | ") } : {}),
    cinemas,
    movies: merged.movies.filter((m) => merged.shows.some((s) => s.sku === m.sku)),
    shows: merged.shows,
  });
  console.log(`\nWrote ${OUT}: ${merged.movies.length} movies, ${merged.shows.length} shows from ${cinemas.map((c) => c.key).join(", ")}.`);
}

async function write(data: ShowtimesData) {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
}

main().catch(async (e) => {
  warn(`Unexpected error: ${(e as Error).message}`);
  if (!(await readPrevious())) await write(emptyShowtimes(`Unexpected error: ${(e as Error).message}`));
  process.exit(STRICT ? 1 : 0);
});
