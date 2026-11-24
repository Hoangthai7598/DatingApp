"use client";

import { useState } from "react";
import { MAX_FEEDBACK_LENGTH, sendFeedback, userAgent } from "@/lib/store";

type Status = "idle" | "sending" | "sent" | "error";

interface Props {
  /** What she has selected on the ticket, saved alongside the feedback for context. */
  activity?: string;
  pickedSlot?: string;
}

export default function Feedback({ activity, pickedSlot }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const submit = async () => {
    if (!text.trim() || status === "sending") return;
    setStatus("sending");
    try {
      await sendFeedback({
        message: text,
        activity: activity || null,
        picked_slot: pickedSlot || null,
        user_agent: userAgent(),
      });
      setStatus("sent");
      setText("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <aside className="fb" aria-labelledby="fb-title">
      <h2 id="fb-title">Góp ý cho anh</h2>
      <p>
        Lần đầu anh làm cái này nên còn bỡ ngỡ 😅 Có gì chưa ưng hay giận anh thì nhắn riêng anh ở đây nhé, đừng bơ anh
        là được :))
      </p>

      {status === "sent" ? (
        <div className="fb-sent" role="status">
          <b>Anh nhận được rồi nha 💌</b>
          <span>Cảm ơn em, anh sẽ đọc kỹ. Em muốn nói thêm thì cứ viết tiếp.</span>
          <button type="button" className="btn fb-go" onClick={() => setStatus("idle")}>
            Viết thêm
          </button>
        </div>
      ) : (
        <>
          <textarea
            maxLength={MAX_FEEDBACK_LENGTH}
            placeholder="Em muốn nói gì với anh cũng được…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {status === "error" && (
            <p className="fb-err" role="alert">
              Mạng hơi chập chờn nên chưa gửi được. Em bấm gửi lại giúp anh nhé, chữ em viết vẫn còn nguyên.
            </p>
          )}
          <button
            type="button"
            className="btn fb-go"
            disabled={!text.trim() || status === "sending"}
            onClick={submit}
          >
            {status === "sending" ? "Đang gửi…" : status === "error" ? "Gửi lại" : "Gửi góp ý cho anh"}
          </button>
          {status === "idle" && <p className="fb-hint">Góp ý gửi thẳng cho anh, chỉ mình anh đọc được.</p>}
        </>
      )}
    </aside>
  );
}
