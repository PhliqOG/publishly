'use client';

import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react';

// ApiTerminal — the one client component in the marketing tree (it types).
// Plays a two-act post lifecycle on loop: the happy path (queued → uploading →
// sent → confirmed_live receipt), then a recoverable failure (classified →
// alert sent → safe retry → confirmed live). Types
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
  { text: ' curl -X POST https://your-publishly-host/public/v1/posts \\\n' },
  { text: "    -H 'Authorization: " },
  { text: 'YOUR_API_KEY', cls: 'mk-term-key' },
  { text: "' \\\n" },
  {
    text:
      "    -H 'Idempotency-Key: launch-day-2026-08-14' \\\n" +
      "    -H 'Content-Type: application/json' \\\n" +
      '    -d \'{"type":"schedule","date":"2026-08-14T18:00:00.000Z","shortLink":false,"tags":[],"posts":[{"integration":{"id":"ig_01"},"value":[{"content":"Launch day.","image":[]}],"settings":{"__type":"instagram","post_type":"post"}}]}\'\n',
    id: 'cmd1',
  },
  { text: '\n[{ "postId": "post_01HZX4", "integration": "ig_01" }]\n' },
  { text: '↳ receipt: queued\n', cls: 'mk-term-key', id: 'q1' },
  { text: '↳ receipt: uploading\n', cls: 'mk-term-state', id: 'proc1' },
  { text: '↳ receipt: sent (not success)\n', cls: 'mk-term-state' },
  {
    text: '↳ receipt: confirmed_live ✓ instagram.com/p/DLm4…\n',
    cls: 'mk-term-ok',
    id: 'pub1',
  },
  { text: '↳ webhook: post.receipt\n', cls: 'mk-term-state' },
  {
    text:
      '  { "specversion": "1.0",\n' +
      '    "id": "post.receipt:post_01HZX4:confirmed_live:1:76ab",\n' +
      '    "type": "post.receipt",\n' +
      '    "time": "2026-08-14T18:00:08.214Z",\n' +
      '    "data": { "postId": "post_01HZX4",\n' +
      '      "integrationId": "ig_01", "provider": "instagram",\n' +
      '      "stage": "confirmed_live", "attempt": 1,\n' +
      '      "providerPostId": "180450001",\n' +
      '      "providerUrl": "https://instagram.com/p/DLm4…",\n' +
      '      "confirmationMethod": "instagram_media_read",\n' +
      '      "evidence": { "mediaType": "IMAGE" },\n' +
      '      "failureId": null } }\n',
    id: 'wh1',
  },
  // — loop 2: a recoverable failure is explained, alerted, and retried safely
  { text: '\n' },
  { text: '$', cls: 'mk-term-prompt' },
  {
    text: " curl -X POST …/public/v1/posts -H 'Idempotency-Key: new-drop-2026-08-14' -d '{…}'\n",
    id: 'cmd2',
  },
  { text: '\n[{ "postId": "post_01HZX5", "integration": "ig_01" }]\n' },
  { text: '↳ receipt: queued\n', cls: 'mk-term-key', id: 'q2' },
  {
    text: '↳ receipt: retrying — Instagram rate limit (rate_limited)\n',
    cls: 'mk-term-fail',
    id: 'fail',
  },
  { text: '↳ webhook: post.failure\n', cls: 'mk-term-retry' },
  {
    text:
      '  { "specversion": "1.0",\n' +
      '    "id": "post.failure:post_01HZX5:retry:1:rate_limited",\n' +
      '    "type": "post.failure",\n' +
      '    "time": "2026-08-14T18:01:02.110Z",\n' +
      '    "data": { "postId": "post_01HZX5", "attempt": 1,\n' +
      '      "integrationId": "ig_01", "provider": "instagram",\n' +
      '      "willRetry": true,\n' +
      '      "failure": { "class": "recoverable",\n' +
      '        "code": "rate_limited",\n' +
      '        "reason": "Instagram asked us to slow down." } } }\n',
    id: 'wh2',
  },
  {
    text: '↳ alert: sent — retry scheduled after 15 seconds\n',
    cls: 'mk-term-retry',
    id: 'alert2',
  },
  { text: '↳ retry: attempt 2 of 4\n', cls: 'mk-term-state', id: 'retry2' },
  { text: '↳ receipt: sent (not success)\n', cls: 'mk-term-state' },
  {
    text: '↳ receipt: confirmed_live ✓ instagram.com/p/DLm5…\n',
    cls: 'mk-term-ok',
    id: 'pub2',
  },
  { text: '✓ explained, alerted, retried, confirmed live', cls: 'mk-term-ok' },
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
  [offsetAfter('alert2'), 24],
  [offsetAfter('retry2'), 24],
  [offsetAfter('pub2'), 18],
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
  const bodyRef = useRef<HTMLDivElement | null>(null);
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
    if (mode !== 'armed' || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [count, mode]);

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
      <div className="mk-term-body" ref={bodyRef}>
        {/* SSR and no-JS show the complete transcript. Once animation starts,
            screen readers retain one stable full transcript while the visual
            layer types and scrolls without announcing every character. */}
        {mode === 'static' ? (
          <div>{renderTyped(TOTAL, false)}</div>
        ) : (
          <>
            <span className="mk-visually-hidden">
              {SEGMENTS.map((segment) => segment.text).join('')}
            </span>
            <div aria-hidden="true">{renderTyped(count, true)}</div>
          </>
        )}
      </div>
    </div>
  );
}
