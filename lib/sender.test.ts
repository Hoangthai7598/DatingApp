import { describe, expect, it } from "vitest";
import { deviceLabel, formatSender, isLocalHost } from "./sender";

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/158.0.0.0 Mobile/15E148 Safari/604.1";
const IPHONE_ZALO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/600";

describe("deviceLabel", () => {
  it("tells devices and browsers apart", () => {
    expect(deviceLabel(MAC_CHROME)).toBe("💻 Mac · Chrome");
    expect(deviceLabel(IPHONE_SAFARI)).toBe("📱 iPhone · Safari");
    expect(deviceLabel(IPHONE_CHROME)).toBe("📱 iPhone · Chrome");
    expect(deviceLabel(IPHONE_ZALO)).toBe("📱 iPhone · trong app Zalo");
    expect(deviceLabel(null)).toBe("không rõ thiết bị");
  });
});

describe("isLocalHost", () => {
  it("treats dev machines and the home network as local", () => {
    for (const h of ["localhost", "127.0.0.1", "192.168.1.20", "10.0.0.5", "172.20.1.1", "mac.local"])
      expect(isLocalHost(h)).toBe(true);
    for (const h of ["thaihoang.github.io", "example.com", "172.32.0.1"]) expect(isLocalHost(h)).toBe(false);
  });
});

describe("formatSender", () => {
  it("tags tests from localhost or the owner's browser", () => {
    expect(formatSender({ ua: MAC_CHROME, hostname: "localhost", owner: false, id: "a3f9" })).toBe(
      "🧪 TEST (anh) · 💻 Mac · Chrome · localhost · máy #a3f9",
    );
    expect(formatSender({ ua: MAC_CHROME, hostname: "x.github.io", owner: true, id: "a3f9" })).toBe(
      "🧪 TEST (anh) · 💻 Mac · Chrome · trang thật · máy #a3f9",
    );
  });
  it("leaves real visitors untagged", () => {
    expect(formatSender({ ua: IPHONE_SAFARI, hostname: "x.github.io", owner: false, id: "77c2" })).toBe(
      "📱 iPhone · Safari · trang thật · máy #77c2",
    );
  });
});
