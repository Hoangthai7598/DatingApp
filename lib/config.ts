/* ====== CHỈNH Ở ĐÂY ====== */

/** Số Zalo của anh, ví dụ "0912345678". Để trống thì trang chỉ có nút sao chép tin nhắn. */
export const ZALO = process.env.NEXT_PUBLIC_ZALO ?? "";

/** Tên anh, dùng trong tin nhắn em gửi lại. */
export const FROM = "Thái";

/** Số ngày tới hiện trên trang (tính từ ngày mai). */
export const NUM_DAYS = 14;

/** Giờ đón anh rảnh theo thứ: 0 = Chủ nhật … 6 = Thứ 7. Mảng rỗng = không hiện ngày đó. */
export const SLOTS: Record<number, string[]> = {
  0: ["12:00", "14:00", "16:00", "18:00", "19:30"],
  1: ["18:00", "18:30", "19:00", "19:30"],
  2: ["18:00", "18:30", "19:00", "19:30"],
  3: ["18:00", "18:30", "19:00", "19:30", "20:00"],
  4: ["18:00", "18:30", "19:00", "19:30"],
  5: ["18:00", "18:30", "19:00", "19:30", "20:00"],
  6: ["12:00", "14:00", "16:00", "18:00", "19:30"],
};

export type ActivityId = "phim" | "cafe" | "an" | "bowling" | "cung" | "khac";

export const ACTIVITIES: { id: ActivityId; title: string; sub: string }[] = [
  { id: "phim", title: "Xem phim", sub: "Phim nào hay em chọn" },
  { id: "cafe", title: "Cafe chill", sub: "Ngồi nói chuyện, xả stress" },
  { id: "an", title: "Đi ăn", sub: "Món gì em thèm" },
  { id: "bowling", title: "Bowling", sub: "Thua thì mời nước" },
  { id: "cung", title: "Bắn cung", sub: "Thử cái gì mới mới" },
  { id: "khac", title: "Em chọn chỗ khác", sub: "Tuỳ em hết" },
];
