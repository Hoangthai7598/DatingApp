import { describe, expect, it } from "vitest";
import { ADS_MINUTES, ARRIVE_BEFORE_SHOW, AVAILABILITY, CINEMAS, DEFAULT_MOVIE_MINUTES, LEAD_MINUTES, TRAVEL_MINUTES } from "./config";
import {
  bookableMovies,
  cgvDate,
  listLotteCinemas,
  matchCinemaList,
  matchCinemas,
  mergeShowtimes,
  movieKey,
  parseLotteSchedule,
  normalize,
  parseCinemaSchedule,
  parseClock,
  posterUrl,
  showDates,
  showOptions,
  type ShowtimesData,
} from "./showtimes";

const RULES = {
  availability: AVAILABILITY,
  cinemas: CINEMAS,
  travelMinutes: TRAVEL_MINUTES,
  leadMinutes: LEAD_MINUTES,
  arriveBefore: ARRIVE_BEFORE_SHOW,
  adsMinutes: ADS_MINUTES,
  defaultMovieMinutes: DEFAULT_MOVIE_MINUTES,
};

// Shapes follow CGV's mobile endpoints.
const CINEMA_LIST = {
  data: [
    { name: "Hồ Chí Minh", cinemas: [{ id: "001", name: "CGV Hùng Vương Plaza", address: "126 Hùng Vương" }] },
    {
      name: "Hà Nội",
      cinemas: [
        { id: "021", name: "CGV Vincom Bắc Từ Liêm", address: "234 Phạm Văn Đồng" },
        { id: "014", name: "CGV IPH Hà Nội", address: "241 Xuân Thủy" },
        { id: "011", name: "CGV Vincom Bà Triệu", address: "191 Bà Triệu" },
      ],
    },
  ],
};

const schedule = (sessions: { time: string; is_booking?: boolean }[], movie = { sku: "26001", name: "Bò Sữa Bay", movie_endtime: 110 }) => ({
  data: [
    {
      date: "28/11/2026",
      movies: [
        {
          id: "m1",
          ...movie,
          rating_code: "T13",
          languages: [{ name: "2D Phụ Đề", sessions: sessions.map((s) => ({ is_booking: true, ...s })) }],
        },
      ],
    },
  ],
});

const data = (shows: ShowtimesData["shows"], movies: ShowtimesData["movies"] = [{ sku: "26001", name: "Bò Sữa Bay", duration: 110 }]): ShowtimesData => ({
  fetchedAt: "2026-11-25T22:00:00Z",
  source: "CGV",
  cinemas: [],
  movies,
  shows,
});
const btl = (date: string, time: string, sku = "26001") => ({ date, time, cinema: "btl", sku });
const xd = (date: string, time: string, sku = "26001") => ({ date, time, cinema: "xd", sku });
const times = (d: ShowtimesData, date: string, now = new Date(2026, 10, 25, 9, 0), sku = "26001") =>
  showOptions(d, sku, date, now, RULES).map((o) => `${o.time}@${o.cinema}→${o.pickup}`);

describe("parsing CGV", () => {
  it("normalize bỏ dấu và chữ đ", () => expect(normalize("CGV Vincom Bắc Từ Liêm - Đống Đa")).toBe("cgv vincom bac tu liem dong da"));
  it("cgvDate dạng DDMMYYYY", () => expect(cgvDate(new Date(2026, 10, 5))).toBe("05112026"));
  it("movieKey: cùng phim ở các chuỗi rạp ra cùng một khoá", () => {
    expect(movieKey("Bò Sữa Bay (T13)")).toBe("bo sua bay");
    expect(movieKey("BÒ SỮA BAY [Lồng tiếng]")).toBe("bo sua bay");
  });
  it("parseClock đọc được nhiều định dạng", () => {
    expect(parseClock("19:30")).toBe("19:30");
    expect(parseClock("1930")).toBe("19:30");
    expect(parseClock("", "2026-11-28 9:05:00")).toBe("09:05");
    expect(parseClock("abc", null)).toBeNull();
  });
  it("matchCinemas tìm rạp theo từ khoá không dấu, báo rạp không thấy", () => {
    const r = matchCinemas(CINEMA_LIST, CINEMAS);
    expect(r.found.map((c) => `${c.key}:${c.id}`)).toEqual(["btl:021", "iph:014"]);
    expect(r.missing).toEqual(["kosmo", "lwl", "xd"]);
    expect(r.all).toContain("CGV Vincom Bà Triệu");
  });
  it("parseCinemaSchedule lấy phim, thời lượng và suất còn bán", () => {
    const r = parseCinemaSchedule(schedule([{ time: "19:30" }, { time: "21:00", is_booking: false }]), "btl", "2026-11-28");
    expect(r.movies).toEqual([{ sku: "bo sua bay", name: "Bò Sữa Bay", rating: "T13", duration: 110 }]);
    expect(r.shows).toEqual([{ date: "2026-11-28", time: "19:30", cinema: "btl", sku: "bo sua bay", format: "2D Phụ Đề" }]);
  });
  it("bỏ thời lượng vô lý, chịu được dữ liệu thiếu", () => {
    const r = parseCinemaSchedule(schedule([{ time: "19:30" }], { sku: "x", name: "Phim X", movie_endtime: 1732800000 }), "btl", "2026-11-28");
    expect(r.movies[0].duration).toBeUndefined();
    expect(parseCinemaSchedule({ data: null }, "btl", "2026-11-28")).toEqual({ movies: [], shows: [] });
    expect(parseCinemaSchedule("oops", "btl", "2026-11-28")).toEqual({ movies: [], shows: [] });
  });
  it("mergeShowtimes gộp trùng và sắp xếp", () => {
    const a = parseCinemaSchedule(schedule([{ time: "21:00" }, { time: "19:30" }]), "btl", "2026-11-28");
    const m = mergeShowtimes([a, a]);
    expect(m.movies).toHaveLength(1);
    expect(m.shows.map((s) => s.time)).toEqual(["19:30", "21:00"]);
  });
});

// Shape follows Lotte's TicketingData.aspx responses (lists nested under varying keys).
const LOTTE_CINEMAS = {
  Cinemas: {
    Cinemas: {
      Items: [
        { DivisionCode: 1, DetailDivisionCode: "0001", CinemaID: 5001, CinemaNameKR: "Lotte Cinema Kosmo Tây Hồ", CinemaAddrSummary: "101 Xuân La, Bắc Từ Liêm, Hà Nội" },
        { DivisionCode: 1, DetailDivisionCode: "0001", CinemaID: 5002, CinemaNameKR: "Lotte Cinema West Lake", CinemaAddrSummary: "683 Lạc Long Quân, Tây Hồ, Hà Nội" },
        { DivisionCode: 1, DetailDivisionCode: "0002", CinemaID: 6001, CinemaNameKR: "Lotte Cinema Nam Sài Gòn", CinemaAddrSummary: "469 Nguyễn Hữu Thọ, TP.HCM" },
      ],
    },
  },
};
const LOTTE_PLAYS = {
  PlaySeqs: {
    Items: [
      { MovieNameKR: "Bò Sữa Bay", StartTime: "1930", PlayTime: 110, PlayDt: "2026-11-28", ViewGradeNameKR: "T13", FilmNameKR: "2D", TranslationDivisionNameKR: "Phụ đề" },
      { MovieNameKR: "Bò Sữa Bay", StartTime: "21:00", PlayTime: 110, PlayDt: "2026-11-28", IsBookingYN: "N" },
      { MovieNameKR: "Phim Khác", StartTime: "20:00", PlayDt: "2026-11-29" },
    ],
  },
};

describe("Lotte", () => {
  it("listLotteCinemas tạo id dạng Division|Detail|CinemaID và tìm được rạp", () => {
    const list = listLotteCinemas(LOTTE_CINEMAS);
    expect(list.map((c) => c.id)).toEqual(["1|0001|5001", "1|0001|5002", "1|0002|6001"]);
    const r = matchCinemaList(list, CINEMAS.filter((c) => c.chain === "lotte"));
    expect(r.found.map((c) => `${c.key}:${c.id}`)).toEqual(["kosmo:1|0001|5001", "lwl:1|0001|5002"]);
  });
  it("parseLotteSchedule: giờ HHMM, bỏ suất hết vé và ngày khác", () => {
    const r = parseLotteSchedule(LOTTE_PLAYS, "kosmo", "2026-11-28");
    expect(r.shows).toEqual([{ date: "2026-11-28", time: "19:30", cinema: "kosmo", sku: "bo sua bay", format: "2D Phụ đề" }]);
    expect(r.movies[0]).toEqual({ sku: "bo sua bay", name: "Bò Sữa Bay", rating: "T13", duration: 110 });
  });
  it("chịu được dữ liệu lạ", () => {
    expect(parseLotteSchedule({ IsOK: "false", ResultMessage: "x" }, "kosmo", "2026-11-28")).toEqual({ movies: [], shows: [] });
    expect(listLotteCinemas(null)).toEqual([]);
  });
  it("gộp với CGV: cùng một phim, giữ tên CGV", () => {
    const cgv = parseCinemaSchedule(schedule([{ time: "19:00" }], { sku: "26001", name: "Bò Sữa Bay", movie_endtime: 110 }), "btl", "2026-11-28");
    const lotte = parseLotteSchedule({ Items: [{ MovieNameKR: "BÒ SỮA BAY (T13)", StartTime: "1930", PlayDt: "2026-11-28" }] }, "kosmo", "2026-11-28");
    const m = mergeShowtimes([cgv, lotte]);
    expect(m.movies).toEqual([{ sku: "bo sua bay", name: "Bò Sữa Bay", rating: "T13", duration: 110 }]);
    expect(m.shows.map((x) => `${x.time}@${x.cinema}`)).toEqual(["19:00@btl", "19:30@kosmo"]);
  });
});

describe("showOptions: chỉ suất anh đi được", () => {
  it("tối họp (thứ 3): đón 18:30–19:00, em về trước 21:30", () => {
    const d = data([btl("2026-12-01", "18:30"), btl("2026-12-01", "19:00"), btl("2026-12-01", "19:30"), xd("2026-12-01", "19:00")]);
    // BTL cách em 10', đến sớm 15' → 19:00 đón 18:35; 18:30 đón 18:05 (sớm quá); 19:30 đón 19:05 (muộn quá)
    // XD cách em 20' → 19:00 đón 18:25 (sớm quá)
    expect(times(d, "2026-12-01")).toEqual(["19:00@btl→18:35"]);
  });
  it("tối họp: phim dài làm về muộn thì bỏ", () => {
    const long = data([btl("2026-12-01", "19:00")], [{ sku: "26001", name: "Phim dài", duration: 150 }]);
    // 19:00 + 15' quảng cáo + 150' + 10' về = 21:55 > 21:30
    expect(times(long, "2026-12-01")).toEqual([]);
  });
  it("cuối tuần: em phải về trước 23h", () => {
    const d = data([btl("2026-11-28", "20:30"), btl("2026-11-28", "21:00"), btl("2026-11-28", "12:30")]);
    // 20:30 → về 22:45 ✓; 21:00 → về 23:15 (muộn); 12:30 → đón 12:05 < 12:30 (anh rảnh 12:00 + 30' đi)
    expect(times(d, "2026-11-28")).toEqual(["20:30@btl→20:05"]);
  });
  it("hôm nay: đón phải cách hiện tại ít nhất 60 phút", () => {
    const now = new Date(2026, 10, 25, 18, 40);
    const d = data([btl("2026-11-25", "20:00"), btl("2026-11-25", "20:30")]);
    expect(times(d, "2026-11-25", now)).toEqual(["20:30@btl→20:05"]);
  });
  it("không biết thời lượng thì dùng mặc định 120'", () => {
    const d = data([btl("2026-12-01", "19:00")], [{ sku: "26001", name: "Phim" }]);
    // 19:00 + 15 + 120 + 10 = 21:25 ≤ 21:30
    expect(showOptions(d, "26001", "2026-12-01", new Date(2026, 10, 25), RULES)[0].dropOff).toBe("21:25");
  });
  it("rạp không có trong cấu hình thì bỏ qua", () => {
    expect(times(data([{ date: "2026-11-28", time: "19:00", cinema: "zzz", sku: "26001" }]), "2026-11-28")).toEqual([]);
  });
});

describe("showDates / bookableMovies", () => {
  it("chỉ ngày và phim có suất đi được, bỏ ngày đã qua", () => {
    const d = data(
      [btl("2026-11-24", "19:00"), btl("2026-11-28", "19:00"), btl("2026-11-30", "21:00"), btl("2026-12-01", "19:00", "26002")],
      [
        { sku: "26001", name: "Bò Sữa Bay", duration: 110 },
        { sku: "26002", name: "Phim Khuya", duration: 200 },
      ],
    );
    const now = new Date(2026, 10, 25, 9, 0);
    expect(showDates(d, "26001", now, RULES)).toEqual(["2026-11-28"]);
    expect(bookableMovies(d, now, RULES).map((m) => m.name)).toEqual(["Bò Sữa Bay"]);
  });
});

describe("posters", () => {
  it("posterUrl makes URLs absolute https and skips junk", () => {
    expect(posterUrl("https://www.cgv.vn", "", "http://cdn.x/a.jpg")).toBe("https://cdn.x/a.jpg");
    expect(posterUrl("https://www.cgv.vn", "//cdn.x/a.jpg")).toBe("https://cdn.x/a.jpg");
    expect(posterUrl("https://www.cgv.vn", "/media/a.jpg")).toBe("https://www.cgv.vn/media/a.jpg");
    expect(posterUrl("https://www.cgv.vn", "media/a.png")).toBe("https://www.cgv.vn/media/a.png");
    expect(posterUrl("https://www.cgv.vn", "javascript:alert(1)", "no-image", null)).toBeUndefined();
  });
  it("CGV thumbnail and Lotte PosterURL end up on the movie", () => {
    const cgv = parseCinemaSchedule(
      schedule([{ time: "19:30" }], { sku: "x", name: "Phim X", movie_endtime: 110, thumbnail: "https://www.cgv.vn/media/x.jpg" } as never),
      "btl",
      "2026-11-28",
    );
    expect(cgv.movies[0].poster).toBe("https://www.cgv.vn/media/x.jpg");
    const lotte = parseLotteSchedule(
      { Items: [{ MovieNameKR: "Phim Y", StartTime: "1930", PlayDt: "2026-11-28", PosterURL: "/Media/y.jpg" }] },
      "kosmo",
      "2026-11-28",
    );
    expect(lotte.movies[0].poster).toBe("https://www.lottecinemavn.com/Media/y.jpg");
  });
  it("merge keeps the first poster and fills a missing one", () => {
    const m = mergeShowtimes([
      { movies: [{ sku: "a", name: "A" }], shows: [] },
      { movies: [{ sku: "a", name: "A", poster: "https://l/a.jpg" }], shows: [] },
    ]);
    expect(m.movies[0].poster).toBe("https://l/a.jpg");
  });
});
