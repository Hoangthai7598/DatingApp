"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  FROM,
  LEAD_MINUTES,
  MAX_PICKS,
  MIN_DAYS,
  PICKUP_WINDOWS,
  STEP_MINUTES,
  WEEKS_SHOWN,
  ZALO,
  type ActivityId,
} from "@/lib/config";
import {
  ANY_TIME,
  DAY_SHORT,
  acceptMessage,
  activityLabel,
  calendarDays,
  dayKey,
  formatDay,
  formatTime,
  formatWindow,
  groupByWeek,
  laterMessage,
  relativeDay,
  slotsFor,
  zaloLink,
  type WeekGroup,
} from "@/lib/invite";
import { ActivityIcon } from "./icons";

type Result = { text: string; done: string } | null;
type PickedSlot = { key: string; date: Date; time: string };

export default function Invite() {
  const [activity, setActivity] = useState<ActivityId | null>(null);
  const [other, setOther] = useState("");
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [shown, setShown] = useState(WEEKS_SHOWN);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [picks, setPicks] = useState<PickedSlot[]>([]);
  const [full, setFull] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [copyLabel, setCopyLabel] = useState("Sao chép tin nhắn");
  const [stubVisible, setStubVisible] = useState(false);
  const otherRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLPreElement>(null);
  const stubRef = useRef<HTMLElement>(null);

  // Ngày tính theo giờ máy của người xem, nên chỉ tính sau khi trang chạy trên trình duyệt.
  // Làm mới mỗi phút để các giờ đã qua của hôm nay tự biến mất nếu em để trang mở lâu.
  useEffect(() => {
    const refresh = () => {
      const t = new Date();
      setNow(t);
      setWeeks(groupByWeek(calendarDays(t, PICKUP_WINDOWS, MIN_DAYS, STEP_MINUTES, LEAD_MINUTES), t));
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

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
  const sorted = useMemo(() => [...picks].sort((a, b) => a.key.localeCompare(b.key)), [picks]);
  const ready = Boolean(what && picks.length);
  const zalo = useMemo(() => zaloLink(ZALO), []);
  const dockOn = ready && !result && !stubVisible;

  const touch = () => setResult(null);

  const pickTime = (date: Date, time: string) => {
    const key = dayKey(date);
    const existing = picks.find((p) => p.key === key);
    if (existing?.time === time) {
      setPicks(picks.filter((p) => p.key !== key));
      setFull(false);
    } else if (existing) {
      setPicks(picks.map((p) => (p.key === key ? { ...p, time } : p)));
    } else if (picks.length >= MAX_PICKS) {
      setFull(true);
      return;
    } else {
      setPicks([...picks, { key, date, time }]);
      setOpenDay(null);
    }
    touch();
  };

  const removePick = (key: string) => {
    setPicks(picks.filter((p) => p.key !== key));
    setFull(false);
    touch();
  };

  const confirm = () =>
    setResult({
      text: acceptMessage(
        FROM,
        what,
        sorted.map((p) => ({ day: formatDay(p.date), time: p.time })),
        note,
      ),
      done: "Em dán tin nhắn này gửi anh qua Zalo là xong nhé 😊",
    });

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopyLabel("Đã sao chép ✓");
    } catch {
      const sel = getSelection();
      if (msgRef.current && sel) {
        const r = document.createRange();
        r.selectNodeContents(msgRef.current);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      setCopyLabel("Đã bôi đen, em nhấn giữ để sao chép");
    }
    setTimeout(() => setCopyLabel("Sao chép tin nhắn"), 2500);
  };

  const pickLabel = (p: PickedSlot) => `${DAY_SHORT[p.date.getDay()]} ${p.date.getDate()}/${p.date.getMonth() + 1} · ${p.time === ANY_TIME ? "giờ nào cũng được" : p.time}`;

  return (
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
              onClick={() => { setActivity(a.id); touch(); }}
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
          Chạm vào ngày rồi chọn giờ anh qua đón. Em chọn được tối đa {MAX_PICKS} hôm, anh sẽ xếp theo lịch của em.
        </p>

        {sorted.length > 0 && (
          <ul className="picked" aria-label="Các lựa chọn của em">
            {sorted.map((p, i) => (
              <li key={p.key}>
                <span className="n">{i + 1}</span>
                <span className="t">{pickLabel(p)}</span>
                <button type="button" aria-label={`Bỏ ${pickLabel(p)}`} onClick={() => removePick(p.key)}>×</button>
              </li>
            ))}
          </ul>
        )}
        {full && <p className="warn" role="status">Em chọn đủ {MAX_PICKS} hôm rồi, bỏ bớt một hôm nếu muốn đổi nhé.</p>}

        <div className="cal">
          {weeks.slice(0, shown).map((w) => (
            <div key={w.key} className="week">
              <h3>{w.label}</h3>
              <ul>
                {w.days.map((d) => {
                  const k = dayKey(d);
                  const win = PICKUP_WINDOWS[d.getDay()];
                  const slots = now ? slotsFor(d, PICKUP_WINDOWS, STEP_MINUTES, now, LEAD_MINUTES) : [];
                  const rel = now ? relativeDay(d, now) : "";
                  const range = rel === "Hôm nay" && slots.length ? `${slots[0]} – ${win?.[1]}` : formatWindow(win);
                  const pick = picks.find((p) => p.key === k);
                  const open = openDay === k;
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <li key={k} className={`dayrow${pick ? " picked-day" : ""}${open ? " open" : ""}`}>
                      <button
                        type="button"
                        className="dayhead"
                        aria-expanded={open}
                        aria-controls={`t-${k}`}
                        onClick={() => setOpenDay(open ? null : k)}
                      >
                        <span className={`date${weekend ? " we" : ""}`}>
                          <small>{DAY_SHORT[d.getDay()]}</small>
                          <b>{d.getDate()}</b>
                        </span>
                        <span className="info">
                          <b>{formatDay(d)}{rel && <em className="rel">{rel}</em>}</b>
                          <small>{pick ? `Đã chọn: ${formatTime(pick.time)}` : `Anh đón được ${range}`}</small>
                        </span>
                        <span className="mark" aria-hidden="true">{pick ? "✓" : open ? "−" : "+"}</span>
                      </button>
                      {open && (
                        <div className="slots" id={`t-${k}`}>
                          {slots.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="tm"
                              aria-pressed={pick?.time === t}
                              onClick={() => pickTime(d, t)}
                            >
                              {t}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="tm any"
                            aria-pressed={pick?.time === ANY_TIME}
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
            <dt>{sorted.length > 1 ? "Em rảnh" : "Ngày giờ"}</dt>
            <dd className={sorted.length ? "" : "empty"}>
              {sorted.length
                ? sorted.map((p) => (
                    <span key={p.key} className="line">{formatDay(p.date)} · {formatTime(p.time)}</span>
                  ))
                : "Chưa chọn"}
            </dd>
          </div>
          {note.trim() && (
            <div className="kv">
              <dt>Lời dặn</dt>
              <dd>{note.trim()}</dd>
            </div>
          )}
        </dl>
        <button type="button" className="btn go" disabled={!ready} onClick={confirm}>
          Chốt vé này
        </button>
        {!ready && <p className="need">{!what ? "Em chọn đi đâu ở bước 1 nhé" : "Em chọn ít nhất một ngày ở bước 2 nhé"}</p>}

        {result && (
          <div className="out" ref={outRef}>
            <pre ref={msgRef}>{result.text}</pre>
            <div className="row">
              <button type="button" className="btn light" onClick={copy}>{copyLabel}</button>
              {zalo && (
                <a className="btn light" href={zalo} target="_blank" rel="noopener noreferrer">Mở Zalo gửi anh</a>
              )}
            </div>
            <p className="done">{result.done}</p>
          </div>
        )}

        <button
          type="button"
          className="btn later"
          onClick={() => setResult({ text: laterMessage(FROM), done: "Không sao đâu em, cứ nghỉ ngơi đã nhé. Anh đợi được 😊" })}
        >
          Dạo này em bận, để hôm khác nhé
        </button>
      </section>

      <div className={`dock${dockOn ? " on" : ""}`} aria-hidden={!dockOn}>
        <small>{what} · {sorted.length} lựa chọn</small>
        <button type="button" className="btn go" tabIndex={dockOn ? 0 : -1} onClick={confirm}>
          Chốt vé này
        </button>
      </div>
    </main>
  );
}
