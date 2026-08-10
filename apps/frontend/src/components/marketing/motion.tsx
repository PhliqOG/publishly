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
  const firstRender = useRef(true);

  // GSAP micro-transition: the newly revealed panel rises in gently.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    import('gsap').then(({ gsap }) => {
      if (cancelled) return;
      const panel = document.getElementById(
        `${baseId}-panel-${tabs[active].id}`
      );
      if (panel) {
        gsap.fromTo(
          panel,
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' }
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, baseId, tabs]);

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

// Legacy scroll-scene (v3 cinema hero) — no longer used by any page; kept
// only so historical imports don't break. Safe to delete once hero-cinema's
// HeroCinema export is removed.
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

// MotionRuntime — GSAP edition. Mounts once in the marketing layout:
//  · hero intro: [data-hero-el] elements rise in sequence on load
//  · scroll reveals: .mk-reveal elements rise as they enter the viewport
//    (ScrollTrigger, once). Elements are visible by default (no-JS safe);
//    GSAP hides them at setup, so nothing flashes.
//  · everything sits inside gsap.matchMedia — reduced-motion users get the
//    static page untouched. Re-runs on route change.
export function MotionRuntime(): null {
  const pathname = usePathname();

  useEffect(() => {
    let mm: gsap.MatchMedia | null = null;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // nav settles in from above, once
        gsap.fromTo(
          '.mk-nav',
          { autoAlpha: 0, y: -12 },
          { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' }
        );

        const heroEls = gsap.utils.toArray<HTMLElement>('[data-hero-el]');
        if (heroEls.length) {
          gsap.fromTo(
            heroEls,
            { autoAlpha: 0, y: 26 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              ease: 'power3.out',
              stagger: 0.09,
              clearProps: 'all',
            }
          );
        }

        // calendar chips populate the board as it scrolls into view
        gsap.utils
          .toArray<HTMLElement>('.mk-shot-frame')
          .forEach((frameEl) => {
            const chips = frameEl.querySelectorAll('.mk-chip');
            if (!chips.length) return;
            gsap.fromTo(
              chips,
              { autoAlpha: 0, y: 10, scale: 0.94 },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.45,
                ease: 'power2.out',
                stagger: 0.05,
                clearProps: 'all',
                scrollTrigger: { trigger: frameEl, start: 'top 82%', once: true },
              }
            );
          });
        gsap.utils.toArray<HTMLElement>('.mk-reveal').forEach((el) => {
          gsap.fromTo(
            el,
            { autoAlpha: 0, y: 24 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.65,
              ease: 'power2.out',
              delay: (parseFloat(el.dataset.delay || '0') || 0) / 1000,
              scrollTrigger: { trigger: el, start: 'top 88%', once: true },
              clearProps: 'all',
            }
          );
        });
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, [pathname]);

  return null;
}
