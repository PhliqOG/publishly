'use client';

// Original Publishly mark: a rounded post-tile with a paper-plane facet pair -
// "compose once, send everywhere". Two-tone indigo/sky, no resemblance to the
// upstream mark. Keep the 60x60 contract so layout spacing is unchanged.
export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      <rect x="7" y="7" width="46" height="46" rx="13" fill="#4F46E5" />
      <path d="M15.5 31.5 L45.5 15.5 L29.5 35.5 Z" fill="#FFFFFF" />
      <path d="M45.5 15.5 L36.5 45 L29.5 35.5 Z" fill="#7DD3FC" />
      <path
        d="M29.5 35.5 L26.5 43.5 L31.8 38.6 Z"
        fill="#0EA5E9"
      />
    </svg>
  );
};
