/* ====== CHỈNH Ở ĐÂY ====== */

/** Thời gian đi từ nhà anh đến chỗ em (và từ chỗ em về nhà anh), phút. */
export const TRAVEL_MINUTES = 30;

export interface DayAvailability {
  /** Anh rảnh từ lúc này (ở nhà). Giờ đón sớm nhất = free + TRAVEL_MINUTES. */
  free: string;
  /** Đưa em về nhà trước lúc này (để em nghỉ, em làm ca). */
  dropOffBy: string;
  /** Anh phải có mặt ở nhà trước lúc này (vd họp). Đưa em về trước homeBy - TRAVEL_MINUTES. */
  homeBy?: string;
  /** Giờ đón muộn nhất, bất kể hoạt động. */
  latestPickup?: string;
}

/**
 * Lịch rảnh theo thứ: 0 = Chủ nhật … 6 = Thứ 7; null = không hiện ngày đó.
 * - Thứ 2, 3, 5: anh họp lúc 22h ở nhà, đón muộn nhất 19:00.
 * - Các ngày khác: đưa em về trước 23h.
 */
const MEETING_NIGHT: DayAvailability = { free: "18:00", dropOffBy: "23:00", homeBy: "22:00", latestPickup: "19:00" };
const FREE_EVENING: DayAvailability = { free: "18:00", dropOffBy: "23:00" };
const WEEKEND: DayAvailability = { free: "12:00", dropOffBy: "23:00" };

export const AVAILABILITY: Record<number, DayAvailability | null> = {
  0: WEEKEND,
  1: MEETING_NIGHT,
  2: MEETING_NIGHT,
  3: FREE_EVENING,
  4: MEETING_NIGHT,
  5: FREE_EVENING,
  6: WEEKEND,
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
    note: "Xem phim mất khoảng 3 tiếng cả đi lại, nên tối thứ 2, 3, 5 anh chỉ đón được lúc 18:30.",
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
    note: "Sân băng mở đến 22h, mỗi phiên 1,5 tiếng, nên anh đón muộn nhất 20:00 (tối thứ 2, 3, 5 thì 19:00).",
  },
  { id: "khac", title: "Em chọn chỗ khác", sub: "Tuỳ em hết", duration: 120 },
];

/** Dùng khi em chưa chọn đi đâu: cho xem lịch với thời lượng ngắn nhất. */
export const DEFAULT_DURATION = 90;

/* ====== LỊCH CHIẾU PHIM (CGV) ====== */

export interface CinemaConfig {
  /** Mã ngắn dùng trong dữ liệu, vd "btl". */
  key: string;
  /** Tên hiển thị trên trang. */
  label: string;
  /** Từ khoá để tìm rạp trong danh sách của CGV (không dấu, chữ thường; khớp một từ là được). */
  match: string[];
  /** Thời gian đi từ chỗ em tới rạp, phút. */
  travelFromHer: number;
}

/** Các rạp CGV gần Xuân Đỉnh. Script lấy lịch tìm rạp theo `match`; rạp nào không tìm thấy sẽ được báo trong log. */
export const CINEMAS: CinemaConfig[] = [
  { key: "btl", label: "CGV Vincom Bắc Từ Liêm", match: ["bac tu liem", "pham van dong"], travelFromHer: 10 },
  { key: "iph", label: "CGV IPH Xuân Thủy", match: ["iph", "indochina"], travelFromHer: 15 },
  { key: "xd", label: "CGV Xuân Diệu", match: ["xuan dieu"], travelFromHer: 20 },
];

/** Lấy lịch chiếu bao nhiêu ngày tới (tính cả hôm nay). */
export const SHOWTIME_DAYS = 7;

/** Đến rạp trước giờ chiếu bao lâu (lấy vé, bắp nước), phút. */
export const ARRIVE_BEFORE_SHOW = 15;

/** Quảng cáo trước phim, phút. */
export const ADS_MINUTES = 15;

/** Thời lượng phim mặc định khi CGV không cho biết, phút. */
export const DEFAULT_MOVIE_MINUTES = 120;
