'use client';

import Link from 'next/link';
import {
  ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PublishlyWordmark } from './logo';
import { MARKETING } from './marketing.config';

// Stripe-pattern top nav: wordmark, mega-dropdowns (Products / Solutions /
// Developers / Resources), Pricing as a direct link, Sign in + Start now.
// Dropdown panels are translucent blur cards. Opens on hover & on click/
// focus (keyboard reachable); Escape and outside-click close.

type Item = { label: string; href: string; sub?: string };
type Menu = { label: string; items: Item[] };

const MENUS: Menu[] = [
  {
    label: 'Products',
    items: [
      { label: 'Reliability', href: '/reliability', sub: 'Receipts, webhooks & retries' },
      { label: 'Composer', href: '/features', sub: 'One draft, every voice' },
      { label: 'Calendar', href: '/calendar', sub: 'The week at a glance' },
      { label: 'Publishing', href: '/publishing', sub: 'Durable delivery' },
      { label: 'Analytics', href: '/product/analytics', sub: 'Numbers with receipts' },
      { label: 'Engagement', href: '/engagement', sub: 'One inbox' },
      { label: 'API', href: '/api-docs', sub: 'Scoped keys, real docs' },
    ],
  },
  {
    label: 'Solutions',
    items: [
      { label: 'Agencies', href: '/for-agencies', sub: 'Isolated client workspaces' },
      { label: 'Multi-brand', href: '/for-multi-brand', sub: 'One roster, no account tax' },
      { label: 'Creator networks', href: '/for-creator-networks', sub: 'Many creators, one calendar' },
      { label: 'Developers', href: '/for-developers', sub: 'Posting, embedded' },
    ],
  },
  {
    label: 'Developers',
    items: [
      { label: 'API docs', href: '/api-docs', sub: 'REST, scoped keys' },
      { label: 'Integrations', href: '/integrations', sub: 'API, webhooks, MCP & more' },
      { label: 'MCP server', href: '/integrations/mcp', sub: 'Post from an AI assistant' },
      { label: 'Error codes', href: '/docs/errors', sub: 'Every failure, documented' },
      { label: 'Platforms', href: '/platforms', sub: 'What each network supports' },
      { label: 'Security', href: '/security', sub: 'Tokens, keys & audit trail' },
      { label: 'Source', href: '/source', sub: 'AGPL-3.0 engine' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { label: 'Resources', href: '/resources', sub: 'Guides for multi-brand teams' },
      { label: 'Compare', href: '/compare', sub: 'Publishly vs the field' },
      { label: 'How we compare', href: '/methodology/api-comparisons', sub: 'Our sourcing rules' },
      { label: 'Changelog', href: '/changelog', sub: 'What shipped' },
      { label: 'About', href: '/about', sub: 'What Publishly is' },
      { label: 'Contact', href: '/contact', sub: 'Talk to the operator' },
      { label: 'Terms', href: '/terms', sub: 'The agreement' },
      { label: 'Privacy', href: '/privacy', sub: 'Your data' },
      { label: 'Acceptable use', href: '/acceptable-use', sub: 'The rules' },
    ],
  },
];

export function MegaNav(): ReactElement {
  const [open, setOpen] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openRef = useRef<number | null>(null);
  openRef.current = open;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Return focus to the trigger before its panel unmounts, so a keyboard
      // user is not dumped to <body> (WAI-ARIA disclosure pattern).
      const current = openRef.current;
      if (current !== null) triggerRefs.current[current]?.focus();
      setOpen(null);
      setMobileOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      cancelClose();
    };
  }, []);

  // Close an open panel when keyboard focus leaves the whole nav.
  const onNavBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setOpen(null);
    }
  };

  return (
    <nav className="mk-nav" ref={rootRef} aria-label="Main" onBlur={onNavBlur}>
      <div className="mk-container mk-nav-inner">
        <Link href="/" className="mk-nav-logo" aria-label={MARKETING.brand}>
          <PublishlyWordmark />
        </Link>

        <div className="mk-nav-links">
          {MENUS.map((menu, i) => (
            <div
              key={menu.label}
              className="mk-mega"
              onMouseEnter={() => {
                cancelClose();
                setOpen(i);
              }}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                ref={(el) => {
                  triggerRefs.current[i] = el;
                }}
                className="mk-mega-trigger"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {menu.label}
                <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden>
                  <path
                    d="M1 1 L4.5 4.5 L8 1"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {open === i && (
                <div
                  className="mk-mega-panel"
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  {menu.items.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="mk-mega-item"
                      onClick={() => setOpen(null)}
                    >
                      <span className="mk-mega-item-label">{item.label}</span>
                      {item.sub && (
                        <span className="mk-mega-item-sub">{item.sub}</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link href="/pricing" className="mk-mega-trigger mk-mega-plain">
            Pricing
          </Link>
        </div>

        <div className="mk-nav-spacer" />
        <Link href={MARKETING.authLogin} className="mk-signin">
          Sign in
        </Link>
        <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
          Start now
        </Link>
        <button
          type="button"
          className="mk-burger"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
            {mobileOpen ? (
              <path
                d="M2 2 L16 12 M16 2 L2 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M1 2 H17 M1 7 H17 M1 12 H17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="mk-mobile-panel">
          {MENUS.map((menu) => (
            <div className="mk-mobile-group" key={menu.label}>
              <div className="mk-mobile-title">{menu.label}</div>
              {menu.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="mk-mobile-link"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mk-mobile-group">
            <div className="mk-mobile-title">Pricing</div>
            <Link
              href="/pricing"
              className="mk-mobile-link"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href={MARKETING.authLogin}
              className="mk-mobile-link"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
