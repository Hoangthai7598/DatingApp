/**
 * Fetches the next SHOWTIME_DAYS days of showtimes for the cinemas in lib/config.ts (CINEMAS)
 * from CGV's public mobile endpoints, and writes public/showtimes.json for the page.
 *
 *   npm run showtimes              # writes public/showtimes.json
 *   npm run showtimes -- out.json  # custom output path
 *
 * Runs in GitHub Actions before every deploy, including a daily scheduled run.
 * It never fails the build: on errors it writes an empty file with `error` set, and the page
 * falls back to picking a pick-up time. Pass --strict to exit 1 instead (for debugging).
 *
 * Endpoints (undocumented, used by CGV's own mobile site; may change without notice):
 *   GET {BASE}/api/cinema/list
 *   GET {BASE}/cinemas/catalog_mobile/siteschedules/id/{cinemaId}/date/{DDMMYYYY}
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CINEMAS, SHOWTIME_DAYS } from "../lib/config";
import {
  cgvDate,
  emptyShowtimes,
  isoDate,
  matchCinemas,
  mergeShowtimes,
  parseCinemaSchedule,
  type ShowtimesData,
} from "../lib/showtimes";

// Dates are Vietnam dates regardless of where this runs (GitHub runners are UTC).
process.env.TZ = process.env.TZ || "Asia/Ho_Chi_Minh";

const BASE = (process.env.CGV_BASE_URL ?? "https://www.cgv.vn/en").replace(/\/+$/, "");
const USER_AGENT = process.env.CGV_USER_AGENT ?? "Mozilla/5.0 (personal showtimes fetcher; once a day)";
const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const OUT = args.find((a) => !a.startsWith("--")) ?? "public/showtimes.json";
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, attempts = 3): Promise<unknown> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Not JSON (starts with: ${JSON.stringify(text.slice(0, 60))})`);
      }
    } catch (e) {
      last = e;
      if (i < attempts) await sleep(1000 * i);
    }
  }
  throw new Error(`${url}: ${(last as Error)?.message ?? last}`);
}

async function write(data: ShowtimesData) {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
}

async function fail(message: string): Promise<never> {
  console.log(`::warning title=Showtimes::${message}`);
  await write(emptyShowtimes(message));
  console.log(`Wrote empty ${OUT}; the page will fall back to picking a pick-up time.`);
  process.exit(STRICT ? 1 : 0);
}

async function main() {
  console.log(`Fetching CGV cinema list from ${BASE}`);
  let list: unknown;
  try {
    list = await getJson(`${BASE}/api/cinema/list`);
  } catch (e) {
    return fail(`Could not load CGV cinema list: ${(e as Error).message}`);
  }

  const { found, missing, all } = matchCinemas(list, CINEMAS);
  if (missing.length) {
    console.log(`::warning title=Showtimes::Cinemas not found in CGV list: ${missing.join(", ")}. Hà Nội cinemas: ${all.join("; ")}`);
  }
  if (!found.length) return fail("None of the configured cinemas were found in CGV's list (see warning above).");
  for (const c of found) console.log(`  ${c.key} → ${c.name} (id ${c.id})`);

  const today = new Date();
  const parts: ReturnType<typeof parseCinemaSchedule>[] = [];
  const errors: string[] = [];
  for (let i = 0; i < SHOWTIME_DAYS; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
    for (const c of found) {
      try {
        const resp = await getJson(`${BASE}/cinemas/catalog_mobile/siteschedules/id/${encodeURIComponent(c.id)}/date/${cgvDate(day)}`);
        const part = parseCinemaSchedule(resp, c.key, isoDate(day));
        parts.push(part);
        console.log(`  ${isoDate(day)} ${c.key}: ${part.shows.length} shows`);
      } catch (e) {
        errors.push((e as Error).message);
        console.log(`  ${isoDate(day)} ${c.key}: error ${(e as Error).message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  const merged = mergeShowtimes(parts);
  if (!merged.shows.length) {
    return fail(errors.length ? `No showtimes fetched (${errors.length} errors, first: ${errors[0]})` : "CGV returned no showtimes.");
  }
  if (errors.length) console.log(`::warning title=Showtimes::${errors.length} requests failed; using partial data.`);

  await write({
    fetchedAt: new Date().toISOString(),
    source: "CGV",
    cinemas: found.map(({ key, label, name, address }) => ({ key, label, name, ...(address ? { address } : {}) })),
    movies: merged.movies.filter((m) => merged.shows.some((s) => s.sku === m.sku)),
    shows: merged.shows,
  });
  console.log(`Wrote ${OUT}: ${merged.movies.length} movies, ${merged.shows.length} shows.`);
}

main().catch((e) => fail(`Unexpected error: ${(e as Error).message}`));
