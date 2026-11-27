/**
 * Saves bookings and feedback to Supabase over its REST API (PostgREST). No SDK needed.
 *
 * Config (GitHub repo variables → workflow env → build):
 *   NEXT_PUBLIC_SUPABASE_URL              https://<project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
 * Both are required: the deploy job fails if they're missing, so a live page can always deliver.
 * Table definitions, insert-only RLS and the optional Telegram notification: supabase/schema.sql
 */

import { currentSender } from "./sender";

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const MAX_FEEDBACK_LENGTH = 1000;
export const MAX_NOTE_LENGTH = 200;

export interface FeedbackRow {
  message: string;
  activity?: string | null;
  picked_slot?: string | null;
  user_agent?: string | null;
  /** "Ai gửi": thiết bị · nơi mở · mã máy (lib/sender.ts). Tự điền khi bỏ trống. */
  sender?: string | null;
}

export interface BookingRow {
  /** "accept" = she picked a date; "later" = maybe another time. */
  kind: "accept" | "later";
  activity?: string | null;
  /** YYYY-MM-DD */
  day?: string | null;
  /** "18:30" or "any" */
  pickup_time?: string | null;
  /** Human-readable, e.g. "Thứ 7, 28/11 · 14:00" */
  slot_label?: string | null;
  note?: string | null;
  user_agent?: string | null;
  /** Movie bookings only. */
  movie?: string | null;
  cinema?: string | null;
  /** Showtime, HH:MM */
  showtime?: string | null;
  /** "Ai gửi": thiết bị · nơi mở · mã máy (lib/sender.ts). Tự điền khi bỏ trống. */
  sender?: string | null;
}

interface StoreOptions {
  url?: string;
  key?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Total attempts for transient failures (network error, timeout, 408/429/5xx). Default 3. */
  attempts?: number;
  /** Wait before retry n (ms). Default [800, 2000]. */
  backoffMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/** A failure worth retrying: network error, timeout, or a 408/429/5xx response. */
export class TransientError extends Error {}

/** A 4xx response; `status` lets the caller decide whether to retry without optional columns. */
export class RejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const isTransientStatus = (status: number) => status === 408 || status === 429 || status >= 500;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function storeEnabled(url = SUPABASE_URL, key = SUPABASE_KEY): boolean {
  return Boolean(url && key);
}

const cap = (v: string | null | undefined, n: number) => {
  const t = v?.trim();
  return t ? t.slice(0, n) : null;
};

/** Trim and cap fields so a request never trips the tables' CHECK constraints. */
export function toFeedbackRow(input: FeedbackRow): FeedbackRow {
  return {
    message: (input.message ?? "").trim().slice(0, MAX_FEEDBACK_LENGTH),
    activity: cap(input.activity, 80),
    picked_slot: cap(input.picked_slot, 80),
    user_agent: cap(input.user_agent, 300),
    sender: cap(input.sender, 120),
  };
}

export function toBookingRow(input: BookingRow): BookingRow {
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : null;
  const time = input.pickup_time && /^(\d{2}:\d{2}|any)$/.test(input.pickup_time) ? input.pickup_time : null;
  return {
    kind: input.kind === "later" ? "later" : "accept",
    activity: cap(input.activity, 80),
    day,
    pickup_time: time,
    slot_label: cap(input.slot_label, 80),
    note: cap(input.note, MAX_NOTE_LENGTH),
    user_agent: cap(input.user_agent, 300),
    movie: cap(input.movie, 120),
    cinema: cap(input.cinema, 80),
    showtime: input.showtime && /^\d{2}:\d{2}$/.test(input.showtime) ? input.showtime : null,
    sender: cap(input.sender, 120),
  };
}

async function insertOnce(table: string, row: object, url: string, key: string, opts: StoreOptions): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await doFetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: key,
        // Publishable keys may only appear in Authorization if it exactly equals `apikey`.
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new TransientError(`Network error inserting into ${table}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return;
  const msg = `Insert into ${table} failed: ${res.status}`;
  throw isTransientStatus(res.status) ? new TransientError(msg) : new RejectedError(msg, res.status);
}

/**
 * Insert; if the database rejects the optional `sender` column (migration 003 not run yet),
 * send the row again without it so a booking is never lost over the "Ai gửi" line.
 */
async function insert(table: "bookings" | "feedback", row: object, opts: StoreOptions): Promise<void> {
  try {
    return await insertWithRetry(table, row, opts);
  } catch (e) {
    if (e instanceof RejectedError && [400, 401, 403].includes(e.status) && "sender" in row) {
      const { sender: _drop, ...rest } = row as { sender?: unknown };
      void _drop;
      return insertWithRetry(table, rest, opts);
    }
    throw e;
  }
}

/** Insert with retries on transient failures. 4xx errors (bad data, wrong key) fail immediately. */
async function insertWithRetry(table: "bookings" | "feedback", row: object, opts: StoreOptions): Promise<void> {
  const url = opts.url ?? SUPABASE_URL;
  const key = opts.key ?? SUPABASE_KEY;
  if (!storeEnabled(url, key)) throw new Error("Store is not configured");
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoff = opts.backoffMs ?? [800, 2000];
  const sleep = opts.sleep ?? defaultSleep;
  for (let i = 1; ; i++) {
    try {
      return await insertOnce(table, row, url, key, opts);
    } catch (e) {
      if (!(e instanceof TransientError) || i >= attempts) throw e;
      await sleep(backoff[Math.min(i - 1, backoff.length - 1)] ?? 0);
    }
  }
}

export async function sendFeedback(input: FeedbackRow, opts: StoreOptions = {}): Promise<void> {
  const row = toFeedbackRow({ ...input, sender: input.sender ?? currentSender() });
  if (!row.message) throw new Error("Empty feedback");
  await insert("feedback", withoutNulls(row), opts);
}

/** Drop null fields so the request only names columns it actually sets (works before a migration adds new ones). */
export const withoutNulls = <T extends object>(row: T): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;

export async function sendBooking(input: BookingRow, opts: StoreOptions = {}): Promise<void> {
  const row = toBookingRow({ ...input, sender: input.sender ?? currentSender() });
  if (row.kind === "accept" && !(row.activity && row.day && row.pickup_time)) throw new Error("Incomplete booking");
  await insert("bookings", withoutNulls(row), opts);
}

export const userAgent = () => (typeof navigator === "undefined" ? null : navigator.userAgent);
