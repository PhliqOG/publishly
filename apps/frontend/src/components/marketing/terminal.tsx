'use client';

import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';

// ApiTerminal — the one client component in the marketing tree (it types).
// Types the curl exchange character-by-character the first time it enters
// the viewport; under prefers-reduced-motion the full text renders at once.
// A hidden full-text copy sizes the body up front, so typing never shifts
// layout, and doubles as the screen-reader text while the animated layer
// stays aria-hidden.

type Segment = { text: string; cls?: string };

// Newlines live inside the text — .mk-term-body is white-space: pre-wrap.
const SEGMENTS: Segment[] = [
  { text: '$', cls: 'mk-term-prompt' },
  { text: ' curl -X POST https://api.yourdomain.com/public/v1/posts \\\n' },
  { text: "    -H 'Authorization: " },
  { text: 'YOUR_API_TOKEN_HERE', cls: 'mk-term-key' },
  { text: "' \\\n" },
  {
    text: '    -d \'{ "content": "Launch day.", "when": "2026-08-14T18:00" }\'\n',
  },
  { text: '\n' },
  { text: '{ "id": "post_0123456789", "state": ' },
  { text: '"QUEUED"', cls: 'mk-term-key' },
  { text: ' }\n' },
  { text: '✓ scheduled — Thu 18:00', cls: 'mk-term-ok' },
];

const TOTAL = SEGMENTS.reduce((n, s) => n + s.text.length, 0);
// The command (through the blank line) types at ~18ms/char; the response
// after it arrives in fast bursts from the same interval.
const COMMAND_END = SEGMENTS.slice(0, 7).reduce((n, s) => n + s.text.length, 0);
const TICK_MS = 18;
const FAST_STEP = 5;

function renderTyped(count: number, withCaret: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let used = 0;
  for (let i = 0; i < SEGMENTS.length && used < count; i++) {
    const seg = SEGMENTS[i];
    const slice = seg.text.slice(0, count - used);
    out.push(
      seg.cls ? (
        <span className={seg.cls} key={i}>
          {slice}
        </span>
      ) : (
        <span key={i}>{slice}</span>
      )
    );
    used += slice.length;
    if (slice.length < seg.text.length) break;
  }
  if (withCaret) {
    out.push(<span className="mk-term-caret" key="caret" aria-hidden="true" />);
  }
  return out;
}

export function ApiTerminal(): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);
  const [count, setCount] = useState(0);
  // 'static' (SSR/no-JS/reduced motion: full text visible) -> 'armed' (JS will
  // animate: full text hidden, overlay empty) -> typing fills the overlay.
  const [mode, setMode] = useState<'static' | 'armed'>('static');

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      countRef.current = TOTAL;
      setCount(TOTAL);
      return;
    }
    setMode('armed');

    const start = () => {
      if (intervalRef.current || countRef.current >= TOTAL) return;
      intervalRef.current = setInterval(() => {
        const c = countRef.current;
        const next =
          c < COMMAND_END ? c + 1 : Math.min(TOTAL, c + FAST_STEP);
        countRef.current = next;
        setCount(next);
        if (next >= TOTAL && intervalRef.current) {
          // Done — nothing keeps running after the exchange completes.
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, TICK_MS);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return (
    <div className="mk-term" ref={rootRef}>
      <div className="mk-term-top">
        <span className="mk-term-dot" />
        <span className="mk-term-dot" />
        <span className="mk-term-dot" />
        <span className="mk-term-title">publishly api</span>
      </div>
      <div className="mk-term-body">
        <div style={{ position: 'relative' }}>
          {/* Full text reserves the final height & carries the a11y text.
              Visible by default so no-JS/SSR renders real content; hidden
              only once JS commits to animating. */}
          <div style={{ opacity: mode === 'static' ? 1 : 0 }}>
            {renderTyped(TOTAL, false)}
          </div>
          {/* Animated layer paints on top; hidden from screen readers so
              the 18ms churn never reaches them. */}
          {mode === 'armed' && (
            <div style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
              {renderTyped(count, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
