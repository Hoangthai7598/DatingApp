"use client";

import { useEffect, useRef, useState } from "react";
import Mascot, { type Mood } from "./Mascot";

/**
 * "Em chắc chưa?" sheet shown before sending "dạo này em bận".
 * Bắp starts sad, then tears up after a moment. Escape / backdrop / "chọn lại" closes it.
 */
export default function LaterSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [mood, setMood] = useState<Mood>("sad");
  const stayRef = useRef<HTMLButtonElement>(null);

  // Keep the latest onCancel without re-running the effect (the parent re-renders every minute).
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    stayRef.current?.focus();
    const t = setTimeout(() => setMood("cry"), 900);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelRef.current();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="later-title"
        aria-describedby="later-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <Mascot mood={mood} size={128} className={mood === "cry" ? "shake" : ""} />
        <h2 id="later-title">Em chắc chưa? 🥺</h2>
        <p id="later-desc">
          {mood === "cry" ? "Bắp sắp khóc rồi nè… Em nghĩ lại chút được không?" : "Bắp buồn xíu đó…"}
        </p>
        <div className="sheet-actions">
          <button ref={stayRef} type="button" className="btn go" onClick={onCancel}>
            Thôi, để em chọn lại
          </button>
          <button type="button" className="btn sheet-later" onClick={onConfirm}>
            Ừ, dạo này em bận thật
          </button>
        </div>
      </div>
    </div>
  );
}
