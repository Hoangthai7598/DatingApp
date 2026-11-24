import { useId } from "react";

/**
 * "Bắp": an original popcorn-bucket mascot that matches the cinema-ticket theme.
 * Moods: happy (default), sad (droopy brows, frown), cry (sad + welling eyes + falling tears).
 */
export type Mood = "happy" | "sad" | "cry";

const WINE = "#4a0f25";
const ROSE = "#f7c9d4";
const CREAM = "#fff6e0";
const BUTTER = "#ffd23f";

export default function Mascot({ mood = "happy", size = 96, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const sad = mood !== "happy";
  const clip = `bap-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={`mascot mascot-${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={mood === "happy" ? "Bắp đang vui" : mood === "sad" ? "Bắp đang buồn" : "Bắp sắp khóc"}
    >
      {/* popcorn puffs */}
      <g className="mascot-pop">
        {[
          [30, 34, 13],
          [48, 24, 15],
          [68, 22, 15],
          [88, 32, 13],
          [40, 40, 12],
          [60, 36, 13],
          [80, 42, 12],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={i % 3 === 0 ? BUTTER : CREAM} stroke={WINE} strokeWidth="2.5" />
        ))}
      </g>
      {/* bucket: tapered, striped */}
      <path d="M22 46 H98 L90 110 Q60 116 30 110 Z" fill="#fff" stroke={WINE} strokeWidth="3" strokeLinejoin="round" />
      <clipPath id={clip}>
        <path d="M22 46 H98 L90 110 Q60 116 30 110 Z" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {[26, 50, 74].map((x) => (
          <path key={x} d={`M${x} 44 h12 l-4 72 h-12 z`} fill={ROSE} />
        ))}
      </g>
      <path d="M20 46 H100" stroke={WINE} strokeWidth="4" strokeLinecap="round" />

      {/* face panel */}
      <rect x="38" y="60" width="44" height="34" rx="12" fill="#fff" stroke={WINE} strokeWidth="2.5" />

      {/* brows */}
      {sad ? (
        <g stroke={WINE} strokeWidth="2.5" strokeLinecap="round">
          {/* inner ends raised = worried/sad (not angry) */}
          <path d="M45 69.5 Q49 67 53 65.5" />
          <path d="M75 69.5 Q71 67 67 65.5" />
        </g>
      ) : null}

      {/* eyes */}
      {mood === "happy" ? (
        <g stroke={WINE} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M47 75 q4 -5 8 0" />
          <path d="M65 75 q4 -5 8 0" />
        </g>
      ) : (
        <g>
          <circle cx="51" cy="75" r="4" fill={WINE} />
          <circle cx="69" cy="75" r="4" fill={WINE} />
          <circle cx="52.5" cy="73.5" r="1.3" fill="#fff" />
          <circle cx="70.5" cy="73.5" r="1.3" fill="#fff" />
        </g>
      )}

      {/* welling eyes + tears */}
      {mood === "cry" && (
        <g className="mascot-tears">
          <path d="M45.5 79 q5.5 3 11 0" stroke="#7cc4f0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M63.5 79 q5.5 3 11 0" stroke="#7cc4f0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path className="tear tear-l" d="M47 80 q-4 6.5 0 9 q4 -2.5 0 -9 z" fill="#7cc4f0" />
          <path className="tear tear-r" d="M73 80 q-4 6.5 0 9 q4 -2.5 0 -9 z" fill="#7cc4f0" />
        </g>
      )}

      {/* mouth */}
      {mood === "happy" ? (
        <path d="M54 84 q6 6 12 0" stroke={WINE} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      ) : (
        <path
          className={mood === "cry" ? "mascot-wobble" : undefined}
          d="M54 89 q6 -5 12 0"
          stroke={WINE}
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
        />
      )}

      {/* ticket tag */}
      <g transform="rotate(-12 96 92)">
        <rect x="86" y="84" width="22" height="13" rx="3" fill={BUTTER} stroke={WINE} strokeWidth="2" />
        <circle cx="90" cy="90.5" r="1.6" fill={WINE} />
      </g>
    </svg>
  );
}
