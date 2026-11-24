/**
 * Movie showtimes: parsing CGV's schedule data (used by scripts/fetch-showtimes.ts at build time)
 * and picking the showtimes that fit your availability (used by the page).
 *
 * Data flow: GitHub Actions runs the fetch script every morning → public/showtimes.json →
 * the page loads it and only offers showtimes you can actually make.
 */
import type { CinemaConfig, DayAvailability } from "./config";

/* ───────────────────────────── data file ───────────────────────────── */

export interface ShowCinema {
  key: string;
  label: string;
  /** Name and address as CGV reports them. */
  name: string;
  address?: string;
}

export interface ShowMovie {
  sku: string;
  name: string;
  /** Age rating code, e.g. "T13". */
  rating?: string;
  /** Runtime in minutes, if CGV reports a plausible value. */
  duration?: number;
}

export interface Show {
  /** YYYY-MM-DD (local Vietnam date) */
  date: string;
  /** HH:MM */
  time: string;
  /** Cinema key from config (CINEMAS[].key) */
  cinema: string;
  sku: string;
  /** e.g. "2D Phụ đề" */
  format?: string;
}

export interface ShowtimesData {
  /** ISO timestamp of the last successful fetch, or null if it failed. */
  fetchedAt: string | null;
  source: "CGV";
  error?: string;
  cinemas: ShowCinema[];
  movies: ShowMovie[];
  shows: Show[];
}

export const emptyShowtimes = (error?: string): ShowtimesData => ({
  fetchedAt: null,
  source: "CGV",
  ...(error ? { error } : {}),
  cinemas: [],
  movies: [],
  shows: [],
});

/* ───────────────────────────── parsing CGV ───────────────────────────── */

/** Lowercase, strip Vietnamese diacritics and đ, collapse spaces: "Bắc Từ Liêm" → "bac tu liem". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** CGV's date format in URLs: DDMMYYYY. */
export const cgvDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export interface MatchedCinema {
  key: string;
  label: string;
  id: string;
  name: string;
  address?: string;
}

/**
 * Find the configured cinemas in CGV's cinema list (`GET /api/cinema/list`).
 * Prefers cinemas in a city group whose name contains "ha noi". Returns matches and the keys not found.
 */
export function matchCinemas(listResponse: unknown, configs: CinemaConfig[]): { found: MatchedCinema[]; missing: string[]; all: string[] } {
  const groups = arr((listResponse as Json)?.data);
  const flat = groups.flatMap((g) =>
    arr(g.cinemas).map((c) => ({
      city: normalize(str(g.name)),
      id: str(c.id),
      name: str(c.name),
      address: str(c.address) || undefined,
    })),
  );
  const hanoiFirst = [...flat].sort((a, b) => Number(b.city.includes("ha noi")) - Number(a.city.includes("ha noi")));
  const found: MatchedCinema[] = [];
  const missing: string[] = [];
  for (const cfg of configs) {
    const hit = hanoiFirst.find((c) => {
      const hay = normalize(`${c.name} ${c.address ?? ""}`);
      return c.id && cfg.match.some((m) => hay.includes(normalize(m)));
    });
    if (hit) found.push({ key: cfg.key, label: cfg.label, id: hit.id, name: hit.name, address: hit.address });
    else missing.push(cfg.key);
  }
  return { found, missing, all: flat.filter((c) => c.city.includes("ha noi")).map((c) => c.name) };
}

/** First HH:MM found in the given strings, zero-padded. */
export function parseClock(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const m = str(c).match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h < 24 && min < 60) return `${String(h).padStart(2, "0")}:${m[2]}`;
    }
  }
  return null;
}

/**
 * Parse one cinema's schedule for one day
 * (`GET /cinemas/catalog_mobile/siteschedules/id/{id}/date/{DDMMYYYY}`).
 */
export function parseCinemaSchedule(
  resp: unknown,
  cinemaKey: string,
  date: string,
): { movies: ShowMovie[]; shows: Show[] } {
  const movies: ShowMovie[] = [];
  const shows: Show[] = [];
  for (const day of arr((resp as Json)?.data)) {
    for (const m of arr(day.movies)) {
      const sku = str(m.sku) || str(m.id);
      const name = str(m.name).trim();
      if (!sku || !name) continue;
      const runtime = Number(m.movie_endtime);
      movies.push({
        sku,
        name,
        rating: str(m.rating_code) || undefined,
        duration: Number.isFinite(runtime) && runtime >= 40 && runtime <= 300 ? runtime : undefined,
      });
      for (const lang of arr(m.languages)) {
        const format = str(lang.name).trim() || undefined;
        for (const s of arr(lang.sessions)) {
          if (s.is_booking === false) continue;
          const time = parseClock(s.time, s.showing_date_time);
          if (time) shows.push({ date, time, cinema: cinemaKey, sku, format });
        }
      }
    }
  }
  return { movies, shows };
}

/** Merge per-cinema/per-day results: unique movies (by sku) and unique, sorted shows. */
export function mergeShowtimes(parts: { movies: ShowMovie[]; shows: Show[] }[]): { movies: ShowMovie[]; shows: Show[] } {
  const movies = new Map<string, ShowMovie>();
  const shows = new Map<string, Show>();
  for (const p of parts) {
    for (const m of p.movies) {
      const prev = movies.get(m.sku);
      movies.set(m.sku, { ...prev, ...m, duration: m.duration ?? prev?.duration, rating: m.rating ?? prev?.rating });
    }
    for (const s of p.shows) shows.set(`${s.date}|${s.time}|${s.cinema}|${s.sku}|${s.format ?? ""}`, s);
  }
  return {
    movies: [...movies.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
    shows: [...shows.values()].sort((a, b) => (a.date + a.time + a.cinema).localeCompare(b.date + b.time + b.cinema)),
  };
}

/* ───────────────────────────── fitting your schedule ───────────────────────────── */

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export interface ShowRules {
  availability: Record<number, DayAvailability | null>;
  cinemas: CinemaConfig[];
  /** Your travel time to her place (and back home), minutes. */
  travelMinutes: number;
  /** Today: pick-up must be at least this far from now. */
  leadMinutes: number;
  arriveBefore: number;
  adsMinutes: number;
  defaultMovieMinutes: number;
}

export interface ShowOption {
  /** Stable id: "<cinema>|<HH:MM>|<format>" */
  id: string;
  date: string;
  time: string;
  cinema: string;
  cinemaLabel: string;
  sku: string;
  format?: string;
  /** When you pick her up, HH:MM (rounded down to 5 minutes). */
  pickup: string;
  /** When she's home again, HH:MM. */
  dropOff: string;
}

/** Parse "YYYY-MM-DD" as a local date at noon. */
export const parseIsoDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/**
 * Showtimes of one movie on one date that you can make:
 * - pick-up = showtime − travel from her place to the cinema − arriveBefore, not before you're free + your travel;
 * - not later than latestPickup (if set);
 * - she's home (showtime + ads + runtime + travel back) by dropOffBy, and by homeBy − your travel (if set);
 * - for today, pick-up at least leadMinutes from now.
 */
export function showOptions(data: ShowtimesData, sku: string, date: string, now: Date, rules: ShowRules): ShowOption[] {
  const day = rules.availability[parseIsoDate(date).getDay()];
  if (!day) return [];
  const movie = data.movies.find((m) => m.sku === sku);
  const runtime = movie?.duration ?? rules.defaultMovieMinutes;
  const earliestPickup = toMin(day.free) + rules.travelMinutes;
  const latestPickup = day.latestPickup ? toMin(day.latestPickup) : Infinity;
  const dropOffLimit = Math.min(toMin(day.dropOffBy), day.homeBy ? toMin(day.homeBy) - rules.travelMinutes : Infinity);
  const today = date === isoDate(now);
  const soonest = now.getHours() * 60 + now.getMinutes() + rules.leadMinutes;

  const out: ShowOption[] = [];
  for (const s of data.shows) {
    if (s.sku !== sku || s.date !== date) continue;
    const cinema = rules.cinemas.find((c) => c.key === s.cinema);
    if (!cinema) continue;
    const show = toMin(s.time);
    const pickup = Math.floor((show - cinema.travelFromHer - rules.arriveBefore) / 5) * 5;
    const dropOff = show + rules.adsMinutes + runtime + cinema.travelFromHer;
    if (pickup < earliestPickup || pickup > latestPickup || dropOff > dropOffLimit) continue;
    if (today && pickup < soonest) continue;
    out.push({
      id: `${s.cinema}|${s.time}|${s.format ?? ""}`,
      date: s.date,
      time: s.time,
      cinema: s.cinema,
      cinemaLabel: cinema.label,
      sku: s.sku,
      format: s.format,
      pickup: toHHMM(pickup),
      dropOff: toHHMM(dropOff),
    });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.cinemaLabel.localeCompare(b.cinemaLabel));
}

/** Dates (ascending) on which this movie has at least one showtime you can make. */
export function showDates(data: ShowtimesData, sku: string, now: Date, rules: ShowRules): string[] {
  const dates = [...new Set(data.shows.filter((s) => s.sku === sku).map((s) => s.date))].sort();
  return dates.filter((d) => d >= isoDate(now) && showOptions(data, sku, d, now, rules).length > 0);
}

/** Movies with at least one showtime you can make, in the data's order. */
export function bookableMovies(data: ShowtimesData, now: Date, rules: ShowRules): ShowMovie[] {
  return data.movies.filter((m) => showDates(data, m.sku, now, rules).length > 0);
}
