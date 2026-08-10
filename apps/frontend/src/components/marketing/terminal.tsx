'use client';

import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';

// ApiTerminal — the one client component in the marketing tree (it types).
// Plays a two-act post lifecycle on loop: the happy path (queued → published →
// post.published webhook), then the failure path (token expired →
// post.failure webhook → "you knew before the client did"). Types
// character-by-character while in the viewport, holds ~4s on the closing
// line, then replays from the top; the interval only runs while animating
// and is cleared when done or offscreen. Under prefers-reduced-motion the
// full transcript renders at once. A hidden full-text copy sizes the body up
// front, so typing never shifts layout, and doubles as the screen-reader
// text while the animated layer stays aria-hidden.

type Segment = { text: string; cls?: string; id?: string };

// Newlines live inside the text — .mk-term-body is white-space: pre-wrap.
// Webhook payload shapes mirror data/public-product-facts.json
// (reliability.success_webhook / reliability.failure_webhook).
const SEGMENTS: Segment[] = [
  // — loop 1: the happy path
  { text: '$', cls: 'mk-term-prompt' },
  { text: ' curl -X POST https://api.yourdomain.com/public/v1/posts \\\n' },
  { text: "    -H 'Authorization: " },
  { text: 'YOUR_API_KEY', cls: 'mk-term-key' },
  { text: "' \\\n" },
  {
    text: '    -d \'{ "content": "Launch day.", "when": "2026-08-14T18:00" }\'\n',
    id: 'cmd1',
  },
  { text: '\n{ "id": "post_01HZX4", "state": ' },
  { text: '"QUEUED"', cls: 'mk-term-key' },
  { text: ' }\n', id: 'q1' },
  { text: '→ PROCESSING\n', cls: 'mk-term-state', id: 'proc1' },
  {
    text: '→ PUBLISHED ✓ live: instagram.com/p/DLm4…\n',
    cls: 'mk-term-ok',
    id: 'pub1',
  },
  { text: '↳ webhook: post.published\n', cls: 'mk-term-state' },
  {
    text:
      '  { "id": "post_01HZX4",\n' +
      '    "type": "post.published",\n' +
      '    "providerUrl": "instagram.com/p/DLm4…" }\n',
    id: 'wh1',
  },
  // — loop 2: the failure path
  { text: '\n' },
  { text: '$', cls: 'mk-term-prompt' },
  {
    text: ' curl -X POST …/public/v1/posts -d \'{ "content": "New drop." }\'\n',
    id: 'cmd2',
  },
  { text: '\n{ "id": "post_01HZX5", "state": ' },
  { text: '"QUEUED"', cls: 'mk-term-key' },
  { text: ' }\n', id: 'q2' },
  {
    text: '→ FAILED — token expired (reconnect_required)\n',
    cls: 'mk-term-fail',
    id: 'fail',
  },
  { text: '↳ webhook: post.failure\n', cls: 'mk-term-retry' },
  {
    text:
      '  { "id": "post_01HZX5",\n' +
      '    "type": "post.failure",\n' +
      '    "failure": { "class": "user_action_needed",\n' +
      '      "code": "reconnect_required", "willRetry": false } }\n',
    id: 'wh2',
  },
  { text: '✓ you knew before the client did', cls: 'mk-term-ok' },
];

const TOTAL = SEGMENTS.reduce((n, s) => n + s.text.length, 0);

// Cumulative character offset through the segment tagged `id`.
function offsetAfter(id: string): number {
  let n = 0;
  for (const s of SEGMENTS) {
    n += s.text.length;
    if (s.id === id) return n;
  }
  return n;
}

const CMD1_END = offsetAfter('cmd1');
const LOOP2_START = offsetAfter('wh1');
const CMD2_END = offsetAfter('cmd2');

// Lifecycle beats: at these offsets the typing pauses briefly (in ticks),
// so states read as events instead of one burst. Ascending order.
const HOLDS: Array<[number, number]> = [
  [offsetAfter('q1'), 26],
  [offsetAfter('proc1'), 36],
  [offsetAfter('pub1'), 22],
  [LOOP2_START, 44],
  [offsetAfter('q2'), 26],
  [offsetAfter('fail'), 24],
  [offsetAfter('wh2'), 18],
];

// Commands type at ~18ms/char; responses arrive in fast bursts.
const TICK_MS = 18;
const FAST_STEP = 5;
const REPLAY_HOLD_MS = 4000;

const inCommand = (c: number) =>
  c < CMD1_END || (c >= LOOP2_START && c < CMD2_END);

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
  const replayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef(0);
  const holdRef = useRef(0);
  const heldRef = useRef<Set<number>>(new Set());
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

    const reset = () => {
      heldRef.current.clear();
      holdRef.current = 0;
      countRef.current = 0;
      setCount(0);
    };

    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (replayRef.current) {
        clearTimeout(replayRef.current);
        replayRef.current = null;
      }
    };

    const tick = () => {
      if (holdRef.current > 0) {
        holdRef.current -= 1;
        return;
      }
      const c = countRef.current;
      const hold = HOLDS.find(([at]) => at === c);
      if (hold && !heldRef.current.has(c)) {
        heldRef.current.add(c);
        holdRef.current = hold[1];
        return;
      }
      let next = Math.min(TOTAL, c + (inCommand(c) ? 1 : FAST_STEP));
      // Never burst past an unconsumed beat — land on it exactly.
      for (const [at] of HOLDS) {
        if (at > c && at < next && !heldRef.current.has(at)) {
          next = at;
          break;
        }
      }
      countRef.current = next;
      setCount(next);
      if (next >= TOTAL && intervalRef.current) {
        // Loop 2 done — clear the interval, hold on the closing line,
        // then replay from the top of loop 1.
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        replayRef.current = setTimeout(() => {
          replayRef.current = null;
          reset();
          start();
        }, REPLAY_HOLD_MS);
      }
    };

    const start = () => {
      if (intervalRef.current || replayRef.current) return;
      if (countRef.current >= TOTAL) reset();
      intervalRef.current = setInterval(tick, TICK_MS);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
        else stop();
      },
      { threshold: 0.35 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      stop();
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
