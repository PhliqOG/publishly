// The Publishly mark: a P whose bowl is a square calendar cell holding one
// accent dot — a post, in its slot. Drawn in currentColor so it works on
// paper and on ink; the dot pops in once on load (mk-mark-dot keyframes).
export const PublishlyMark = ({ size = 26 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden
    className="mk-mark"
  >
    {/* stem */}
    <rect x="4.5" y="3.5" width="4.6" height="21" fill="currentColor" />
    {/* square bowl — the calendar cell */}
    <path
      d="M9.1 5.75 H 21.25 V 15.55 H 9.1"
      stroke="currentColor"
      strokeWidth="4.5"
    />
    {/* the post, in its slot */}
    <circle cx="15" cy="10.65" r="2.7" fill="#4F46E5" className="mk-mark-dot" />
  </svg>
);
