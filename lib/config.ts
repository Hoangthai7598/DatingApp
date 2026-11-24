/* ====== CHỈNH Ở ĐÂY ====== */

/** Số Zalo của anh, ví dụ "0912345678". Để trống thì trang chỉ có nút sao chép tin nhắn. */
export const ZALO = process.env.NEXT_PUBLIC_ZALO ?? "";

/** Tên anh, dùng trong tin nhắn em gửi lại. */
export const FROM = "Thái";

/**
 * Khung giờ đón theo thứ: 0 = Chủ nhật … 6 = Thứ 7.
 * [giờ đón sớm nhất, giờ đón muộn nhất]; null = không hiện ngày đó.
 * Thứ 2, 3, 5 anh bận từ 22h nên giờ đón muộn nhất là 20:30.
 */
export const PICKUP_WINDOWS: Record<number, [string, string] | null> = {
  0: ["12:00", "21:00"],
  1: ["18:00", "20:30"],
  2: ["18:00", "20:30"],
  3: ["18:00", "21:30"],
  4: ["18:00", "20:30"],
  5: ["18:00", "21:30"],
  6: ["12:00", "21:00"],
};

/** Khoảng cách giữa các giờ đón, tính bằng phút. */
export const STEP_MINUTES = 30;

/** Hôm nay chỉ hiện giờ đón cách thời điểm hiện tại ít nhất chừng này phút (để anh kịp qua đón). */
export const LEAD_MINUTES = 60;

/** Lịch chạy đến hết năm nay; nếu còn ít hơn MIN_DAYS ngày thì kéo dài cho đủ. */
export const MIN_DAYS = 14;

/** Số tuần hiện sẵn, còn lại bấm "Xem thêm". */
export const WEEKS_SHOWN = 2;

/** Em được chọn tối đa bao nhiêu lựa chọn ngày + giờ. */
export const MAX_PICKS = 3;

export type ActivityId = "phim" | "cafe" | "an" | "bowling" | "cung" | "khac";

export const ACTIVITIES: { id: ActivityId; title: string; sub: string }[] = [
  { id: "phim", title: "Xem phim", sub: "Phim nào hay em chọn" },
  { id: "cafe", title: "Cafe chill", sub: "Ngồi nói chuyện, xả stress" },
  { id: "an", title: "Đi ăn", sub: "Món gì em thèm" },
  { id: "bowling", title: "Bowling", sub: "Thua thì mời nước" },
  { id: "cung", title: "Bắn cung", sub: "Thử cái gì mới mới" },
  { id: "khac", title: "Em chọn chỗ khác", sub: "Tuỳ em hết" },
];
