/* ====== CHỈNH Ở ĐÂY ====== */

/** Số Zalo của anh, ví dụ "0912345678". Để trống thì trang chỉ có nút sao chép tin nhắn. */
export const ZALO = process.env.NEXT_PUBLIC_ZALO ?? "";

/** Tên anh, dùng trong tin nhắn em gửi lại. */
export const FROM = "Thái";

/**
 * Khung thời gian anh rảnh theo thứ: 0 = Chủ nhật … 6 = Thứ 7.
 * [từ lúc nào anh đón được, buổi hẹn phải xong trước lúc nào]; null = không hiện ngày đó.
 * - Thứ 2, 3, 5: anh bận từ 22h.
 * - Các ngày khác: xong trước 23h để em về nghỉ (em làm ca).
 */
export const AVAILABILITY: Record<number, [string, string] | null> = {
  0: ["12:00", "23:00"],
  1: ["18:00", "22:00"],
  2: ["18:00", "22:00"],
  3: ["18:00", "23:00"],
  4: ["18:00", "22:00"],
  5: ["18:00", "23:00"],
  6: ["12:00", "23:00"],
};

/** Khoảng cách giữa các giờ đón, tính bằng phút. */
export const STEP_MINUTES = 30;

/** Hôm nay chỉ hiện giờ đón cách thời điểm hiện tại ít nhất chừng này phút (để anh kịp qua đón). */
export const LEAD_MINUTES = 60;

/** Lịch chạy đến hết năm nay; nếu còn ít hơn MIN_DAYS ngày thì kéo dài cho đủ. */
export const MIN_DAYS = 14;

/** Số tuần hiện sẵn, còn lại bấm "Xem thêm". */
export const WEEKS_SHOWN = 2;

export type ActivityId = "phim" | "cafe" | "an" | "bowling" | "cung" | "patin" | "bang" | "khac";

export interface Activity {
  id: ActivityId;
  title: string;
  sub: string;
  /** Tổng thời gian từ lúc đón đến lúc đưa em về, tính bằng phút. */
  duration: number;
  /** Giờ đón hợp lý cho hoạt động này (giờ mở cửa, giờ ăn…). Bỏ trống = không giới hạn thêm. */
  pickupWindows?: [string, string][];
  /** Giải thích ngắn hiện trên lịch khi em chọn hoạt động này. */
  note?: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: "phim",
    title: "Xem phim",
    sub: "Phim nào hay em chọn",
    duration: 180,
    note: "Xem phim mất khoảng 3 tiếng cả đi lại, nên tối thứ 2, 3, 5 anh đón muộn nhất 19:00.",
  },
  { id: "cafe", title: "Cafe chill", sub: "Ngồi nói chuyện, xả stress", duration: 90 },
  {
    id: "an",
    title: "Đi ăn",
    sub: "Bữa trưa hoặc bữa tối",
    duration: 120,
    pickupWindows: [
      ["11:00", "12:30"],
      ["17:00", "20:00"],
    ],
    note: "Đi ăn thì anh đón vào giờ bữa trưa hoặc bữa tối.",
  },
  { id: "bowling", title: "Bowling", sub: "Thua thì mời nước", duration: 120 },
  {
    id: "cung",
    title: "Bắn cung",
    sub: "Chiều cuối tuần",
    duration: 150,
    pickupWindows: [["09:00", "16:30"]],
    note: "Sân bắn cung thường đóng cửa lúc 19h, chơi khoảng 2 tiếng, nên chỉ đi được chiều cuối tuần.",
  },
  {
    // Giờ mở cửa sân patin không thống nhất; giả định đóng cửa khoảng 22h như trung tâm thương mại.
    // Chơi ~1,5 tiếng + đi lại => đón muộn nhất 19:30. Kiểm tra giờ sân cụ thể rồi chỉnh nếu cần.
    id: "patin",
    title: "Trượt patin",
    sub: "Ngã thì anh đỡ",
    duration: 150,
    pickupWindows: [["09:00", "19:30"]],
    note: "Trượt patin khoảng 1,5 tiếng, anh đón muộn nhất 19:30 để kịp chơi trước khi sân đóng cửa.",
  },
  {
    // Vincom Ice Rink Royal City mở 9:30 – 22:00 hằng ngày, mỗi phiên 1 tiếng 30 phút.
    // Phiên 1,5 tiếng + ~30 phút đi từ Xuân Đỉnh => đón muộn nhất 20:00.
    id: "bang",
    title: "Trượt băng",
    sub: "Mùa đông trong nhà",
    duration: 150,
    pickupWindows: [["09:00", "20:00"]],
    note: "Sân băng mở đến 22h, mỗi phiên 1,5 tiếng, nên anh đón muộn nhất 20:00 (tối thứ 2, 3, 5 thì 19:30).",
  },
  { id: "khac", title: "Em chọn chỗ khác", sub: "Tuỳ em hết", duration: 120 },
];

/** Dùng khi em chưa chọn đi đâu: cho xem lịch với thời lượng ngắn nhất. */
export const DEFAULT_DURATION = 90;
