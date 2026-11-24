"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  ADS_MINUTES,
  ARRIVE_BEFORE_SHOW,
  AVAILABILITY,
  CINEMAS,
  DEFAULT_DURATION,
  DEFAULT_MOVIE_MINUTES,
  LEAD_MINUTES,
  MIN_DAYS,
  STEP_MINUTES,
  TRAVEL_MINUTES,
  WEEKS_SHOWN,
  type ActivityId,
} from "@/lib/config";
import {
  ANY_TIME,
  DAY_SHORT,
  activityLabel,
  calendarDays,
  dayKey,
  formatDay,
  formatTime,
  formatRange,
  groupByWeek,
  relativeDay,
  slotsFor,
  type SlotRule,
} from "@/lib/invite";
import {
  bookableMovies,
  emptyShowtimes,
  parseIsoDate,
  showDates,
  showOptions,
  type ShowOption,
  type ShowRules,
  type ShowtimesData,
} from "@/lib/showtimes";
import { sendBooking, userAgent } from "@/lib/store";
import Feedback from "./Feedback";
import { ActivityIcon } from "./icons";

type Kind = "accept" | "later";
/** Kết quả gửi: đã lưu (anh nhận được qua Telegram) hoặc lỗi mạng sau khi đã tự thử lại. */
type Result = { kind: Kind; status: "saved" | "error" } | null;
/** time = giờ anh đón em. Với vé xem phim, show = suất chiếu em chọn. */
type PickedSlot = { key: string; date: Date; time: string; show?: ShowOption };

const ANY_MOVIE = "any";
const SHOW_RULES: ShowRules = {
  availability: AVAILABILITY,
  cinemas: CINEMAS,
  travelMinutes: TRAVEL_MINUTES,
  leadMinutes: LEAD_MINUTES,
  arriveBefore: ARRIVE_BEFORE_SHOW,
  adsMinutes: ADS_MINUTES,
  defaultMovieMinutes: DEFAULT_MOVIE_MINUTES,
};
const shortDay = (d: Date) => `${DAY_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
const showLabel = (p: PickedSlot) =>
  p.show ? `${formatDay(p.date)} · suất ${p.show.time} · ${p.show.cinemaLabel}` : `${formatDay(p.date)} · ${formatTime(p.time)}`;
const fmtFetched = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`;
};

export default function Invite() {
  const [activity, setActivity] = useState<ActivityId | null>(null);
  const [other, setOther] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [sending, setSending] = useState<Kind | null>(null);
  const [shown, setShown] = useState(WEEKS_SHOWN);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [pick, setPick] = useState<PickedSlot | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [stubVisible, setStubVisible] = useState(false);
  const [showtimes, setShowtimes] = useState<ShowtimesData | null>(null);
  const [movieSku, setMovieSku] = useState<string | null>(null);
  const otherRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLElement>(null);

  // Ngày tính theo giờ máy của người xem, nên chỉ tính sau khi trang chạy trên trình duyệt.
  // Làm mới mỗi phút để các giờ đã qua của hôm nay tự biến mất nếu em để trang mở lâu.
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  // Lịch chiếu CGV do GitHub Actions lấy mỗi sáng (scripts/fetch-showtimes.ts). Lỗi/thiếu file thì coi như rỗng.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/showtimes.json`, { signal: ctrl.signal, cache: "no-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<ShowtimesData>) : emptyShowtimes(`HTTP ${r.status}`)))
      .then((d) => setShowtimes(Array.isArray(d?.shows) && Array.isArray(d?.movies) ? d : emptyShowtimes("bad data")))
      .catch(() => !ctrl.signal.aborted && setShowtimes(emptyShowtimes("offline")));
    return () => ctrl.abort();
  }, []);

  const movies = useMemo(() => (showtimes && now ? bookableMovies(showtimes, now, SHOW_RULES) : []), [showtimes, now]);
  const movie = movies.find((m) => m.sku === movieSku);
  /** Đang chọn theo suất chiếu thật (đã chọn phim cụ thể và có lịch). */
  const movieMode = activity === "phim" && Boolean(movie);

  const act = ACTIVITIES.find((a) => a.id === activity);
  const rule: SlotRule = useMemo(() => act ?? { duration: DEFAULT_DURATION }, [act]);
  const slotsOf = (d: Date) => (now ? slotsFor(d, AVAILABILITY, rule, STEP_MINUTES, now, LEAD_MINUTES, TRAVEL_MINUTES) : []);
  const showOptsOf = (d: Date) => (now && showtimes && movie ? showOptions(showtimes, movie.sku, dayKey(d), now, SHOW_RULES) : []);
  // Cheap enough to recompute each render; the React compiler memoizes it.
  const weeks = !now
    ? []
    : movieMode && showtimes && movie
      ? groupByWeek(showDates(showtimes, movie.sku, now, SHOW_RULES).map(parseIsoDate), now)
      : groupByWeek(calendarDays(now, AVAILABILITY, rule, MIN_DAYS, STEP_MINUTES, LEAD_MINUTES, TRAVEL_MINUTES), now);

  /** Đổi hoạt động: giữ các lựa chọn còn hợp, bỏ các lựa chọn không còn hợp và báo cho em. */
  const chooseActivity = (id: ActivityId) => {
    const next = ACTIVITIES.find((a) => a.id === id)!;
    if (pick?.show && id !== "phim") {
      setPick(null);
      setDropped(`Suất chiếu em chọn không dùng cho "${next.title}", em chọn lại ngày giờ giúp anh nhé.`);
    } else if (now && pick && !pick.show) {
      const s = slotsFor(pick.date, AVAILABILITY, next, STEP_MINUTES, now, LEAD_MINUTES, TRAVEL_MINUTES);
      const ok = pick.time === ANY_TIME ? s.length > 0 : s.includes(pick.time);
      if (!ok) setPick(null);
      setDropped(ok ? null : `Ngày giờ em chọn không hợp với "${next.title}", em chọn lại giúp anh nhé.`);
    }
    setActivity(id);
    setOpenDay(null);
    touch();
  };

  useEffect(() => {
    if (activity === "khac") otherRef.current?.focus();
  }, [activity]);

  useEffect(() => {
    if (result) outRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  // Thanh "Chốt vé" dính đáy màn hình điện thoại, ẩn khi phần cuống vé đã hiện ra.
  useEffect(() => {
    const el = stubRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStubVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** Chọn phim: đổi phim thì bỏ suất của phim cũ. */
  const chooseMovie = (sku: string) => {
    if (pick && (pick.show ? pick.show.sku !== sku : sku !== ANY_MOVIE)) {
      setPick(null);
      setDropped(null);
    }
    setMovieSku(sku);
    setOpenDay(null);
    setShown(WEEKS_SHOWN);
    touch();
  };

  /** Chọn suất chiếu: lưu giờ đón tính sẵn. Chạm lại đúng suất đang chọn thì bỏ chọn. */
  const pickShow = (date: Date, opt: ShowOption) => {
    const key = dayKey(date);
    if (pick?.key === key && pick.show?.id === opt.id) {
      setPick(null);
    } else {
      setPick({ key, date, time: opt.pickup, show: opt });
      setOpenDay(null);
    }
    setDropped(null);
    touch();
  };

  const what = activityLabel(activity, other);
  const movieName = activity === "phim" && pick?.show ? movie?.name ?? "" : "";
  const ready = Boolean(what && pick);
  const dockOn = ready && !result && !stubVisible && !sending;

  const touch = () => setResult(null);

  /** Chọn giờ: thay lựa chọn cũ. Chạm lại đúng giờ đang chọn thì bỏ chọn. */
  const pickTime = (date: Date, time: string) => {
    const key = dayKey(date);
    if (pick?.key === key && pick.time === time) {
      setPick(null);
    } else {
      setPick({ key, date, time });
      setOpenDay(null);
    }
    setDropped(null);
    touch();
  };

  const clearPick = () => {
    setPick(null);
    setDropped(null);
    touch();
  };

  /** Chạm vào dòng ngày: ngày đang được chọn thì bỏ chọn, còn lại thì mở/đóng danh sách giờ. */
  const tapDay = (key: string) => {
    if (pick?.key === key) {
      clearPick();
      setOpenDay(null);
    } else {
      setOpenDay(openDay === key ? null : key);
    }
  };

  const slotLabel = pick
    ? pick.show
      ? `${shortDay(pick.date)} · ${pick.show.time} · ${pick.show.cinemaLabel} · đón ${pick.time}`
      : `${formatDay(pick.date)} · ${formatTime(pick.time)}`
    : "";

  /** Gửi vé (hoặc "để hôm khác") vào database; database báo Telegram cho anh. Tự thử lại khi mạng chập chờn. */
  const submit = async (kind: Kind) => {
    if (sending) return;
    setSending(kind);
    try {
      await sendBooking(
        kind === "accept"
          ? {
              kind,
              activity: what,
              day: pick?.key,
              pickup_time: pick?.time,
              slot_label: slotLabel,
              note,
              user_agent: userAgent(),
              movie: movieName || null,
              cinema: pick?.show?.cinemaLabel ?? null,
              showtime: pick?.show?.time ?? null,
            }
          : { kind, activity: what || null, note, user_agent: userAgent() },
      );
      setResult({ kind, status: "saved" });
    } catch {
      setResult({ kind, status: "error" });
    } finally {
      setSending(null);
    }
  };

  const confirm = () => submit("accept");

  return (
    <>
    <main className="ticket">
      <section className="sec">
        <h2><span>1</span>Em muốn đi đâu?</h2>
        <div className="opts">
          {ACTIVITIES.map((a) => (
            <button
              key={a.id}
              type="button"
              className="opt"
              aria-pressed={activity === a.id}
              onClick={() => chooseActivity(a.id)}
            >
              <ActivityIcon id={a.id} />
              <span><b>{a.title}</b><small>{a.sub}</small></span>
            </button>
          ))}
        </div>
        {activity === "khac" && (
          <input
            ref={otherRef}
            className="other"
            maxLength={80}
            placeholder="Em muốn đi đâu cũng được, ghi vào đây nhé"
            value={other}
            onChange={(e) => { setOther(e.target.value); touch(); }}
          />
        )}
        {activity === "phim" && (
          <div className="movies">
            <h3>Em muốn xem phim gì?</h3>
            {!showtimes ? (
              <p className="note">Đang tải lịch chiếu…</p>
            ) : movies.length === 0 ? (
              <p className="note">
                Hôm nay anh chưa lấy được lịch chiếu. Em cứ chọn ngày và giờ đón ở bước 2, anh đặt vé suất hợp nhất nhé.
              </p>
            ) : (
              <>
                <ul role="list">
                  {movies.map((m) => (
                    <li key={m.sku}>
                      <button type="button" className="movie" aria-pressed={movieSku === m.sku} onClick={() => chooseMovie(m.sku)}>
                        <b>{m.name}</b>
                        <small>
                          {[m.rating, m.duration ? `${m.duration} phút` : null].filter(Boolean).join(" · ") || "Đang chiếu"}
                        </small>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="movie any" aria-pressed={movieSku === ANY_MOVIE} onClick={() => chooseMovie(ANY_MOVIE)}>
                      <b>Phim nào cũng được</b>
                      <small>Em chọn giờ đón, anh chọn phim</small>
                    </button>
                  </li>
                </ul>
                {showtimes.fetchedAt && (
                  <p className="fetched">
                    Lịch chiếu CGV gần chỗ em, cập nhật lúc {fmtFetched(showtimes.fetchedAt)}. Chỉ hiện phim có suất anh đón và đưa em về kịp.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="sec perf">
        <h2><span>2</span>Hôm nào em được nghỉ?</h2>
        <p className="lead">
          Chạm vào ngày rồi chọn giờ anh qua đón. Chạm lại lần nữa nếu muốn bỏ chọn.
        </p>
        {!act && <p className="note">Em chọn đi đâu ở bước 1 trước nhé, giờ đón sẽ khớp với chỗ đó.</p>}
        {movieMode && movie ? (
          <p className="note">
            Đây là các suất chiếu <b>{movie.name}</b> anh đi được. Giờ đón đã tính sẵn để em tới rạp sớm {ARRIVE_BEFORE_SHOW} phút.
          </p>
        ) : (
          act?.note && <p className="note">{act.note}</p>
        )}
        {dropped && <p className="warn" role="status">{dropped}</p>}

        {pick && (
          <div className="chosen" role="status">
            <span className="t">
              <small>Em đã chọn</small>
              <b>{showLabel(pick)}</b>
              {pick.show && <small>Anh qua đón lúc {pick.time}</small>}
            </span>
            <button type="button" aria-label="Bỏ chọn" onClick={clearPick}>×</button>
          </div>
        )}

        <div className="cal">
          {weeks.slice(0, shown).map((w) => (
            <div key={w.key} className="week">
              <h3>{w.label}</h3>
              <ul>
                {w.days.map((d) => {
                  const k = dayKey(d);
                  const slots = movieMode ? [] : slotsOf(d);
                  const opts = movieMode ? showOptsOf(d) : [];
                  const rel = now ? relativeDay(d, now) : "";
                  const picked = pick?.key === k ? pick : null;
                  const open = openDay === k;
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <li key={k} className={`dayrow${picked ? " picked-day" : ""}${open ? " open" : ""}`}>
                      <button
                        type="button"
                        className="dayhead"
                        aria-expanded={open}
                        aria-controls={`t-${k}`}
                        aria-pressed={Boolean(picked)}
                        onClick={() => tapDay(k)}
                      >
                        <span className={`date${weekend ? " we" : ""}`}>
                          <small>{DAY_SHORT[d.getDay()]}</small>
                          <b>{d.getDate()}</b>
                        </span>
                        <span className="info">
                          <b>{formatDay(d)}{rel && <em className="rel">{rel}</em>}</b>
                          <small>
                            {picked
                              ? picked.show
                                ? `Đã chọn suất ${picked.show.time} · chạm để bỏ`
                                : `Đã chọn ${formatTime(picked.time)} · chạm để bỏ`
                              : movieMode
                                ? `${opts.length} suất · ${formatRange(opts.map((o) => o.time))}`
                                : `Anh đón được ${formatRange(slots)}`}
                          </small>
                        </span>
                        <span className="mark" aria-hidden="true">{picked ? "✓" : open ? "−" : "+"}</span>
                      </button>
                      {open && movieMode && (
                        <div className="shows" id={`t-${k}`}>
                          {opts.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              className="show"
                              aria-pressed={picked?.show?.id === o.id}
                              onClick={() => pickShow(d, o)}
                            >
                              <b>{o.time}</b>
                              <span>{o.cinemaLabel}{o.format ? ` · ${o.format}` : ""}</span>
                              <small>Đón {o.pickup} · về {o.dropOff}</small>
                            </button>
                          ))}
                        </div>
                      )}
                      {open && !movieMode && (
                        <div className="slots" id={`t-${k}`}>
                          {slots.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="tm"
                              aria-pressed={picked?.time === t}
                              onClick={() => pickTime(d, t)}
                            >
                              {t}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="tm any"
                            aria-pressed={picked?.time === ANY_TIME}
                            onClick={() => pickTime(d, ANY_TIME)}
                          >
                            Giờ nào cũng được
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {movieMode && weeks.length === 0 && (
          <p className="warn">Mấy ngày tới phim này không có suất nào anh đón kịp, em chọn phim khác nhé.</p>
        )}
        {shown < weeks.length && (
          <button type="button" className="btn more" onClick={() => setShown(shown + 2)}>
            Xem thêm 2 tuần nữa
          </button>
        )}
      </section>

      <section className="sec perf">
        <h2><span>3</span>Có gì dặn anh không?</h2>
        <textarea
          maxLength={200}
          placeholder="Ví dụ: em muốn ăn lẩu, em tự đi được, nhớ mang mũ cho em…"
          value={note}
          onChange={(e) => { setNote(e.target.value); touch(); }}
        />
      </section>

      <section className="sec perf stub" ref={stubRef} id="ve">
        <dl>
          <div className="kv">
            <dt>Đi đâu</dt>
            <dd className={what ? "" : "empty"}>{what || "Chưa chọn"}</dd>
          </div>
          {movieName && (
            <div className="kv">
              <dt>Phim</dt>
              <dd>{movieName}</dd>
            </div>
          )}
          <div className="kv">
            <dt>Ngày giờ</dt>
            <dd className={pick ? "" : "empty"}>{pick ? showLabel(pick) : "Chưa chọn"}</dd>
          </div>
          {pick?.show && (
            <div className="kv">
              <dt>Anh đón</dt>
              <dd>{pick.time}</dd>
            </div>
          )}
          {note.trim() && (
            <div className="kv">
              <dt>Lời dặn</dt>
              <dd>{note.trim()}</dd>
            </div>
          )}
        </dl>
        <button
          type="button"
          className="btn go"
          disabled={!ready || Boolean(sending) || result?.status === "saved"}
          onClick={confirm}
        >
          {sending === "accept"
            ? "Đang gửi vé…"
            : result?.status === "saved" && result.kind === "accept"
              ? "Đã gửi vé ✓"
              : result?.status === "error" && result.kind === "accept"
                ? "Gửi lại vé"
                : "Chốt vé này"}
        </button>
        {!ready && <p className="need">{!what ? "Em chọn đi đâu ở bước 1 nhé" : "Em chọn ít nhất một ngày ở bước 2 nhé"}</p>}

        {result?.status === "saved" && (
          <div className="out saved" ref={outRef} role="status">
            {result.kind === "accept" ? (
              <>
                <b>Anh nhận được vé rồi 🎟️</b>
                <span>{movieName ? `${movieName} · ` : `${what} · `}{pick ? showLabel(pick) : ""}</span>
                {pick?.show && <span>Anh qua đón em lúc {pick.time} nhé.</span>}
                <span>Anh sẽ nhắn em xác nhận sớm nhé. Muốn đổi thì em chọn lại rồi chốt lần nữa là được.</span>
              </>
            ) : (
              <>
                <b>Anh nhận được rồi nha</b>
                <span>Không sao đâu em, cứ nghỉ ngơi đã nhé. Khi nào rảnh em quay lại đây chọn ngày, anh đợi được 😊</span>
              </>
            )}
          </div>
        )}

        {result?.status === "error" && (
          <div className="out" ref={outRef} role="alert">
            <p className="fb-err">
              Mạng hơi chập chờn nên chưa gửi được. Em bấm{" "}
              {result.kind === "accept" ? "\"Gửi lại vé\"" : "lại nút bên dưới"} giúp anh nhé, lựa chọn của em vẫn còn nguyên.
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn later"
          disabled={Boolean(sending)}
          onClick={() => submit("later")}
        >
          Dạo này em bận, để hôm khác nhé
        </button>
      </section>

      <div className={`dock${dockOn ? " on" : ""}`} aria-hidden={!dockOn}>
        <small>{movieName || what}{pick ? ` · ${pick.show ? `${shortDay(pick.date)} · ${pick.show.time}` : `${formatDay(pick.date)} · ${formatTime(pick.time)}`}` : ""}</small>
        <button type="button" className="btn go" tabIndex={dockOn ? 0 : -1} onClick={confirm}>
          Chốt vé này
        </button>
      </div>
    </main>
    <Feedback activity={movieName ? `${what} · ${movieName}` : what} pickedSlot={slotLabel} />
    </>
  );
}
