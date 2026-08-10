'use client';

import {
  KeyboardEvent,
  ReactElement,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

// Accessible tabs (WAI-ARIA pattern): arrow-key navigation, roving focus,
// aria-selected indicator. Content nodes are server-rendered JSX passed in.
export function Tabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
}): ReactElement {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = active === last ? 0 : active + 1;
    else if (e.key === 'ArrowLeft') next = active === 0 ? last : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="mk-tabs">
      <div
        role="tablist"
        className="mk-tablist"
        aria-label="Product areas"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            className="mk-tab"
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${baseId}-panel-${t.id}`}
          aria-labelledby={`${baseId}-tab-${t.id}`}
          hidden={i !== active}
          className="mk-tabpanel"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

// ScrollScene pins its children for the scene's height and scrubs the CSS
// custom property --p (0..1) with scroll position. All choreography lives in
// CSS calc()/clamp() off that one variable, so nothing re-renders per frame.
// Elements inside may carry:
//   data-live-after="0.84"  -> gains .mk-live once p passes the threshold
//   data-hide-after="0.25"  -> gains .mk-hidden once p passes the threshold
export function ScrollScene({ children }: { children: ReactNode }): ReactElement {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('mk-scene-static');
      return;
    }
    const liveEls = Array.from(el.querySelectorAll<HTMLElement>('[data-live-after]'));
    const hideEls = Array.from(el.querySelectorAll<HTMLElement>('[data-hide-after]'));
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      el.style.setProperty('--p', p.toFixed(4));
      for (const n of liveEls) {
        n.classList.toggle('mk-live', p >= parseFloat(n.dataset.liveAfter || '1'));
      }
      for (const n of hideEls) {
        n.classList.toggle('mk-hidden', p >= parseFloat(n.dataset.hideAfter || '1'));
      }
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="mk-scene" ref={ref}>
      {children}
    </section>
  );
}

// MotionRuntime mounts once in the marketing layout and reveals .mk-reveal
// elements as they enter the viewport (once each). Re-scans on route change
// so client-side navigations get their reveals too. data-delay="120" staggers.
export function MotionRuntime(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document
        .querySelectorAll('.mk-reveal')
        .forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          if (el.dataset.delay) el.style.transitionDelay = `${el.dataset.delay}ms`;
          el.classList.add('is-in');
          io.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 }
    );
    document
      .querySelectorAll('.mk-reveal:not(.is-in)')
      .forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
