import type { ActivityId } from "@/lib/config";

const W = "#4a0f25";
const Y = "#ffd23f";
const R = "#e05a7a";

const paths: Record<ActivityId, React.ReactNode> = {
  phim: (
    <>
      <rect x="3" y="7" width="24" height="17" rx="3" fill={W} />
      <path d="M3 12h24M3 19h24" stroke={Y} strokeWidth="2" strokeDasharray="3 3" />
    </>
  ),
  cafe: (
    <>
      <rect x="5" y="10" width="15" height="14" rx="3" fill={W} />
      <path d="M20 13h3a3 3 0 0 1 0 6h-3" stroke={W} strokeWidth="2.5" fill="none" />
      <path d="M10 3c0 3 3 3 3 6" stroke={R} strokeWidth="2" fill="none" />
    </>
  ),
  an: (
    <>
      <path d="M4 15h22a11 9 0 0 1-22 0z" fill={W} />
      <path d="M9 11c0-3 3-3 3-6M16 11c0-3 3-3 3-6" stroke={R} strokeWidth="2" fill="none" />
    </>
  ),
  bowling: (
    <>
      <circle cx="15" cy="16" r="11" fill={W} />
      <circle cx="12" cy="11" r="2" fill={Y} />
      <circle cx="18" cy="11" r="2" fill={Y} />
      <circle cx="15" cy="17" r="2" fill={Y} />
    </>
  ),
  cung: (
    <>
      <circle cx="15" cy="15" r="12" fill="#f7c9d4" />
      <circle cx="15" cy="15" r="8" fill={W} />
      <circle cx="15" cy="15" r="3.5" fill={Y} />
    </>
  ),
  khac: <path d="M15 4l3 7 7 1-5 5 1.5 7.5L15 21l-6.5 3.5L10 17 5 12l7-1z" fill={Y} stroke={W} strokeWidth="1.5" />,
};

export function ActivityIcon({ id }: { id: ActivityId }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}
