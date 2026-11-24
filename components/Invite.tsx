"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVITIES, FROM, NUM_DAYS, SLOTS, ZALO, type ActivityId } from "@/lib/config";
import { DAY_FULL, DAY_SHORT, acceptMessage, activityLabel, formatDay, laterMessage, upcomingDays, zaloLink } from "@/lib/invite";
import { ActivityIcon } from "./icons";

type Result = { text: string; done: string } | null;

export default function Invite() {
  const [activity, setActivity] = useState<ActivityId | null>(null);
  const [other, setOther] = useState("");
  const [days, setDays] = useState<Date[]>([]);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [copyLabel, setCopyLabel] = useState("Sao chép tin nhắn");
  const otherRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLPreElement>(null);

  // Ngày tính theo giờ máy của người xem, nên chỉ tính sau khi trang chạy trên trình duyệt.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDays(upcomingDays(new Date(), NUM_DAYS, SLOTS)), []);

  useEffect(() => {
    if (activity === "khac") otherRef.current?.focus();
  }, [activity]);

  useEffect(() => {
    if (result) outRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [result]);

  const day = dayIdx === null ? null : days[dayIdx];
  const slots = day ? SLOTS[day.getDay()] : [];
  const what = activityLabel(activity, other);
  const when = day ? formatDay(day) : "";
  const ready = Boolean(what && when && time);
  const zalo = useMemo(() => zaloLink(ZALO), []);

  const touch = () => setResult(null);

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

  const summary: [string, string][] = [
    ["Đi đâu", what],
    ["Ngày", when],
    ["Giờ đón", time ?? ""],
  ];
  if (note.trim()) summary.push(["Lời dặn", note.trim()]);

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
        <div className="days" aria-label="Chọn ngày">
          {days.map((d, i) => (
            <button
              key={d.toDateString()}
              type="button"
              className="day"
              aria-pressed={dayIdx === i}
              aria-label={`${DAY_FULL[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`}
              onClick={() => { setDayIdx(i); setTime(null); touch(); }}
            >
              <small>{DAY_SHORT[d.getDay()]}</small>
              <b>{d.getDate()}/{d.getMonth() + 1}</b>
            </button>
          ))}
        </div>
        <p className="hint">{day ? "Giờ anh qua đón em:" : "Chọn ngày trước rồi chọn giờ anh qua đón nhé."}</p>
        {slots.length > 0 && (
          <div className="times">
            {slots.map((s) => (
              <button key={s} type="button" className="tm" aria-pressed={time === s} onClick={() => { setTime(s); touch(); }}>
                {s}
              </button>
            ))}
          </div>
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

      <section className="sec perf stub">
        <dl>
          {summary.map(([k, v]) => (
            <div key={k} className="kv">
              <dt>{k}</dt>
              <dd className={v ? "" : "empty"}>{v || "Chưa chọn"}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="btn go"
          disabled={!ready}
          onClick={() =>
            setResult({
              text: acceptMessage(FROM, { activity: what, day: when, time: time ?? "", note }),
              done: "Em dán tin nhắn này gửi anh qua Zalo là xong nhé 😊",
            })
          }
        >
          Chốt vé này
        </button>

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
    </main>
  );
}
