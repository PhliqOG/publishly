import React from 'react';

// Publishly lockup: mark + wordmark. Same 101x33 viewBox contract as the old
// component so surrounding layout is unaffected; wordmark inherits
// currentColor for dark/light contexts.
export const LogoTextComponent = () => {
  return (
    <svg
      width="101"
      height="33"
      viewBox="0 0 101 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="4" width="25" height="25" rx="7" fill="#4F46E5" />
      <path d="M5.6 17.3 L21.9 8.6 L13.2 19.5 Z" fill="#FFFFFF" />
      <path d="M21.9 8.6 L17 24.6 L13.2 19.5 Z" fill="#7DD3FC" />
      <path d="M13.2 19.5 L11.6 23.9 L14.5 21.2 Z" fill="#0EA5E9" />
      <text
        x="31"
        y="22.5"
        fill="currentColor"
        fontSize="15.5"
        fontWeight="700"
        fontFamily="inherit"
        letterSpacing="-0.02em"
      >
        Publishly
      </text>
    </svg>
  );
};
