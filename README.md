# gui-em 💌

A small, mobile-first invitation page styled as a cinema ticket, for asking someone out on a second date.

1. **Popup on every visit.** "Mình gặp nhau thêm một buổi nữa nhé?" with **Ừ, gặp thêm nhé** / **Không**.
   - *Không* once: Bắp (the popcorn mascot) gets sad, tears up and asks once more.
   - *Không* twice: Bắp cries, thanks her, and the page closes the question gently (with a "changed my mind" button).
   - Each *Không* sends you a Telegram message. Changing her mind sends nothing; you hear from her when she books.
2. **Pick an activity, then one day + pick-up time** from a week-by-week list (from now until the end of the year) that only offers times that make sense for that activity and your schedule.
3. **Movies:** she picks a film (with its poster) and a real CGV or Lotte showtime near her place; the pick-up time is worked out for her.
4. **Chốt vé:** the booking is saved straight to a database and you get a Telegram message. There's also a private feedback box.

If the network is flaky the page retries automatically, then offers a **Gửi lại** (send again) button with her choices kept.

The tab title is just "Gửi em" and the link preview says "Em mở ra xem nhé 💌", so nothing is given away before she opens it.

The UI copy is in Vietnamese; everything for developers is in English.

**Live:** https://hoangthai7598.github.io/gui-em/

**Stack:** Next.js 16 (App Router, static export) · React 19 · TypeScript · Vitest · Supabase (Postgres + Telegram trigger) · GitHub Actions → GitHub Pages

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
nvm use
npm ci
npm run dev      # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Static export to `out/` |
| `npm run check` | Lint + typecheck + test + build, exactly what CI runs |
| `npm run showtimes:push` | Fetch CGV + Lotte showtimes from your machine, commit `public/showtimes.json`, push (redeploys) |
| `npm run showtimes` | Fetch showtimes into `public/showtimes.json` without committing |
| `npm run showtimes -- --probe` | Print what each chain's endpoints return (for fixing the fetcher) |

The popup remembers nothing, so it shows on every visit. Answering *Không* on your own test runs sends real Telegram messages.

## Project structure

```
app/
  layout.tsx          # <html>, title/description (kept neutral), viewport, fonts
  page.tsx            # Heading + <Invite /> + <DateTwoGate />
  globals.css         # All styles (mobile-first)
components/
  DateTwoGate.tsx     # The opening popup: "gặp thêm một buổi nhé?" (Có / Không ×2)
  Invite.tsx          # The interactive ticket (client component)
  Mascot.tsx          # Bắp, an original popcorn-bucket mascot (happy / sad / cry)
  LaterSheet.tsx      # "Em chắc chưa?" sheet for the (currently hidden) "dạo này em bận" button
  Feedback.tsx        # Private feedback box
  icons.tsx           # Activity icons (inline SVG)
lib/
  config.ts           # ← Edit this: availability, date overrides, activities, cinemas
  invite.ts           # Pure logic: calendar days, pick-up times, labels
  showtimes.ts        # Parses CGV/Lotte schedules, posters, merges films, picks showtimes that fit
  live-showtimes.ts   # Optional in-browser refresh through the Worker proxy
  store.ts            # Saves bookings/feedback to Supabase (REST, no SDK)
  *.test.ts           # Unit tests
scripts/
  fetch-showtimes.ts  # Fetches CGV + Lotte showtimes → public/showtimes.json
  mac/                # showtimes:push and an optional daily launchd job
public/
  showtimes.json      # Committed showtimes the page reads
worker/               # Cloudflare Worker CORS proxy (optional, see below; own README)
supabase/
  schema.sql          # Tables, insert-only access, Telegram trigger. Run once in Supabase.
  migrations/         # Changes for a database created with an older schema.sql
.github/
  workflows/pipeline.yml   # CI/CD
  dependabot.yml           # Weekly dependency updates
```

## Customizing

| To change | Edit |
|---|---|
| Popup question, buttons, thank-you text, Telegram wording for *Không* | `components/DateTwoGate.tsx` |
| Page heading and intro text | `app/page.tsx` |
| Tab title and link preview text | `metadata` in `app/layout.tsx` |
| When you're free per weekday (`free`), when she must be home (`dropOffBy`), when you must be home (`homeBy`, e.g. a 22:00 meeting), hard latest pick-up (`latestPickup`); `null` = no dates that weekday | `AVAILABILITY` in `lib/config.ts` |
| One-off days: free on a usual meeting night, or blocked | `DATE_OVERRIDES` in `lib/config.ts`, e.g. `"2026-11-26": FREE_EVENING` or `"2026-12-24": null` |
| Show the "Dạo này em bận, để hôm khác nhé" button again | `SHOW_LATER_BUTTON = true` in `lib/config.ts` |
| Travel time between your place and hers, each way (default 30 min) | `TRAVEL_MINUTES` |
| Per-activity rules: total duration, allowed pick-up windows (opening hours, meal times), note shown on the calendar | `duration`, `pickupWindows`, `note` in `ACTIVITIES` |
| Activities (title, subtitle) | `ACTIVITIES` (and the icon in `components/icons.tsx`) |
| Interval between pick-up times (default 30 min) | `STEP_MINUTES` |
| How far ahead today's earliest pick-up must be (default 60 min) | `LEAD_MINUTES` |
| Weeks shown before "Xem thêm" | `WEEKS_SHOWN` |
| Cinemas and travel time from her place | `CINEMAS` |
| Telegram message wording for bookings/feedback | `notify_telegram()` in `supabase/schema.sql` (re-run it in the SQL Editor) |
| Look and feel | `app/globals.css` |

Current schedule: Monday is off (teaching 19:20–20:20, then a 22:00 meeting). Tuesday and Thursday have a 22:00 meeting, so the latest pick-up is 19:00. Wednesday and Friday evenings are free from 18:00, and weekends from 12:00.

### How pick-up times are computed

A time is offered only if all of these hold:

1. It's no earlier than `free` + `TRAVEL_MINUTES` (time to get to her place).
2. Pick-up + activity `duration` gets her home by `dropOffBy`, **and** by `homeBy` − `TRAVEL_MINUTES` if set. On meeting nights (22:00 at home) she's dropped off by 21:30.
3. It's no later than `latestPickup` if set (19:00 on meeting nights).
4. It falls inside the activity's `pickupWindows`, if it has any. Archery venues in Hanoi typically close around 19:00, so archery only allows pick-ups until 16:30, which effectively means weekend afternoons. Dinner/lunch only offers meal-time pick-ups.
5. For today, it's at least `LEAD_MINUTES` from now.

`DATE_OVERRIDES` replaces the weekday rule for that date. Days with no valid time for the chosen activity are hidden. If she switches activity and her pick no longer fits, it's cleared and she's told why. Tapping the selected time or the selected day again unselects it.

## Movie showtimes

When she picks **Xem phim**, the page lists the films (with posters) showing at the cinemas near her (`CINEMAS`: CGV Vincom Bắc Từ Liêm, CGV IPH, CGV Xuân Diệu, Lotte Kosmo Tây Hồ, Lotte Tây Hồ) over the next `SHOWTIME_DAYS` days, then only the showtimes you can actually make:

- pick-up = showtime − travel from her place to that cinema (`travelFromHer`) − `ARRIVE_BEFORE_SHOW`, rounded down to 5 minutes;
- that pick-up must fit your availability (free time + your travel, `latestPickup`, `DATE_OVERRIDES`);
- showtime + `ADS_MINUTES` + runtime + travel back must get her home by `dropOffBy`, and by `homeBy` − your travel on meeting nights;
- today: pick-up at least `LEAD_MINUTES` from now.

The same film at CGV and Lotte is shown once (matched by title, ignoring tags like "(T13)"). Posters come from the chains' own image URLs; a film without one shows a 🎬 tile. She can also choose **Phim nào cũng được**, which falls back to choosing a pick-up time.

### Refreshing the data (by hand, from your machine)

CGV sits behind Imperva bot protection, which blocks requests from servers: GitHub's runners and Cloudflare Workers both get a block page. Requests from a home connection work. So the page reads the committed `public/showtimes.json`, and you refresh it from your Mac:

```bash
npm run showtimes:push
```

This pulls `main`, fetches the next 7 days, and commits and pushes `public/showtimes.json` only if it changed. The push redeploys the site in about 2–3 minutes. It skips if you have other uncommitted changes (commit or stash them first) or aren't on `main`, and it never commits a failed fetch.

Run it every 2–3 days, and before sending the link. A chain's data is used for up to `SHOWTIMES_MAX_AGE_HOURS` (72 h). After that, **Xem phim** falls back to choosing a pick-up time; nothing breaks.

Optional automation: `npm run showtimes:install-mac` installs a launchd job that runs this every morning at 06:07 (log: `~/Library/Logs/moi-thuy-showtimes.log`). macOS blocks background jobs from reading Desktop, Documents and Downloads, so it only works if the repo lives elsewhere (e.g. `~/code/gui-em`). Remove it with `npm run showtimes:install-mac -- --uninstall`.

CI still tries to fetch before each deploy and on a daily schedule. That fails (blocked) and keeps the committed file, which shows up as a "Showtimes" warning in the Actions run.

### Where the data comes from

`scripts/fetch-showtimes.ts` calls each chain's public endpoints (undocumented, used by their own websites/apps):

| Chain | Endpoints |
|---|---|
| CGV | `GET cgv.vn/default/api/cinema/list`, `GET …/cinemas/catalog_mobile/siteschedules/id/{id}/date/{DDMMYYYY}` (Vietnamese titles; falls back to `/en`) |
| Lotte | `POST lottecinemavn.com/LCWS/Ticketing/TicketingData.aspx` with form field `paramList` = JSON: `GetTicketingPageTOBE` (cinemas), `GetPlaySequence` (schedule) |

About 35 small requests per run; keep it that way.

**Status:**
- CGV works from a home connection. The poster field is assumed to be `thumbnail`; if every film shows 🎬, check with `--probe`.
- Lotte returns no showtimes yet: the parser was written without a real response. To fix it, save raw responses into `.probe/` (git-ignored) and adjust `listLotteCinemas` / `parseLotteSchedule` in `lib/showtimes.ts`.

### Fixing the fetcher

- "cinemas not found" warning: it lists the chain's Hà Nội cinema names; adjust `match` in `CINEMAS`.
- Anything else: run `npm run showtimes -- --probe`, which prints the structure of each endpoint's response, and adjust the parsers in `lib/showtimes.ts` (`listCgvCinemas`, `parseCinemaSchedule`, `listLotteCinemas`, `parseLotteSchedule`, `posterUrl`).
- Optional env vars: `CGV_BASE_URL` (comma-separated bases), `LOTTE_URL`, `LOTTE_LANG` (default `LL`), `SHOWTIMES_USER_AGENT`.
- GitHub pauses scheduled workflows after 60 days without commits; re-enable it in the *Actions* tab.

### Live showtimes in the browser (optional, currently off)

`lib/live-showtimes.ts` can refresh showtimes in her browser through the Cloudflare Worker in `worker/`. Browsers can't read CGV/Lotte directly because they send no CORS headers. The Worker only allows those showtime endpoints, only from this site, and caches for 30 minutes.

This is switched on only when the repo variable `SHOWTIMES_PROXY_URL` is set (`LIVE_SHOWTIMES` in `lib/config.ts`). It's currently unset, because CGV blocks Cloudflare's servers too (`upstream 403`, Imperva block page). If that changes, see [`worker/README.md`](worker/README.md). Remove the deployed Worker with `cd worker && npx wrangler delete`.

## Database: receiving bookings and feedback

Bookings (`bookings` table) and feedback (`feedback` table) are stored in [Supabase](https://supabase.com), free tier. The popup's *Không* notices are feedback rows too, so they need no extra table.

The page talks to Supabase's REST API with the **publishable key**, which is meant to be public. Access is locked down in `supabase/schema.sql`:

- The page can only **insert** rows, with length and format checks.
- Nobody using the publishable key can read, update or delete anything. You read the data in the Supabase Dashboard.

### Setup (about 10 minutes)

1. **Create a project.** Sign up at supabase.com (GitHub login works) → *New project*. Pick a name, a database password (save it somewhere) and region **Southeast Asia (Singapore)**.
2. **Create the tables.** In the project: *SQL Editor* → *New query* → paste the whole of `supabase/schema.sql` → *Run*. It should finish with "Success. No rows returned".
   - Already set up with an older `schema.sql`? Run the files in `supabase/migrations/` instead, in order. Each is safe to re-run.
3. **Copy the URL and key.** Click **Connect** at the top of the dashboard (or *Project Settings → API Keys*):
   - Project URL, like `https://abcdefgh.supabase.co`
   - **Publishable key**, starting with `sb_publishable_`. Never use the secret key (`sb_secret_`) here.
4. **Add them to GitHub.** Repo → *Settings → Secrets and variables → Actions → Variables* → *New repository variable*:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key
5. **Redeploy.** *Actions → CI/CD → Run workflow* (or push any commit).
6. **Test.** Open the live page, answer the popup, pick something and tap *Chốt vé*. The page should say "Anh nhận được vé rồi". In Supabase: *Table Editor → bookings* shows the row. Delete your test rows there afterwards.

Reading on your phone: the Supabase Dashboard works in a mobile browser (*Table Editor*). Telegram notifications (below) are more convenient.

Local development: create `.env.local` (git-ignored) with `NEXT_PUBLIC_SUPABASE_URL=…` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…`, then `npm run dev`.

### Telegram notifications (optional, recommended)

The database sends you a Telegram message on every new booking or feedback row (trigger `notify_telegram` in `schema.sql`, using Supabase's `pg_net`). The bot token is stored in Supabase Vault, never in the page.

| What she does | Message |
|---|---|
| Popup: *Không* (1st) | 📝 Em góp ý: 🥺 Em bấm Không lần 1 (Bắp đang hỏi lại em). |
| Popup: *Vẫn không* (2nd) | 📝 Em góp ý: 💔 Em chọn KHÔNG đi date lần 2 (đã bấm Không 2 lần). |
| *Chốt vé* | 🎟️ Em chốt vé rồi! + activity, film/showtime/cinema, pick-up time, note |
| Feedback box | 📝 Em góp ý: + her message |

Setup:

1. In Telegram, open **@BotFather** → `/newbot` → choose a name and a username ending in `bot`. Copy the **token** (looks like `123456789:AA…`). Never paste it anywhere public; if it leaks, send `/revoke` to BotFather.
2. Open your new bot and send it any message, e.g. `/start`.
3. Get your chat id: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and find `"chat":{"id": 123456789`. That number is your chat id.
4. In Supabase *SQL Editor*, run (with your values):
   ```sql
   select vault.create_secret('123456789:AA...', 'telegram_bot_token');
   select vault.create_secret('123456789', 'telegram_chat_id');
   ```
5. Test from the SQL Editor:
   ```sql
   insert into public.feedback (message) values ('test from SQL editor');
   ```
   You should get a Telegram message within a few seconds. Delete the test row afterwards.

To change a secret later: `select vault.update_secret((select id from vault.secrets where name = 'telegram_chat_id'), 'new value');`

If a notification fails, the booking is still saved (the trigger never blocks inserts). Failed calls show up in `net._http_response`.

### Who sent it ("👤 Từ:" line)

Every Telegram message ends with who sent it and when, e.g.
`👤 Từ: 📱 iPhone · Safari · trang thật · máy #77c2` or `👤 Từ: 🧪 TEST (anh) · 💻 Mac · Chrome · localhost · máy #a3f9`.

- Run `supabase/migrations/003_sender.sql` once in the SQL Editor (new databases: `schema.sql` already has it).
  Until then the page still works; it just sends without this line.
- Sent from localhost or your home network (192.168.x…): always tagged **🧪 TEST**.
- On the live page, open it once with `?anh=1` to mark that browser as yours (tagged 🧪 TEST from then on);
  `?anh=0` removes the mark. Incognito forgets it, so add `?anh=1` to the link every time you test in incognito.
- `máy #xxxx` is a random id per browser: same id = same device/browser.

### Delivery and failures

- Each submit is retried up to 3 times on network errors, timeouts and 408/429/5xx responses. 4xx errors (bad data, wrong key) fail immediately.
- If a booking still fails, the page keeps her choices and shows a **Gửi lại** button. The same goes for the popup's final *Không*. The first *Không* notice is best effort.
- The deploy job **fails** if `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is missing, or if a secret key was put there by mistake, so a live page can always deliver.

## CI/CD

Defined in `.github/workflows/pipeline.yml`.

| Trigger | Jobs |
|---|---|
| Pull request | **CI**: lint → typecheck → test → build |
| Push / merge to `main` | **CI**, then **Build for Pages** → **Deploy** to GitHub Pages |
| Daily 05:17 Vietnam time | Same as a push (tries to refresh showtimes) |
| Manual *Run workflow* | Same as a push to `main` |

- The build reads the Pages base path from `actions/configure-pages` and passes it to Next.js as `PAGES_BASE_PATH`, so renaming the repo or adding a custom domain needs no code change.
- If CI fails, nothing is deployed and the live site keeps the previous version.
- Dependabot opens weekly PRs for npm packages and GitHub Actions; they go through CI like any other PR.
- Actions on standard runners are free for public repositories.

### One-time setup

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. Set up Supabase and add `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (see *Database* above). Deploys fail until these exist.
3. *Actions → CI/CD → Run workflow* on `main`, or just push a commit.
4. (Recommended) *Settings → Rules → Rulesets*: protect `main` and require the **Lint · Typecheck · Test · Build** check to pass.

### Renaming the repo

The site lives at `https://<user>.github.io/<repo>/`, so the repo name shows in the link. To rename:

1. *Settings → General → Repository name* → new name → *Rename*.
2. Point your local clone at it: `git remote set-url origin https://github.com/<user>/<new-name>.git`.
3. Push any commit (or *Run workflow*) to redeploy under the new path. The old link stops working; GitHub doesn't redirect Pages URLs.
4. Update the **Live** link at the top of this README.

### Day-to-day

```bash
# make your changes, then
npm run check
git add -A
git commit -m "feat: add karaoke option"
git push
```

The site updates about two minutes after the push.

## Commit messages

Use English and [Conventional Commits](https://www.conventionalcommits.org/), and keep them short:

```
feat: add karaoke activity
fix: correct weekend pick-up times
style: tighten spacing on small screens
ci: bump Pages actions to Node 24
docs: update README
chore: refresh showtimes
```

## Notes

- Static export only: no server, API routes or server actions.
- The page sets `noindex`, so it won't show up in search engines.
- The calendar runs from today until 31 December (at least `MIN_DAYS` days). It's computed in the visitor's browser, so "today" is her local date, and past pick-up times disappear while the page is open.
- Bắp is an original character drawn in SVG for this project.
