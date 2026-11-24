# Showtimes proxy (Cloudflare Worker)

The invitation page can't read CGV/Lotte's showtime APIs directly from the browser: they don't send CORS headers.
This Worker sits in between: the page calls it, it calls the cinema and adds CORS headers.

It is deliberately narrow:
- only the CGV cinema-list/schedule endpoints and Lotte's `GetTicketingPageTOBE` / `GetPlaySequence`, with validated parameters;
- only browser requests from `ALLOWED_ORIGINS` (`wrangler.toml`);
- responses cached for `CACHE_SECONDS` (30 min), so the cinemas see very few requests.

Free plan: 100,000 requests/day.

## Deploy (about 5 minutes)

1. Create a free account at https://dash.cloudflare.com/sign-up (no credit card needed).
2. From the repo:
   ```bash
   cd worker
   npx wrangler login        # opens the browser, click Allow
   npx wrangler deploy
   ```
   The output ends with the Worker's URL, e.g. `https://moi-thuy-showtimes.<your-subdomain>.workers.dev`.
   (First deploy may ask you to pick a `workers.dev` subdomain.)
3. Check it from your terminal:
   ```bash
   curl https://moi-thuy-showtimes.<your-subdomain>.workers.dev/health
   curl https://moi-thuy-showtimes.<your-subdomain>.workers.dev/cgv/default/api/cinema/list | head -c 300
   ```
   - JSON starting with `{"data":[{"name":` → the cinema answers through the Worker.
   - `{"error":"upstream 403 …"}` → the cinema blocks Cloudflare's servers too; see "If the cinema blocks it" below.
4. Tell the page about it: GitHub repo → *Settings → Secrets and variables → Actions → Variables* → `SHOWTIMES_PROXY_URL` = the Worker URL (no trailing slash). Re-run the workflow.
5. On the live page, open DevTools → Console, tap **Xem phim**: `[showtimes] live fetch: cgv: N shows …`.

Local dev: add `NEXT_PUBLIC_SHOWTIMES_PROXY=https://…workers.dev` to `.env.local`.

## Changing things

- Another site or a renamed repo calls the proxy: edit `ALLOWED_ORIGINS` in `wrangler.toml`, then `npx wrangler deploy`.
- Logs: `npx wrangler tail`.
- Remove: `npx wrangler delete`.

## If the cinema blocks it

A Worker runs in the Cloudflare data center closest to whoever calls it, so when she opens the page in Vietnam it usually runs in Hà Nội/TP.HCM. A test from your Mac's terminal also runs nearby. If the cinema still answers 403, it blocks data-center IPs in general; the page then keeps using `public/showtimes.json` (refreshed from your Mac, see the main README).
