import { describe, expect, it } from "vitest";
import { ACTIVITIES, AVAILABILITY, type ActivityId } from "./config";
import {
  activityLabel,
  calendarDays,
  dayKey,
  relativeDay,
  formatRange,
  slotsFor,
  formatDay,
  groupByWeek,
  timeSlots,
} from "./invite";

const WED_25_NOV = new Date(2026, 10, 25, 9, 0); // 9h sáng thứ 4
const rule = (id: ActivityId) => ACTIVITIES.find((a) => a.id === id)!;
const CAFE = rule("cafe");
// 30 phút mỗi chiều giữa nhà anh và chỗ em
const cal = (now: Date, r = CAFE, w = AVAILABILITY, min = 14) => calendarDays(now, w, r, min, 30, 60, 30);
const slots = (d: Date, id: ActivityId, now = WED_25_NOV) => slotsFor(d, AVAILABILITY, rule(id), 30, now, 60, 30);
const MON = new Date(2026, 10, 30);
const SAT = new Date(2026, 10, 28);

describe("timeSlots", () => {
  it("cách nhau 30 phút, tính cả hai đầu", () =>
    expect(timeSlots(["18:00", "20:30"], 30)).toEqual(["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"]));
  it("cuối tuần từ 12:00 đến 21:00 có 19 mốc", () => expect(timeSlots(["12:00", "21:00"], 30)).toHaveLength(19));
  it("rỗng khi không có khung giờ", () => expect(timeSlots(null, 30)).toEqual([]));
});

describe("slotsFor: đường đi, tối họp và điều kiện theo hoạt động", () => {
  it("đón sớm nhất = lúc anh rảnh + 30 phút đi sang", () => {
    expect(slots(MON, "cafe")[0]).toBe("18:30");
    expect(slots(SAT, "cafe")[0]).toBe("12:30");
  });
  it("tối họp (thứ 2, 3, 5): đón muộn nhất 19:00", () => expect(slots(MON, "cafe")).toEqual(["18:30", "19:00"]));
  it("tối họp + xem phim 3 tiếng: phải về nhà trước 22h nên chỉ đón 18:30", () =>
    expect(slots(MON, "phim")).toEqual(["18:30"]));
  it("tối họp + trượt băng: 18:30 – 19:00", () => expect(slots(MON, "bang")).toEqual(["18:30", "19:00"]));
  it("bắn cung: không có buổi tối trong tuần", () => expect(slots(MON, "cung")).toEqual([]));
  it("bắn cung cuối tuần: 12:30 – 16:30", () => {
    const s = slots(SAT, "cung");
    expect(s[0]).toBe("12:30");
    expect(s.at(-1)).toBe("16:30");
  });
  it("đi ăn cuối tuần: chỉ giờ bữa trưa và bữa tối", () =>
    expect(slots(SAT, "an")).toEqual(["12:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"]));
  it("tối không họp (thứ 4): bowling đưa em về trước 23h nên đón muộn nhất 21:00", () => {
    const wed = new Date(2026, 11, 2);
    expect(slots(wed, "bowling")[0]).toBe("18:30");
    expect(slots(wed, "bowling").at(-1)).toBe("21:00");
  });
  it("trượt băng cuối tuần: đón muộn nhất 20:00", () => expect(slots(SAT, "bang").at(-1)).toBe("20:00"));
  it("trượt patin tối thứ 4: 18:30 – 19:30", () =>
    expect(slots(new Date(2026, 11, 2), "patin")).toEqual(["18:30", "19:00", "19:30"]));
  it("hôm nay bỏ các giờ chưa kịp đón (cách hiện tại dưới 60 phút)", () => {
    const now = new Date(2026, 10, 25, 18, 40);
    expect(slots(now, "cafe", now)).toEqual(["20:00", "20:30", "21:00", "21:30"]);
  });
  it("không tính đường đi khi travelMinutes = 0", () =>
    expect(slotsFor(MON, AVAILABILITY, CAFE, 30, WED_25_NOV, 60)[0]).toBe("18:00"));
});

describe("calendarDays", () => {
  it("bắt đầu từ hôm nay và chạy đến hết 31/12", () => {
    const days = cal(WED_25_NOV);
    expect(formatDay(days[0])).toBe("Thứ 4, 25/11");
    expect(dayKey(days[days.length - 1])).toBe("2026-12-31");
    expect(days).toHaveLength(37);
  });
  it("bắn cung chỉ còn thứ 7 và chủ nhật", () => {
    const days = cal(WED_25_NOV, rule("cung"));
    expect(days.every((d) => d.getDay() === 0 || d.getDay() === 6)).toBe(true);
    expect(formatDay(days[0])).toBe("Thứ 7, 28/11");
  });
  it("hôm nay hết giờ đón thì bắt đầu từ ngày mai", () => {
    expect(formatDay(cal(new Date(2026, 10, 25, 21, 0))[0])).toBe("Thứ 5, 26/11");
  });
  it("cuối năm thì kéo dài sang năm sau cho đủ số ngày tối thiểu", () => {
    const days = cal(new Date(2026, 11, 28, 9, 0));
    expect(dayKey(days[0])).toBe("2026-12-28");
    expect(dayKey(days[days.length - 1])).toBe("2027-01-11");
  });
  it("bỏ qua ngày anh không rảnh", () => {
    expect(cal(WED_25_NOV, CAFE, { ...AVAILABILITY, 1: null }).some((d) => d.getDay() === 1)).toBe(false);
  });
});

describe("relativeDay", () => {
  it("hôm nay / ngày mai / rỗng", () => {
    expect(relativeDay(new Date(2026, 10, 25, 12), WED_25_NOV)).toBe("Hôm nay");
    expect(relativeDay(new Date(2026, 10, 26, 12), WED_25_NOV)).toBe("Ngày mai");
    expect(relativeDay(new Date(2026, 10, 27, 12), WED_25_NOV)).toBe("");
  });
});

describe("groupByWeek", () => {
  it("chia theo tuần thứ 2 → chủ nhật và đặt tên", () => {
    const groups = groupByWeek(cal(WED_25_NOV), WED_25_NOV);
    expect(groups.map((g) => g.label).slice(0, 3)).toEqual(["Tuần này", "Tuần sau", "Tuần 7/12 – 13/12"]);
    expect(groups[0].days.map(formatDay)).toEqual(["Thứ 4, 25/11", "Thứ 5, 26/11", "Thứ 6, 27/11", "Thứ 7, 28/11", "Chủ nhật, 29/11"]);
    expect(groups.at(-1)?.label).toBe("Tuần 28/12 – 3/1");
  });
});

describe("formatRange", () => {
  it("khoảng giờ", () => expect(formatRange(["18:00", "18:30", "19:00"])).toBe("18:00 – 19:00"));
  it("một giờ", () => expect(formatRange(["16:30"])).toBe("16:30"));
});

describe("activityLabel", () => {
  it("trả về tên hoạt động", () => expect(activityLabel("phim", "")).toBe("Xem phim"));
  it("dùng chữ em tự ghi khi chọn chỗ khác", () => expect(activityLabel("khac", " Hồ Tây ")).toBe("Hồ Tây"));
  it("có chữ mặc định khi em chưa ghi", () => expect(activityLabel("khac", "")).toBe("Em chọn chỗ khác"));
  it("rỗng khi chưa chọn", () => expect(activityLabel(null, "")).toBe(""));
});
