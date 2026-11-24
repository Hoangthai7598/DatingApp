import { describe, expect, it } from "vitest";
import { SLOTS } from "./config";
import { acceptMessage, activityLabel, formatDay, laterMessage, upcomingDays, zaloLink } from "./invite";

describe("upcomingDays", () => {
  it("bắt đầu từ ngày mai và đủ số ngày khi ngày nào cũng rảnh", () => {
    const wed = new Date(2026, 10, 25); // Thứ 4, 25/11/2026
    const days = upcomingDays(wed, 14, SLOTS);
    expect(days).toHaveLength(14);
    expect(formatDay(days[0])).toBe("Thứ 5, 26/11");
    expect(formatDay(days[13])).toBe("Thứ 4, 9/12");
  });

  it("bỏ qua ngày không có giờ rảnh", () => {
    const wed = new Date(2026, 10, 25);
    const days = upcomingDays(wed, 7, { ...SLOTS, 1: [] });
    expect(days.some((d) => d.getDay() === 1)).toBe(false);
    expect(days).toHaveLength(6);
  });
});

describe("activityLabel", () => {
  it("trả về tên hoạt động", () => expect(activityLabel("phim", "")).toBe("Xem phim"));
  it("dùng chữ em tự ghi khi chọn chỗ khác", () => expect(activityLabel("khac", " Hồ Tây ")).toBe("Hồ Tây"));
  it("có chữ mặc định khi em chưa ghi", () => expect(activityLabel("khac", "")).toBe("Em chọn chỗ khác"));
  it("rỗng khi chưa chọn", () => expect(activityLabel(null, "")).toBe(""));
});

describe("tin nhắn", () => {
  it("chốt vé có đủ thông tin, bỏ dòng lời dặn khi trống", () => {
    const msg = acceptMessage("Thái", { activity: "Bowling", day: "Thứ 7, 28/11", time: "14:00", note: "  " });
    expect(msg).toContain("• Đi: Bowling");
    expect(msg).toContain("• Anh qua đón lúc: 14:00");
    expect(msg).not.toContain("Em dặn");
  });
  it("có lời dặn khi em ghi", () => {
    const msg = acceptMessage("Thái", { activity: "Cafe chill", day: "Thứ 4, 2/12", time: "18:30", note: "mang mũ nhé" });
    expect(msg.endsWith("• Em dặn: mang mũ nhé")).toBe(true);
  });
  it("hẹn hôm khác", () => expect(laterMessage("Thái")).toMatch(/để hôm khác/));
});

describe("zaloLink", () => {
  it("bỏ số 0 đầu, thêm 84 và lọc ký tự lạ", () => expect(zaloLink("091 234-5678")).toBe("https://zalo.me/84912345678"));
  it("giữ nguyên số đã có 84 hoặc +84", () => expect(zaloLink("+84 912 345 678")).toBe("https://zalo.me/84912345678"));
  it("rỗng khi chưa cấu hình", () => expect(zaloLink("")).toBe(""));
});
