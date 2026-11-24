import { describe, expect, it, vi } from "vitest";
import { sendBooking, sendFeedback, storeEnabled, toBookingRow, toFeedbackRow } from "./store";

const URL = "https://abc.supabase.co";
const KEY = "sb_publishable_test";
const noSleep = async () => {};
const opts = (f: typeof fetch, attempts = 3) => ({ url: URL, key: KEY, fetchImpl: f, attempts, sleep: noSleep });
const okFetch = () => vi.fn(async () => new Response(null, { status: 201 }));
const callOf = (f: ReturnType<typeof vi.fn>) => f.mock.calls[0] as unknown as [string, RequestInit];

describe("storeEnabled", () => {
  it("cần cả URL và key", () => {
    expect(storeEnabled(URL, KEY)).toBe(true);
    expect(storeEnabled("", KEY)).toBe(false);
    expect(storeEnabled(URL, "")).toBe(false);
  });
});

describe("toFeedbackRow", () => {
  it("cắt khoảng trắng, giới hạn độ dài, bỏ trường rỗng", () => {
    const row = toFeedbackRow({ message: "  hi  ", activity: " ", picked_slot: "x".repeat(200) });
    expect(row).toEqual({ message: "hi", activity: null, picked_slot: "x".repeat(80), user_agent: null });
    expect(toFeedbackRow({ message: "a".repeat(2000) }).message).toHaveLength(1000);
  });
});

describe("toBookingRow", () => {
  it("giữ ngày/giờ hợp lệ, loại giá trị sai định dạng", () => {
    expect(toBookingRow({ kind: "accept", day: "2026-11-28", pickup_time: "14:00" })).toMatchObject({
      day: "2026-11-28",
      pickup_time: "14:00",
    });
    expect(toBookingRow({ kind: "accept", day: "28/11", pickup_time: "2pm" })).toMatchObject({
      day: null,
      pickup_time: null,
    });
    expect(toBookingRow({ kind: "accept", pickup_time: "any" }).pickup_time).toBe("any");
  });
  it("vé xem phim: giữ phim, rạp, suất; bỏ suất sai định dạng", () => {
    expect(toBookingRow({ kind: "accept", movie: " Bò Sữa Bay ", cinema: "CGV Vincom Bắc Từ Liêm", showtime: "19:30" })).toMatchObject({
      movie: "Bò Sữa Bay",
      cinema: "CGV Vincom Bắc Từ Liêm",
      showtime: "19:30",
    });
    expect(toBookingRow({ kind: "accept", showtime: "7pm" }).showtime).toBeNull();
    expect(toBookingRow({ kind: "later" })).toMatchObject({ movie: null, cinema: null, showtime: null });
  });
});

describe("sendFeedback", () => {
  it("POST vào /rest/v1/feedback với header đúng", async () => {
    const f = okFetch();
    await sendFeedback({ message: " Anh dễ thương ", activity: "Bowling" }, opts(f));
    const [endpoint, init] = callOf(f);
    expect(endpoint).toBe(`${URL}/rest/v1/feedback`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" });
    expect(JSON.parse(init.body as string)).toMatchObject({ message: "Anh dễ thương", activity: "Bowling" });
  });
  it("không gửi tin rỗng", async () => {
    const f = okFetch();
    await expect(sendFeedback({ message: "   " }, opts(f))).rejects.toThrow("Empty");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("sendBooking", () => {
  it("chốt vé: POST vào /rest/v1/bookings", async () => {
    const f = okFetch();
    await sendBooking(
      { kind: "accept", activity: "Bowling", day: "2026-11-28", pickup_time: "14:00", slot_label: "Thứ 7, 28/11 · 14:00", note: " mang mũ " },
      opts(f),
    );
    const [endpoint, init] = callOf(f);
    expect(endpoint).toBe(`${URL}/rest/v1/bookings`);
    expect(JSON.parse(init.body as string)).toMatchObject({ kind: "accept", day: "2026-11-28", note: "mang mũ" });
    expect(Object.keys(JSON.parse(init.body as string))).not.toContain("movie");
  });
  it("để hôm khác: không cần ngày giờ", async () => {
    const f = okFetch();
    await sendBooking({ kind: "later" }, opts(f));
    // Only columns with values are sent, so the request works even before migration 002.
    expect(JSON.parse(callOf(f)[1].body as string)).toEqual({ kind: "later" });
  });
  it("chốt vé thiếu thông tin thì không gửi", async () => {
    const f = okFetch();
    await expect(sendBooking({ kind: "accept", activity: "Bowling" }, opts(f))).rejects.toThrow("Incomplete");
    expect(f).not.toHaveBeenCalled();
  });
  it("lỗi 4xx (dữ liệu sai, sai key): báo lỗi ngay, không gửi lại", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(sendBooking({ kind: "later" }, opts(bad))).rejects.toThrow("401");
    expect(bad).toHaveBeenCalledTimes(1);
  });
  it("chưa cấu hình thì báo lỗi", async () => {
    await expect(sendBooking({ kind: "later" }, { url: "", key: KEY, fetchImpl: okFetch() })).rejects.toThrow();
  });
});

describe("tự gửi lại khi lỗi tạm thời", () => {
  it("mất mạng rồi có lại: thành công ở lần 2", async () => {
    let n = 0;
    const f = vi.fn(async () => {
      if (++n === 1) throw new TypeError("Failed to fetch");
      return new Response(null, { status: 201 });
    });
    await sendBooking({ kind: "later" }, opts(f));
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("lỗi 5xx / 429: gửi lại, chờ theo backoff", async () => {
    const statuses = [503, 429, 201];
    const f = vi.fn(async () => new Response(null, { status: statuses.shift()! }));
    const waits: number[] = [];
    await sendFeedback(
      { message: "hi" },
      { url: URL, key: KEY, fetchImpl: f, sleep: async (ms) => void waits.push(ms), backoffMs: [100, 300] },
    );
    expect(f).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([100, 300]);
  });
  it("hết số lần thử thì báo lỗi", async () => {
    const f = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(sendBooking({ kind: "later" }, opts(f, 3))).rejects.toThrow("500");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
