import { handle, type CacheLike, type Env } from "./proxy";

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const worker = {
  fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const cache = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default;
    return handle(req, env, { fetch: fetch.bind(globalThis), cache, waitUntil: (p) => ctx.waitUntil(p) });
  },
};

export default worker;
