# DatingApp — "Đi chơi không em?" 🎟️

A small, mobile-first invitation page styled as a cinema ticket. The recipient picks an activity, a day and a pick-up time, then taps **Chốt vé** to get a ready-made message she can send back via Zalo. There's also a polite "maybe another time" option.

The UI copy is in Vietnamese; everything for developers is in English.

**Live:** https://hoangthai7598.github.io/DatingApp/

**Stack:** Next.js 16 (App Router, static export) · React 19 · TypeScript · Vitest · GitHub Actions → GitHub Pages

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
  icons.tsx           # Activity icons (inline SVG)
lib/
  config.ts           # ← Edit this: available times, activities, sender name
  invite.ts           # Pure logic: upcoming days, labels, message text
  invite.test.ts      # Unit tests for lib/invite.ts
.github/
  workflows/pipeline.yml   # CI/CD
  dependabot.yml           # Weekly dependency updates
```

## Customizing

| To change | Edit |
|---|---|
| Pick-up times per weekday, number of days shown | `SLOTS`, `NUM_DAYS` in `lib/config.ts` |
| Activities (title, subtitle) | `ACTIVITIES` in `lib/config.ts` (and the icon in `components/icons.tsx`) |
| Sender name used in the message | `FROM` in `lib/config.ts` |
| Message wording | `lib/invite.ts` — update `lib/invite.test.ts` to match |
| Heading and intro text | `app/page.tsx` |
| Look and feel | `app/globals.css` |

### Zalo button (optional)

The phone number is **not** stored in the code. Set it as a repository variable:

*Settings → Secrets and variables → Actions → Variables → New repository variable* → name `ZALO`, value e.g. `0912345678`.

When set, the page shows an **"Mở Zalo gửi anh"** button that opens a Zalo chat with that number. Without it, the page only offers "copy message". Note that the number is still visible in the deployed page's `zalo.me/…` link.

For local development: `NEXT_PUBLIC_ZALO=0912345678 npm run dev`.

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
2. (Optional) Add the `ZALO` variable as described above.
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
- Days are computed in the visitor's browser, so "tomorrow" is always relative to her local date.
