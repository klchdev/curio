/**
 * Curio's mark. It goes wherever Curio is speaking rather than the app itself:
 * the reasoning behind a suggestion, a portrait, an argument, a deep dive. Same
 * geometry as in the header — one lit cell out of four, "picked from many".
 */
export default function CurioMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="25" height="25" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" className="fill-emerald-400" />
      <rect x="17" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="9" y="17" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="17" y="17" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
