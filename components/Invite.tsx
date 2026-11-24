"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  AVAILABILITY,
  DEFAULT_DURATION,
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
import { sendBooking, userAgent } from "@/lib/store";
import Feedback from "./Feedback";
import { ActivityIcon } from "./icons";

type Kind = "accept" | "later";
/** Kết quả gửi: đã lưu (anh nhận được qua Telegram) hoặc lỗi mạng sau khi đã tự thử lại. */
type Result = { kind: Kind; status: "saved" | "error" } | null;
type PickedSlot = { key: string; date: Date; time: string };

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

  const act = ACTIVITIES.find((a) => a.id === activity);
  const rule: SlotRule = useMemo(() => act ?? { duration: DEFAULT_DURATION }, [act]);
  const slotsOf = (d: Date) => (now ? slotsFor(d, AVAILABILITY, rule, STEP_MINUTES, now, LEAD_MINUTES, TRAVEL_MINUTES) : []);
  const weeks = useMemo(
    () => (now ? groupByWeek(calendarDays(now, AVAILABILITY, rule, MIN_DAYS, STEP_MINUTES, LEAD_MINUTES, TRAVEL_MINUTES), now) : []),
    [now, rule],
  );

  /** Đổi hoạt động: giữ các lựa chọn còn hợp, bỏ các lựa chọn không còn hợp và báo cho em. */
  const chooseActivity = (id: ActivityId) => {
    const next = ACTIVITIES.find((a) => a.id === id)!;
    if (now && pick) {
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

  const what = activityLabel(activity, other);
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

  const slotLabel = pick ? `${formatDay(pick.date)} · ${formatTime(pick.time)}` : "";

  /** Gửi vé (hoặc "để hôm khác") vào database; database báo Telegram cho anh. Tự thử lại khi mạng chập chờn. */
  const submit = async (kind: Kind) => {
    if (sending) return;
    setSending(kind);
    try {
      await sendBooking(
        kind === "accept"
          ? { kind, activity: what, day: pick?.key, pickup_time: pick?.time, slot_label: slotLabel, note, user_agent: userAgent() }
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
      </section>

      <section className="sec perf">
        <h2><span>2</span>Hôm nào em được nghỉ?</h2>
        <p className="lead">
          Chạm vào ngày rồi chọn giờ anh qua đón. Chạm lại lần nữa nếu muốn bỏ chọn.
        </p>
        {!act && <p className="note">Em chọn đi đâu ở bước 1 trước nhé, giờ đón sẽ khớp với chỗ đó.</p>}
        {act?.note && <p className="note">{act.note}</p>}
        {dropped && <p className="warn" role="status">{dropped}</p>}

        {pick && (
          <div className="chosen" role="status">
            <span className="t">
              <small>Em đã chọn</small>
              <b>{formatDay(pick.date)} · {formatTime(pick.time)}</b>
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
                  const slots = slotsOf(d);
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
                          <small>{picked ? `Đã chọn ${formatTime(picked.time)} · chạm để bỏ` : `Anh đón được ${formatRange(slots)}`}</small>
                        </span>
                        <span className="mark" aria-hidden="true">{picked ? "✓" : open ? "−" : "+"}</span>
                      </button>
                      {open && (
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
          <div className="kv">
            <dt>Ngày giờ</dt>
            <dd className={pick ? "" : "empty"}>{pick ? `${formatDay(pick.date)} · ${formatTime(pick.time)}` : "Chưa chọn"}</dd>
          </div>
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
                <span>{what} · {slotLabel}</span>
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
        <small>{what}{pick ? ` · ${formatDay(pick.date)} · ${formatTime(pick.time)}` : ""}</small>
        <button type="button" className="btn go" tabIndex={dockOn ? 0 : -1} onClick={confirm}>
          Chốt vé này
        </button>
      </div>
    </main>
    <Feedback activity={what} pickedSlot={pick ? `${formatDay(pick.date)} · ${formatTime(pick.time)}` : ""} />
    </>
  );
}
