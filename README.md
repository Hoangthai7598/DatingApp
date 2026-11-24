# DatingApp — "Đi chơi không em?" 🎟️

A small, mobile-first invitation page styled as a cinema ticket. The recipient picks an activity, then chooses one day + pick-up time from a week-by-week calendar list (from now until the end of the year) that only offers times that make sense for that activity, and taps **Chốt vé**. The booking is saved straight to a database and you get a Telegram notification; she doesn't need to message you. There's also a polite "maybe another time" option and a private feedback box. If the network is flaky the page retries automatically, then offers a "Gửi lại" (send again) button with her choices kept.

The UI copy is in Vietnamese; everything for developers is in English.

**Live:** https://hoangthai7598.github.io/di-choi-khong/

**Stack:** Next.js 16 (App Router, static export) · React 19 · TypeScript · Vitest · Supabase (Postgres) · GitHub Actions → GitHub Pages

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

## Project structure

```
app/
  layout.tsx          # <html>, metadata, viewport, fonts
  page.tsx            # Heading + <Invite />
  globals.css         # All styles (mobile-first)
components/
  Invite.tsx          # The interactive ticket (client component)
  Feedback.tsx        # Private feedback box
  icons.tsx           # Activity icons (inline SVG)
lib/
  config.ts           # ← Edit this: available times, activities, sender name
  store.ts            # Saves bookings/feedback to Supabase (REST, no SDK)
  store.test.ts
  invite.ts           # Pure logic: upcoming days, labels, message text
  invite.test.ts      # Unit tests for lib/invite.ts
supabase/
  schema.sql          # Tables, insert-only access, Telegram trigger. Run once in Supabase.
.github/
  workflows/pipeline.yml   # CI/CD
  dependabot.yml           # Weekly dependency updates
```

## Customizing

| To change | Edit |
|---|---|
| When you're free per weekday (`free`), when she must be home (`dropOffBy`), when you must be home (`homeBy`, e.g. a 22:00 meeting), hard latest pick-up (`latestPickup`) | `AVAILABILITY` in `lib/config.ts` |
| Travel time between your place and hers, each way (default 30 min) | `TRAVEL_MINUTES` |
| Per-activity rules: total duration, allowed pick-up windows (opening hours, meal times), note shown on the calendar | `duration`, `pickupWindows`, `note` in `ACTIVITIES` |
| Interval between pick-up times (default 30 min) | `STEP_MINUTES` |
| How far ahead today's earliest pick-up must be (default 60 min) | `LEAD_MINUTES` |
| Weeks shown before "Xem thêm" | `WEEKS_SHOWN` |
| Activities (title, subtitle) | `ACTIVITIES` in `lib/config.ts` (and the icon in `components/icons.tsx`) |

### How pick-up times are computed

A time is offered only if all of these hold:

1. It's no earlier than `free` + `TRAVEL_MINUTES` (time to get to her place).
2. Pick-up + activity `duration` gets her home by `dropOffBy`, **and** by `homeBy` − `TRAVEL_MINUTES` if set. On Mon/Tue/Thu you have a 22:00 meeting at home, so she's dropped off by 21:30.
3. It's no later than `latestPickup` if set (19:00 on Mon/Tue/Thu).
4. It falls inside the activity's `pickupWindows`, if it has any. Archery venues in Hanoi typically close around 19:00, so archery only allows pick-ups until 16:30, which effectively means weekend afternoons. Dinner/lunch only offers meal-time pick-ups.
5. For today, it's at least `LEAD_MINUTES` from now.

Days with no valid time for the chosen activity are hidden. If she switches activity and her pick no longer fits, it's cleared and she's told why. Tapping the selected time or the selected day again unselects it.
| Telegram message wording | `notify_telegram()` in `supabase/schema.sql` (re-run it in the SQL Editor) |
| Heading and intro text | `app/page.tsx` |
| Look and feel | `app/globals.css` |

## Database: receiving bookings and feedback

Bookings (`bookings` table) and feedback (`feedback` table) are stored in [Supabase](https://supabase.com), free tier. The page talks to Supabase's REST API with the **publishable key**, which is meant to be public. Access is locked down in `supabase/schema.sql`:

- The page can only **insert** rows, with length and format checks.
- Nobody using the publishable key can read, update or delete anything. You read the data in the Supabase Dashboard.

### Setup (about 10 minutes)

1. **Create a project.** Sign up at supabase.com (GitHub login works) → *New project*. Pick a name, a database password (save it somewhere) and region **Southeast Asia (Singapore)**.
2. **Create the tables.** In the project: *SQL Editor* → *New query* → paste the whole of `supabase/schema.sql` → *Run*. It should finish with "Success. No rows returned".
3. **Copy the URL and key.** Click **Connect** at the top of the dashboard (or *Project Settings → API Keys*):
   - Project URL, like `https://abcdefgh.supabase.co`
   - **Publishable key**, starting with `sb_publishable_`. Never use the secret key (`sb_secret_`) here.
4. **Add them to GitHub.** Repo → *Settings → Secrets and variables → Actions → Variables* → *New repository variable*:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key
5. **Redeploy.** *Actions → CI/CD → Run workflow* (or push any commit).
6. **Test.** Open the live page, pick something and tap *Chốt vé*. The page should say "Anh nhận được vé rồi". In Supabase: *Table Editor → bookings* shows the row. Delete your test rows there afterwards.

Reading on your phone: the Supabase Dashboard works in a mobile browser (*Table Editor*). Telegram notifications (below) are more convenient.

Local development: create `.env.local` (git-ignored) with `NEXT_PUBLIC_SUPABASE_URL=…` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…`, then `npm run dev`.

### Telegram notifications (optional, recommended)

The database sends you a Telegram message on every new booking or feedback (trigger `notify_telegram` in `schema.sql`, using Supabase's `pg_net`). The bot token is stored in Supabase Vault, never in the page.

1. In Telegram, open **@BotFather** → `/newbot` → choose a name and a username ending in `bot`. Copy the **token** (looks like `123456789:AA…`).
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

### Delivery and failures

- Each submit is retried up to 3 times on network errors, timeouts and 408/429/5xx responses. 4xx errors (bad data, wrong key) fail immediately.
- If it still fails, the page keeps her choices and shows a **Gửi lại** button.
- The deploy job **fails** if `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is missing, or if a secret key was put there by mistake, so a live page can always deliver.

## CI/CD

Defined in `.github/workflows/pipeline.yml`.

| Trigger | Jobs |
|---|---|
| Pull request | **CI**: lint → typecheck → test → build |
| Push / merge to `main` | **CI**, then **Deploy** to GitHub Pages |
| Manual *Run workflow* | Same as a push to `main` |

- The deploy job reads the Pages base path from `actions/configure-pages` and passes it to Next.js as `PAGES_BASE_PATH`, so renaming the repo or adding a custom domain needs no code change.
- If CI fails, nothing is deployed and the live site keeps the previous version.
- Dependabot opens weekly PRs for npm packages and GitHub Actions; they go through CI like any other PR.
- Actions on standard runners are free for public repositories.

### One-time setup

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. Set up Supabase and add `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (see *Database* above). Deploys fail until these exist.
3. *Actions → CI/CD → Run workflow* on `main`, or just push a commit.
4. (Recommended) *Settings → Rules → Rulesets*: protect `main` and require the **Lint · Typecheck · Test · Build** check to pass.

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

Use English and [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add karaoke activity
fix: correct weekend pick-up times
style: tighten spacing on small screens
ci: bump Pages actions to Node 24
docs: update README
chore(deps): bump next to 16.5
```

## Notes

- Static export only: no server, API routes or server actions.
- The page sets `noindex`, so it won't show up in search engines.
- The calendar runs from today until 31 December (at least `MIN_DAYS` days). It's computed in the visitor's browser, so "today" is her local date, and past pick-up times disappear while the page is open.
