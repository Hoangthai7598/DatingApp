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
  /** Movie id shared across chains: the normalized title (see movieKey). */
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
  /** Chains the data came from, e.g. "CGV, Lotte". */
  source: string;
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

/**
 * Movie id shared across chains, so the same film at CGV and Lotte appears once:
 * the title without bracketed tags like "(T16)" or "[Lồng tiếng]", normalized.
 */
export const movieKey = (name: string) => normalize(name.replace(/\(.*?\)|\[.*?\]/g, " "));

/** A cinema as listed by a chain, before matching it to the config. */
export interface ListedCinema {
  /** The chain's id, used in schedule requests. */
  id: string;
  name: string;
  address?: string;
  /** Normalized city/area text used to prefer Hà Nội. */
  city: string;
}

export interface MatchedCinema {
  key: string;
  label: string;
  id: string;
  name: string;
  address?: string;
}

/** CGV `GET /api/cinema/list`: { data: [{ name: city, cinemas: [{ id, name, address }] }] } */
export function listCgvCinemas(resp: unknown): ListedCinema[] {
  return arr((resp as Json)?.data).flatMap((g) =>
    arr(g.cinemas).map((c) => ({
      id: str(c.id),
      name: str(c.name).trim(),
      address: str(c.address).trim() || undefined,
      city: normalize(str(g.name)),
    })),
  );
}

/** All arrays of objects anywhere in `v` whose items have `key` (Lotte nests its lists differently per method). */
export function findItems(v: unknown, key: string, depth = 0): Json[] {
  if (depth > 6 || v === null || typeof v !== "object") return [];
  if (Array.isArray(v)) {
    const objs = v.filter((x): x is Json => x !== null && typeof x === "object" && !Array.isArray(x));
    if (objs.length && objs.some((o) => key in o)) return objs.filter((o) => key in o);
    return v.flatMap((x) => findItems(x, key, depth + 1));
  }
  return Object.values(v as Json).flatMap((x) => findItems(x, key, depth + 1));
}

/**
 * Lotte `GetTicketingPageTOBE`: cinema items with CinemaID, DivisionCode, DetailDivisionCode, CinemaName*.
 * The schedule request needs the id as "DivisionCode|DetailDivisionCode|CinemaID".
 */
export function listLotteCinemas(resp: unknown): ListedCinema[] {
  const seen = new Set<string>();
  return findItems(resp, "CinemaID").flatMap((c) => {
    const cid = str(c.CinemaID);
    const name = str(c.CinemaNameVN || c.CinemaName || c.CinemaNameKR || c.CinemaNameUS).trim();
    if (!cid || !name) return [];
    const id = [str(c.DivisionCode) || "1", str(c.DetailDivisionCode) || "0001", cid].join("|");
    if (seen.has(id)) return [];
    seen.add(id);
    const address = str(c.CinemaAddrSummary || c.Address || c.CinemaAddress).trim() || undefined;
    return [{ id, name, address, city: normalize(`${str(c.CityName || c.DetailDivisionNameKR || c.DetailDivisionName)} ${address ?? ""}`) }];
  });
}

/** Match configured cinemas (by `match` keywords) against a chain's list, preferring Hà Nội. */
export function matchCinemaList(list: ListedCinema[], configs: CinemaConfig[]): { found: MatchedCinema[]; missing: string[]; all: string[] } {
  const isHanoi = (c: ListedCinema) => c.city.includes("ha noi") || normalize(`${c.name} ${c.address ?? ""}`).includes("ha noi");
  const hanoiFirst = [...list].sort((a, b) => Number(isHanoi(b)) - Number(isHanoi(a)));
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
  return { found, missing, all: list.filter(isHanoi).map((c) => c.name) };
}

/** CGV only (kept for the CGV path). */
export const matchCinemas = (resp: unknown, configs: CinemaConfig[]) => matchCinemaList(listCgvCinemas(resp), configs);

/** First HH:MM (or bare HHMM, as Lotte sends) found in the given strings, zero-padded. */
export function parseClock(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const v = str(c).trim();
    const m = v.match(/(\d{1,2}):(\d{2})/) ?? v.match(/^(\d{2})(\d{2})$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h < 24 && min < 60) return `${String(h).padStart(2, "0")}:${m[2]}`;
    }
  }
  return null;
}

const runtimeOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 40 && n <= 300 ? n : undefined;
};
const ratingOf = (...vs: unknown[]) => {
  for (const v of vs) {
    const m = str(v).toUpperCase().match(/\b(P|K|T13|T16|T18|C13|C16|C18)\b/);
    if (m) return m[1];
  }
  return undefined;
};

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
      const name = str(m.name).trim();
      const sku = movieKey(name);
      if (!sku) continue;
      movies.push({
        sku,
        name,
        rating: str(m.rating_code) || undefined,
        duration: runtimeOf(m.movie_endtime),
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

/**
 * Parse one Lotte cinema's schedule for one day (`GetPlaySequence`).
 * Items carry MovieName*, StartTime ("19:30" or "1930"), PlayTime (runtime), PlayDt, FilmName*, TranslationDivisionName*.
 */
export function parseLotteSchedule(resp: unknown, cinemaKey: string, date: string): { movies: ShowMovie[]; shows: Show[] } {
  const movies: ShowMovie[] = [];
  const shows: Show[] = [];
  for (const it of findItems(resp, "StartTime")) {
    const name = str(it.MovieNameVN || it.MovieName || it.MovieNameKR || it.MovieNameUS).trim();
    const sku = movieKey(name);
    const time = parseClock(it.StartTime);
    if (!sku || !time) continue;
    const playDt = str(it.PlayDt || it.PlayDate).slice(0, 10).replace(/\//g, "-");
    if (playDt && /^\d{4}-\d{2}-\d{2}$/.test(playDt) && playDt !== date) continue;
    if (str(it.IsBookingYN).toUpperCase() === "N") continue;
    movies.push({
      sku,
      name,
      rating: ratingOf(it.ViewGradeNameVN, it.ViewGradeName, it.ViewGradeNameKR, it.ViewGradeCode),
      duration: runtimeOf(it.PlayTime ?? it.RunningTime),
    });
    const format = [str(it.FilmNameVN || it.FilmName || it.FilmNameKR), str(it.TranslationDivisionNameVN || it.TranslationDivisionName || it.TranslationDivisionNameKR)]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(" ");
    shows.push({ date, time, cinema: cinemaKey, sku, ...(format ? { format } : {}) });
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
      // Keep the first title seen (CGV is fetched first, in Vietnamese); fill gaps from other chains.
      movies.set(m.sku, {
        sku: m.sku,
        name: prev?.name ?? m.name,
        rating: prev?.rating ?? m.rating,
        duration: prev?.duration ?? m.duration,
      });
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
