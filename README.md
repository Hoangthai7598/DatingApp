# Đi chơi không em? 🎟️

Trang mời đi chơi dạng tấm vé xem phim. Em chọn đi đâu, ngày nào, giờ đón, rồi bấm **Chốt vé** để có sẵn tin nhắn gửi lại qua Zalo.

**Stack:** Next.js 16 (App Router, static export) · React 19 · TypeScript · Vitest · GitHub Actions → GitHub Pages.

## Chạy local

```bash
nvm use          # Node 22
npm ci
npm run dev      # http://localhost:3000
npm run check    # lint + typecheck + test + build, giống hệt CI
```

## Chỉnh nội dung

| Muốn đổi | Sửa ở |
|---|---|
| Giờ đón theo từng thứ, số ngày hiện ra, tên anh, các lựa chọn đi chơi | `lib/config.ts` |
| Câu chữ tin nhắn | `lib/invite.ts` (nhớ sửa test trong `lib/invite.test.ts`) |
| Giao diện | `components/Invite.tsx`, `app/globals.css` |
| Tiêu đề, lời mở đầu | `app/page.tsx` |

Số Zalo **không nằm trong code**: đặt ở GitHub repo → *Settings → Secrets and variables → Actions → Variables* → tạo biến `ZALO` (ví dụ `0912345678`). Có biến này thì trang hiện nút "Mở Zalo gửi anh". Chạy local thì dùng `NEXT_PUBLIC_ZALO=09... npm run dev`.

## CI/CD

`.github/workflows/pipeline.yml`

| Sự kiện | Chạy |
|---|---|
| Mở / cập nhật Pull Request | **CI**: lint → typecheck → test → build |
| Push / merge vào `main` | **CI**, xong thì **Deploy** lên GitHub Pages |
| Bấm *Run workflow* tay | như push vào `main` |

Dependabot (`.github/dependabot.yml`) mở PR cập nhật npm và GitHub Actions mỗi tuần, PR đó cũng đi qua CI.

## Deploy lần đầu

1. Tạo repo trống trên GitHub (gợi ý tên: `di-choi-khong`).
2. Push:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Tab **Actions** → *CI/CD* → **Run workflow** (hoặc push thêm một commit).
5. Link: `https://<user>.github.io/<repo>/`

Repo trên tài khoản GitHub Free phải để **Public** thì Pages mới chạy; trang đã có `noindex` để không lên Google.

Nên bật thêm *Settings → Branches → Add rule* cho `main`: **Require status checks to pass** → chọn job *Lint · Typecheck · Test · Build*, để PR lỗi không merge được.
