import { describe, expect, it, vi } from "vitest";
import { CINEMAS } from "./config";
import { combineShowtimes, fetchLiveShowtimes, LOTTE_URL } from "./live-showtimes";
import type { ShowtimesData } from "./showtimes";

const TODAY = new Date(2026, 10, 25, 9, 0);
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
const cors = () => Promise.reject(new TypeError("Failed to fetch")); // what a CORS block looks like to the page

const CGV_LIST = { data: [{ name: "Hà Nội", cinemas: [{ id: "021", name: "CGV Vincom Bắc Từ Liêm", address: "234 Phạm Văn Đồng" }] }] };
const cgvSched = { data: [{ date: "x", movies: [{ sku: "1", name: "Bò Sữa Bay", movie_endtime: 110, rating_code: "T13", languages: [{ name: "2D", sessions: [{ time: "19:00" }] }] }] }] };
const LOTTE_LIST = { Cinemas: { Items: [{ DivisionCode: 1, DetailDivisionCode: "0001", CinemaID: 5001, CinemaNameKR: "Lotte Kosmo Tây Hồ", CinemaAddrSummary: "Xuân La, Hà Nội" }] } };
const lottePlays = { PlaySeqs: { Items: [{ MovieNameKR: "Bò Sữa Bay", StartTime: "1930", PlayTime: 110 }] } };

const fake = (cgvOk: boolean, lotteOk: boolean) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u === LOTTE_URL) {
      if (!lotteOk) return cors();
      const p = JSON.parse(new URLSearchParams(String(init?.body)).get("paramList")!);
      return json(p.MethodName === "GetTicketingPageTOBE" ? LOTTE_LIST : lottePlays);
    }
    if (!cgvOk) return cors();
    return json(u.endsWith("/api/cinema/list") ? CGV_LIST : cgvSched);
  }) as unknown as typeof fetch;

describe("fetchLiveShowtimes (gọi thẳng từ trình duyệt)", () => {
  it("bị CORS chặn cả hai: trả null, dừng sớm (không gọi lịch từng rạp)", async () => {
    const f = fake(false, false);
    const r = await fetchLiveShowtimes({ cinemas: CINEMAS, days: 7, today: TODAY, fetchImpl: f });
    expect(r.data).toBeNull();
    expect(r.log[0]).toMatch(/^cgv: blocked/);
    expect(r.log[1]).toMatch(/^lotte: blocked/);
    // CGV: 2 bases tried; Lotte: 1 cinema-list call. No per-day requests.
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });
  it("cả hai được: gộp phim, có suất của CGV và Lotte", async () => {
    const r = await fetchLiveShowtimes({ cinemas: CINEMAS, days: 2, today: TODAY, fetchImpl: fake(true, true) });
    expect(r.data?.source).toBe("CGV, LOTTE");
    expect(r.data?.movies.map((m) => m.name)).toEqual(["Bò Sữa Bay"]);
    expect(new Set(r.data?.shows.map((s) => s.cinema))).toEqual(new Set(["btl", "kosmo"]));
    expect(r.data?.shows).toHaveLength(4);
  });
  it("chỉ CGV được: vẫn trả dữ liệu CGV", async () => {
    const r = await fetchLiveShowtimes({ cinemas: CINEMAS, days: 1, today: TODAY, fetchImpl: fake(true, false) });
    expect(r.data?.source).toBe("CGV");
    expect(r.log[1]).toMatch(/lotte: blocked/);
  });
});

describe("qua proxy (Cloudflare Worker)", () => {
  it("gọi đúng đường dẫn proxy cho CGV và Lotte", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      urls.push(u);
      if (u.endsWith("/lotte")) {
        const p = JSON.parse(new URLSearchParams(String(init?.body)).get("paramList")!);
        return json(p.MethodName === "GetTicketingPageTOBE" ? LOTTE_LIST : lottePlays);
      }
      return json(u.endsWith("/api/cinema/list") ? CGV_LIST : cgvSched);
    }) as unknown as typeof fetch;
    const r = await fetchLiveShowtimes({ cinemas: CINEMAS, days: 1, today: TODAY, fetchImpl: f, proxy: "https://p.example.workers.dev/" });
    expect(r.data?.source).toBe("CGV, LOTTE");
    expect(urls).toContain("https://p.example.workers.dev/cgv/default/api/cinema/list");
    expect(urls).toContain("https://p.example.workers.dev/cgv/default/cinemas/catalog_mobile/siteschedules/id/021/date/25112026");
    expect(urls.filter((u) => u === "https://p.example.workers.dev/lotte")).toHaveLength(2);
  });
});

describe("combineShowtimes", () => {
  it("rạp nào lấy trực tiếp được thì dùng dữ liệu mới, rạp khác giữ dữ liệu file", () => {
    const live: ShowtimesData = { fetchedAt: "now", source: "CGV", cinemas: [{ key: "btl", label: "", name: "" }], movies: [{ sku: "a", name: "A" }], shows: [{ date: "2026-11-25", time: "19:00", cinema: "btl", sku: "a" }] };
    const file: ShowtimesData = {
      fetchedAt: "old",
      source: "CGV, LOTTE",
      cinemas: [{ key: "btl", label: "", name: "" }, { key: "kosmo", label: "", name: "" }],
      movies: [{ sku: "a", name: "A" }, { sku: "b", name: "B" }],
      shows: [
        { date: "2026-11-25", time: "18:00", cinema: "btl", sku: "a" },
        { date: "2026-11-25", time: "20:00", cinema: "kosmo", sku: "b" },
      ],
    };
    const c = combineShowtimes(live, file);
    expect(c.shows.map((s) => `${s.time}@${s.cinema}`)).toEqual(["19:00@btl", "20:00@kosmo"]);
    expect(c.movies.map((m) => m.sku).sort()).toEqual(["a", "b"]);
    expect(c.cinemas.map((x) => x.key)).toEqual(["btl", "kosmo"]);
    expect(c.source).toBe("CGV, LOTTE");
  });
});
