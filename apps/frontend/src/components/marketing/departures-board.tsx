'use client';

import { useEffect, useMemo, useState } from 'react';

// The signature element: today's outgoing content rendered as a departures
// board. Illustrative product data only (clearly generic handles) - never
// styled as real customer activity. Statuses flip split-flap style; with
// prefers-reduced-motion the board renders a calm static mix.

type Row = {
  time: string;
  network: string;
  title: string;
  status: 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED';
};

const TITLES: Array<[string, string]> = [
  ['Instagram', 'Reel — behind the workbench'],
  ['TikTok', 'Cut 02 — the unboxing answer'],
  ['YouTube', 'Short — one-minute walkthrough'],
  ['LinkedIn', 'Post — what we learned shipping v2'],
  ['X', 'Thread — 7 scheduling mistakes'],
  ['Pinterest', 'Pin — spring lookbook board'],
];

function nextSlots(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  for (let i = 0; i < count; i++) {
    out.push(
      `${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes()
      ).padStart(2, '0')}`
    );
    d.setMinutes(d.getMinutes() + (i % 2 === 0 ? 30 : 60));
  }
  return out;
}

export const DeparturesBoard = () => {
  const [reduced, setReduced] = useState(false);
  const [clock, setClock] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [flipping, setFlipping] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const slots = nextSlots(TITLES.length);
    setRows(
      TITLES.map(([network, title], i) => ({
        time: slots[i],
        network,
        title,
        status: mq.matches
          ? i < 2
            ? 'PUBLISHED'
            : 'SCHEDULED'
          : 'SCHEDULED',
      }))
    );

    const tick = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const clockTimer = setInterval(tick, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    if (reduced || !rows.length) {
      return;
    }
    const timer = setInterval(() => {
      setRows((current) => {
        const idx = current.findIndex((r) => r.status !== 'PUBLISHED');
        if (idx === -1) {
          return current.map((r, i) => ({
            ...r,
            status: i === 0 ? r.status : r.status,
          }));
        }
        const next = [...current];
        next[idx] = {
          ...next[idx],
          status:
            next[idx].status === 'SCHEDULED' ? 'PUBLISHING' : 'PUBLISHED',
        };
        setFlipping(idx);
        setTimeout(() => setFlipping(null), 500);
        return next;
      });
    }, 2600);
    return () => clearInterval(timer);
  }, [reduced, rows.length]);

  const allDone = useMemo(
    () => rows.length > 0 && rows.every((r) => r.status === 'PUBLISHED'),
    [rows]
  );

  return (
    <div className="mk-board" aria-label="Illustration: today's scheduled posts leaving on time">
      <div className="mk-board-head">
        <span>
          TODAY · <strong>CONTENT DEPARTURES</strong>
        </span>
        <span suppressHydrationWarning>{clock}</span>
      </div>
      <div className="mk-board-rows">
        {rows.map((row, i) => (
          <div className="mk-board-row" key={row.network}>
            <span className="mk-board-time">{row.time}</span>
            <span className="mk-board-network">{row.network}</span>
            <span className="mk-board-title">{row.title}</span>
            <span className="mk-board-status">
              <span
                className={`mk-flap ${flipping === i ? 'mk-flipping' : ''}`}
                data-status={row.status}
              >
                {row.status}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mk-board-foot">
        {allDone
          ? 'All departures completed. Tomorrow is already scheduled.'
          : 'Publishly keeps the timetable — you keep the voice.'}
      </div>
    </div>
  );
};
