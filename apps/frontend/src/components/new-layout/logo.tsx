'use client';

// The Publishly mark: a P whose stem carries a square calendar-cell bowl with
// one accent dot - a post, in its slot. Same geometry as the canonical
// marketing mark; drawn in currentColor so it follows the shell's text color.
// Keep the 60x60 contract so layout spacing is unchanged. Dot is static here -
// no dependency on marketing CSS.
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 28 28"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      {/* stem */}
      <rect x="4.5" y="3.5" width="4.6" height="21" fill="currentColor" />
      {/* square bowl - the calendar cell */}
      <path
        d="M9.1 5.75 H 21.25 V 15.55 H 9.1"
        stroke="currentColor"
        strokeWidth="4.5"
      />
      {/* the post, in its slot */}
      <circle cx="15" cy="10.65" r="2.7" fill="#4F46E5" />
    </svg>
  );
};
