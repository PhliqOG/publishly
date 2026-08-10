// Publishly logo v2 — Stripe/Metricool-school: a clean lowercase wordmark
// with one geometric accent, the amber parallelogram (a "post card" mid-
// flight). The wordmark inherits the display font & current text color;
// the accent is the only color note.

export const PublishlyGlyph = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden
    className="mk-glyph"
  >
    <path d="M6.2 3.5 H 17.5 L 13.8 16.5 H 2.5 Z" fill="#D99B21" />
    <path
      d="M6.2 3.5 H 17.5 L 13.8 16.5 H 2.5 Z"
      fill="none"
      stroke="rgba(19,52,88,0.18)"
      strokeWidth="0.5"
    />
  </svg>
);

import { MARKETING } from './marketing.config';

export const PublishlyWordmark = ({ compact = false }: { compact?: boolean }) => (
  <span className="mk-wordmark">
    <PublishlyGlyph />
    {!compact && (
      <span className="mk-wordmark-text">
        {MARKETING.brand.toLowerCase()}
      </span>
    )}
  </span>
);

// Legacy mark (P-calendar-cell) kept for compatibility with existing call
// sites; superseded by the wordmark in marketing chrome.
export const PublishlyMark = ({ size = 26 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden
    className="mk-mark"
  >
    <rect x="4.5" y="3.5" width="4.6" height="21" fill="currentColor" />
    <path
      d="M9.1 5.75 H 21.25 V 15.55 H 9.1"
      stroke="currentColor"
      strokeWidth="4.5"
    />
    <circle cx="15" cy="10.65" r="2.7" fill="#D99B21" />
  </svg>
);
