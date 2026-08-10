import React from 'react';
import { BRAND_NAME } from '@gitroom/react/brand/brand';

// Publishly lockup: mark + wordmark. Same 101x33 viewBox contract as the old
// component so surrounding layout is unaffected. The mark reuses the canonical
// 28-unit geometry (stem, square calendar-cell bowl, accent dot) scaled into
// the 25px slot the old tile occupied; stem/bowl and wordmark inherit
// currentColor for dark/light contexts. Dot is static - no marketing CSS.
export const LogoTextComponent = () => {
  return (
    <svg
      width="101"
      height="33"
      viewBox="0 0 101 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(1 4) scale(0.8929)">
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
      </g>
      <text
        x="31"
        y="22.5"
        fill="currentColor"
        fontSize="15.5"
        fontWeight="700"
        fontFamily="inherit"
        letterSpacing="-0.02em"
      >
        {BRAND_NAME}
      </text>
    </svg>
  );
};
