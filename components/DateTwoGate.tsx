"use client";

import { useEffect, useRef, useState } from "react";
import { sendFeedback, userAgent } from "@/lib/store";
import Mascot, { type Mood } from "./Mascot";

/**
 * Popup shown when the page opens: "Mình gặp nhau thêm một buổi nữa nhé?" (a second date).
 * Shown every time the page opens (nothing is remembered between visits).
 * - Có: close and go on to the usual picker.
 * - Không once: Telegram notice, Bắp gets sad, then tears up, and asks again.
 * - Không twice: another Telegram notice and a gentle goodbye, with a way back if she changes her mind.
 * - Changing her mind sends nothing: Thái hears from her when she books (bookings table).
 * Notices go through the feedback table, which already forwards to Telegram.
 */

type Phase = "hidden" | "ask" | "sad" | "bye";
type Send = "idle" | "sending" | "sent" | "error";

const FIRST_NO = "🥺 Em bấm Không lần 1 (Bắp đang hỏi lại em).";
const DECLINE_MESSAGE = "💔 Em chọn KHÔNG đi date lần 2 (đã bấm Không 2 lần).";
const ACTIVITY = "Lời mời date lần 2";

export default function DateTwoGate() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [mood, setMood] = useState<Mood>("happy");
  const [send, setSend] = useState<Send>("idle");
  const mainRef = useRef<HTMLButtonElement>(null);

  // Show on every visit, after mount (keeps the static HTML free of the dialog).
  useEffect(() => {
    const open = () => setPhase("ask");
    open();
  }, []);

  // While open: lock page scroll, focus the main button; on "sad", tear up after a moment.
  useEffect(() => {
    if (phase === "hidden") return;
    mainRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = phase === "sad" ? setTimeout(() => setMood("cry"), 900) : undefined;
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [phase]);

  const yes = () => {
    setPhase("hidden");
    window.scrollTo({ top: 0 });
  };

  const notify = async () => {
    setSend("sending");
    try {
      await sendFeedback({ message: DECLINE_MESSAGE, activity: ACTIVITY, user_agent: userAgent() });
      setSend("sent");
    } catch {
      setSend("error");
    }
  };

  const no = () => {
    if (phase === "ask") {
      // Best effort: the second "Không" is the one that must get through.
      void sendFeedback({ message: FIRST_NO, activity: ACTIVITY, user_agent: userAgent() }).catch(() => {});
      setMood("sad");
      setPhase("sad");
      return;
    }
    setMood("cry");
    setPhase("bye");
    void notify();
  };

  if (phase === "hidden") return null;

  return (
    <div className="sheet-backdrop center">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="d2-title" aria-describedby="d2-desc">
        <Mascot mood={mood} size={128} className={mood === "cry" ? "shake" : mood === "happy" ? "hello" : ""} />

        {phase === "ask" && (
          <>
            <h2 id="d2-title">Mình gặp nhau thêm một buổi nữa nhé? 🌷</h2>
            <p id="d2-desc">
              Hôm nay anh nói ra rồi thì nhẹ lòng hơn nhiều. Không cần trả lời gì vội đâu, anh chỉ muốn được ngồi nói
              chuyện với em thêm một buổi.
            </p>
            <div className="sheet-actions">
              <button ref={mainRef} type="button" className="btn go" onClick={yes}>
                Ừ, gặp thêm nhé 💕
              </button>
              <button type="button" className="btn sheet-later" onClick={no}>
                Không
              </button>
            </div>
          </>
        )}

        {phase === "sad" && (
          <>
            <h2 id="d2-title">Thật hả em? 🥺</h2>
            <p id="d2-desc">
              {mood === "cry" ? "Bắp sắp khóc rồi nè… Chỉ một buổi thôi, em nghĩ lại chút nha?" : "Bắp buồn xíu đó…"}
            </p>
            <div className="sheet-actions">
              <button ref={mainRef} type="button" className="btn go" onClick={yes}>
                Thôi được, đi một buổi 💕
              </button>
              <button type="button" className="btn sheet-later" onClick={no}>
                Vẫn không
              </button>
            </div>
          </>
        )}

        {phase === "bye" && (
          <>
            <h2 id="d2-title">Anh hiểu rồi 🌷</h2>
            <p id="d2-desc">
              {send === "error"
                ? "Hình như mạng chập chờn, câu trả lời chưa gửi tới anh được."
                : "Cảm ơn em đã trả lời thật lòng. Anh vẫn quý em lắm, chúc em ca trực nào cũng nhẹ nhàng nha."}
            </p>
            <div className="sheet-actions">
              {send === "error" && (
                <button ref={mainRef} type="button" className="btn go" onClick={() => void notify()}>
                  Gửi lại
                </button>
              )}
              <button
                ref={send === "error" ? undefined : mainRef}
                type="button"
                className={send === "error" ? "btn sheet-later" : "btn go"}
                disabled={send === "sending"}
                onClick={yes}
              >
                Khoan, em đổi ý rồi 💕
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
