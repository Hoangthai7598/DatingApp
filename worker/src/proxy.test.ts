import { describe, expect, it, vi } from "vitest";
import { handle, sanitizeLotte, type CacheLike, type Env } from "./proxy";

const ENV: Env = { ALLOWED_ORIGINS: "https://hoangthai7598.github.io,http://localhost:3000", CACHE_SECONDS: "1800" };
const PAGE = "https://hoangthai7598.github.io";
const W = "https://moi-thuy-showtimes.example.workers.dev";

function memCache(): CacheLike & { size: () => number } {
  const m = new Map<string, Response>();
  return {
    async match(k) {
      const r = m.get(k.url);
      return r?.clone();
    },
    async put(k, r) {
      m.set(k.url, r);
    },
    size: () => m.size,
  };
}
const upstreamOk = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const get = (path: string, origin: string | null = PAGE) => new Request(`${W}${path}`, { headers: origin ? { Origin: origin } : {} });
const lottePost = (params: unknown, origin = PAGE) =>
  new Request(`${W}/lotte`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ paramList: JSON.stringify(params) }).toString(),
  });

describe("CORS", () => {
  it("preflight from the page: 204 with Allow-Origin", async () => {
    const r = await handle(new Request(`${W}/lotte`, { method: "OPTIONS", headers: { Origin: PAGE } }), ENV, { fetch: upstreamOk({}) });
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(PAGE);
  });
  it("other websites are refused", async () => {
    const f = upstreamOk({});
    const r = await handle(get("/cgv/default/api/cinema/list", "https://evil.example"), ENV, { fetch: f });
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("CGV", () => {
  it("cinema list: forwards to cgv.vn, adds CORS, caches", async () => {
    const f = upstreamOk({ data: [] });
    const cache = memCache();
    const r1 = await handle(get("/cgv/default/api/cinema/list"), ENV, { fetch: f, cache });
    expect(r1.status).toBe(200);
    expect(r1.headers.get("Access-Control-Allow-Origin")).toBe(PAGE);
    expect(r1.headers.get("X-Proxy-Cache")).toBe("MISS");
    expect((f.mock.calls[0][0] as Request).url).toBe("https://www.cgv.vn/default/api/cinema/list");
    expect(await r1.json()).toEqual({ data: [] });
    const r2 = await handle(get("/cgv/default/api/cinema/list"), ENV, { fetch: f, cache });
    expect(r2.headers.get("X-Proxy-Cache")).toBe("HIT");
    expect(r2.headers.get("Access-Control-Allow-Origin")).toBe(PAGE);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("schedule: only valid ids and dates", async () => {
    const f = upstreamOk({ data: [] });
    expect((await handle(get("/cgv/en/cinemas/catalog_mobile/siteschedules/id/021/date/28112026"), ENV, { fetch: f })).status).toBe(200);
    expect((f.mock.calls[0][0] as Request).url).toBe("https://www.cgv.vn/en/cinemas/catalog_mobile/siteschedules/id/021/date/28112026");
    for (const bad of ["/cgv/default/cinemas/catalog_mobile/siteschedules/id/..%2F/date/28112026", "/cgv/vn/api/cinema/list", "/cgv/default/customer/profile", "/anything"]) {
      expect((await handle(get(bad), ENV, { fetch: f })).status).toBe(404);
    }
  });
  it("upstream blocked: 502 with the reason, not cached", async () => {
    const f = vi.fn(async () => new Response("<html>Access denied</html>", { status: 403 })) as unknown as typeof fetch;
    const cache = memCache();
    const r = await handle(get("/cgv/default/api/cinema/list"), ENV, { fetch: f, cache });
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toMatch(/upstream 403/);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(PAGE);
    expect(cache.size()).toBe(0);
  });
});

describe("Lotte", () => {
  it("sanitizeLotte keeps only allowed methods and fields", () => {
    expect(sanitizeLotte(JSON.stringify({ MethodName: "GetTicketingPageTOBE", evil: 1 }))).toMatchObject({ MethodName: "GetTicketingPageTOBE", memberOnNo: "0" });
    expect(sanitizeLotte(JSON.stringify({ MethodName: "GetPlaySequence", playDate: "2026-11-28", cinemaID: "1|0001|5001" }))).toMatchObject({
      MethodName: "GetPlaySequence",
      cinemaID: "1|0001|5001",
    });
    expect(sanitizeLotte(JSON.stringify({ MethodName: "GetMemberInfo" }))).toBeNull();
    expect(sanitizeLotte(JSON.stringify({ MethodName: "GetPlaySequence", playDate: "x", cinemaID: "1|0001|5001" }))).toBeNull();
    expect(sanitizeLotte("not json")).toBeNull();
  });
  it("forwards a rebuilt form body with Lotte's Referer, and caches by body", async () => {
    const f = upstreamOk({ PlaySeqs: { Items: [] } });
    const cache = memCache();
    const params = { MethodName: "GetPlaySequence", playDate: "2026-11-28", cinemaID: "1|0001|5001", extra: "dropped" };
    const r = await handle(lottePost(params), ENV, { fetch: f, cache });
    expect(r.status).toBe(200);
    const up = f.mock.calls[0][0] as Request;
    expect(up.url).toBe("https://www.lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx");
    expect(up.headers.get("Referer")).toBe("https://www.lottecinemavn.com/");
    const sent = JSON.parse(new URLSearchParams(await up.text()).get("paramList")!);
    expect(sent).not.toHaveProperty("extra");
    expect(sent.cinemaID).toBe("1|0001|5001");
    expect((await handle(lottePost(params), ENV, { fetch: f, cache })).headers.get("X-Proxy-Cache")).toBe("HIT");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects other methods", async () => {
    const f = upstreamOk({});
    expect((await handle(lottePost({ MethodName: "GetMemberInfo" }), ENV, { fetch: f })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});
