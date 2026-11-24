import { ACTIVITIES, type ActivityId } from "./config";

export const DAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const DAY_FULL = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** Các ngày từ ngày mai trở đi mà anh có ít nhất một giờ rảnh. */
export function upcomingDays(from: Date, count: number, slots: Record<number, string[]>): Date[] {
  const base = new Date(from);
  base.setHours(12, 0, 0, 0);
  const out: Date[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if ((slots[d.getDay()] ?? []).length > 0) out.push(d);
  }
  return out;
}

export const formatDay = (d: Date) => `${DAY_FULL[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;

export function activityLabel(id: ActivityId | null, other: string): string {
  if (!id) return "";
  if (id === "khac") return other.trim() || "Em chọn chỗ khác";
  return ACTIVITIES.find((a) => a.id === id)?.title ?? "";
}

export interface Pick {
  activity: string;
  day: string;
  time: string;
  note?: string;
}

export function acceptMessage(from: string, p: Pick): string {
  const lines = [
    `Anh ${from} ơi, em chốt vé nhé 🎟️`,
    `• Đi: ${p.activity}`,
    `• Ngày: ${p.day}`,
    `• Anh qua đón lúc: ${p.time}`,
  ];
  const note = p.note?.trim();
  if (note) lines.push(`• Em dặn: ${note}`);
  return lines.join("\n");
}

export const laterMessage = (from: string) =>
  `Anh ${from} ơi, dạo này em hơi bận, để hôm khác mình đi nhé. Khi nào rảnh em báo anh 😊`;

/**
 * Link mở Zalo tới số của anh; rỗng nếu chưa cấu hình.
 * Dạng chuẩn là zalo.me/84xxxxxxxxx: bỏ số 0 đầu, thêm mã nước 84.
 * Trên điện thoại link này mở thẳng app Zalo; trên máy tính Zalo hiện trang có mã QR.
 */
export function zaloLink(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) digits = "84" + digits.slice(1);
  else if (!digits.startsWith("84")) digits = "84" + digits;
  return `https://zalo.me/${digits}`;
}
