import { ACTIVITIES, type ActivityId, type DayAvailability } from "./config";

export const DAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const DAY_FULL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** Giá trị đặc biệt: em không chốt giờ, để anh chọn. */
export const ANY_TIME = "any";

type Availability = Record<number, DayAvailability | null>;

/** Điều kiện giờ đón của một hoạt động. */
export interface SlotRule {
  /** Từ lúc đón đến lúc đưa về, phút. */
  duration: number;
  /** Các khoảng giờ đón được phép (giờ mở cửa, giờ ăn…). Bỏ trống = không giới hạn thêm. */
  pickupWindows?: [string, string][];
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Các giờ đón trong khung [from, to], cách nhau step phút, tính cả hai đầu. */
export function timeSlots(window: [string, string] | null | undefined, step: number): string[] {
  if (!window || step <= 0) return [];
  const [a, b] = window.map(toMin);
  const out: string[] = [];
  for (let t = a; t <= b; t += step) out.push(toHHMM(t));
  return out;
}

/** Khóa ngày theo giờ địa phương, dạng YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/**
 * Giờ đón còn chọn được của một ngày cho một hoạt động:
 * - không sớm hơn lúc anh rảnh + thời gian đi sang chỗ em;
 * - đón + thời lượng phải đưa em về trước dropOffBy, và trước homeBy - thời gian anh đi về (nếu có);
 * - không muộn hơn latestPickup (nếu có);
 * - nằm trong giờ đón hợp lý của hoạt động (giờ mở cửa, giờ ăn…), nếu có;
 * - với hôm nay, không sớm hơn now + leadMinutes.
 */
export function slotsFor(
  date: Date,
  availability: Availability,
  rule: SlotRule,
  step: number,
  now: Date,
  leadMinutes: number,
  travelMinutes = 0,
): string[] {
  const day = availability[date.getDay()];
  if (!day) return [];
  const earliest = toMin(day.free) + travelMinutes;
  const dropOff = Math.min(
    toMin(day.dropOffBy),
    day.homeBy ? toMin(day.homeBy) - travelMinutes : Infinity,
  );
  const latest = Math.min(dropOff - rule.duration, day.latestPickup ? toMin(day.latestPickup) : Infinity);
  if (latest < earliest) return [];
  let slots = timeSlots([toHHMM(earliest), toHHMM(latest)], step);
  if (rule.pickupWindows?.length) {
    const wins = rule.pickupWindows.map(([a, b]) => [toMin(a), toMin(b)] as const);
    slots = slots.filter((t) => wins.some(([a, b]) => toMin(t) >= a && toMin(t) <= b));
  }
  if (sameDay(date, now)) {
    const soonest = now.getHours() * 60 + now.getMinutes() + leadMinutes;
    slots = slots.filter((t) => toMin(t) >= soonest);
  }
  return slots;
}

/**
 * Các ngày từ hôm nay đến hết năm (31/12) còn giờ đón chọn được cho hoạt động.
 * Nếu lịch ngắn hơn minDays ngày thì kéo dài thêm cho đủ.
 */
export function calendarDays(
  now: Date,
  availability: Availability,
  rule: SlotRule,
  minDays: number,
  step: number,
  leadMinutes: number,
  travelMinutes = 0,
): Date[] {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const endOfYear = new Date(start.getFullYear(), 11, 31, 12);
  const minEnd = new Date(start);
  minEnd.setDate(start.getDate() + minDays);
  const end = endOfYear > minEnd ? endOfYear : minEnd;
  const out: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (slotsFor(d, availability, rule, step, now, leadMinutes, travelMinutes).length) out.push(new Date(d));
  }
  return out;
}

/** "Hôm nay", "Ngày mai" hoặc rỗng. */
export function relativeDay(d: Date, now: Date): string {
  if (sameDay(d, now)) return "Hôm nay";
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return sameDay(d, t) ? "Ngày mai" : "";
}

const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setHours(12, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
const dm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

export interface WeekGroup {
  key: string;
  label: string;
  days: Date[];
}

/** Gom ngày theo tuần (thứ 2 → chủ nhật), đặt tên "Tuần này", "Tuần sau", hoặc "Tuần 7/12 – 13/12". */
export function groupByWeek(days: Date[], today: Date): WeekGroup[] {
  const thisMon = dayKey(mondayOf(today));
  const nextMonDate = mondayOf(today);
  nextMonDate.setDate(nextMonDate.getDate() + 7);
  const nextMon = dayKey(nextMonDate);
  const groups: WeekGroup[] = [];
  for (const d of days) {
    const mon = mondayOf(d);
    const key = dayKey(mon);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const label = key === thisMon ? "Tuần này" : key === nextMon ? "Tuần sau" : `Tuần ${dm(mon)} – ${dm(sun)}`;
      g = { key, label, days: [] };
      groups.push(g);
    }
    g.days.push(d);
  }
  return groups;
}

export const formatDay = (d: Date) => `${DAY_FULL[d.getDay()]}, ${dm(d)}`;
export const formatTime = (t: string) => (t === ANY_TIME ? "giờ nào cũng được" : t);
/** "18:00 – 20:30", hoặc "18:00" nếu chỉ có một giờ. */
export const formatRange = (slots: string[]) =>
  slots.length === 0 ? "" : slots.length === 1 ? slots[0] : `${slots[0]} – ${slots[slots.length - 1]}`;

export function activityLabel(id: ActivityId | null, other: string): string {
  if (!id) return "";
  if (id === "khac") return other.trim() || "Em chọn chỗ khác";
  return ACTIVITIES.find((a) => a.id === id)?.title ?? "";
}
