/**
 * "Ai gửi?" — một dòng ngắn đi kèm mỗi tin Telegram để anh phân biệt người gửi:
 *   "📱 iPhone · Safari · trang thật · máy #a3f9"
 *   "🧪 TEST (anh) · 💻 Mac · Chrome · localhost · máy #77c2"
 *
 * - Tin gửi từ localhost / 127.0.0.1 / IP mạng nhà (192.168.x, 10.x) luôn gắn 🧪 TEST.
 * - Mở trang thật với ?anh=1 một lần là trình duyệt đó được nhớ là máy của anh (gắn 🧪 TEST mãi);
 *   ?anh=0 để bỏ. Tab ẩn danh không nhớ được, nên khi test bằng ẩn danh thì luôn thêm ?anh=1 vào link.
 * - "máy #xxxx" là mã ngẫu nhiên cố định cho mỗi trình duyệt: cùng mã = cùng một máy/trình duyệt.
 */

const OWNER_KEY = "moi-thuy-owner";
const ID_KEY = "moi-thuy-device-id";

/** Thiết bị + trình duyệt, đọc từ user agent. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "không rõ thiết bị";
  const os = /iPhone/.test(ua)
    ? "📱 iPhone"
    : /iPad/.test(ua)
      ? "📱 iPad"
      : /Android/.test(ua)
        ? "📱 Android"
        : /Macintosh/.test(ua)
          ? "💻 Mac"
          : /Windows/.test(ua)
            ? "💻 Windows"
            : /Linux/.test(ua)
              ? "💻 Linux"
              : "❓ thiết bị lạ";
  const browser = /Zalo/i.test(ua)
    ? "trong app Zalo"
    : /FBAN|FBAV|Messenger/.test(ua)
      ? "trong Messenger/Facebook"
      : /Instagram/.test(ua)
        ? "trong Instagram"
        : /Edg\//.test(ua)
          ? "Edge"
          : /CriOS\//.test(ua)
            ? "Chrome"
            : /FxiOS\/|Firefox\//.test(ua)
              ? "Firefox"
              : /Chrome\//.test(ua)
                ? "Chrome"
                : /Safari\//.test(ua)
                  ? "Safari"
                  : "trình duyệt khác";
  return `${os} · ${browser}`;
}

/** Trang đang chạy trên máy dev (localhost, hoặc IP trong mạng nhà khi test bằng điện thoại). */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** Đọc ?anh=1 / ?anh=0 để đánh dấu (hoặc bỏ đánh dấu) trình duyệt này là máy của anh. */
function ownerFlag(search: string): boolean {
  const param = new URLSearchParams(search).get("anh");
  const s = storage();
  try {
    if (param === "1") s?.setItem(OWNER_KEY, "1");
    if (param === "0") s?.removeItem(OWNER_KEY);
  } catch {
    /* storage có thể bị chặn: vẫn dùng giá trị của param bên dưới */
  }
  if (param === "1") return true;
  if (param === "0") return false;
  try {
    return s?.getItem(OWNER_KEY) === "1";
  } catch {
    return false;
  }
}

function deviceId(): string {
  const s = storage();
  try {
    let id = s?.getItem(ID_KEY);
    if (!id) {
      id = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
      s?.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "????";
  }
}

export interface SenderInfo {
  ua: string | null | undefined;
  hostname: string;
  owner: boolean;
  id: string;
}

export function formatSender({ ua, hostname, owner, id }: SenderInfo): string {
  const local = isLocalHost(hostname);
  const test = owner || local ? "🧪 TEST (anh) · " : "";
  const where = local ? "localhost" : "trang thật";
  return `${test}${deviceLabel(ua)} · ${where} · máy #${id}`.slice(0, 120);
}

/** Dòng "Từ: …" cho trình duyệt hiện tại; null khi không chạy trong trình duyệt (test, build). */
export function currentSender(): string | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  return formatSender({
    ua: navigator.userAgent,
    hostname: window.location.hostname,
    owner: ownerFlag(window.location.search),
    id: deviceId(),
  });
}
