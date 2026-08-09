import Link from 'next/link';
import { MARKETING } from './marketing.config';

const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
    <rect x="1" y="1" width="24" height="24" rx="7" fill="#4F46E5" />
    <path d="M7 17.5 19.5 7.5l-4.2 11-2.4-4.4L7 17.5Z" fill="#fff" />
    <path d="M12.9 14.1l6.6-6.6-4.2 11-2.4-4.4Z" fill="#0EA5E9" />
  </svg>
);

export const MarketingNav = () => (
  <nav className="mk-nav">
    <div className="mk-container mk-nav-inner">
      <Link href="/" className="mk-nav-logo">
        <Mark />
        {MARKETING.brand}
      </Link>
      <div className="mk-nav-links">
        <Link href="/features">Features</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/security">Security</Link>
      </div>
      <div className="mk-nav-spacer" />
      <Link href={MARKETING.authLogin} className="mk-signin">
        Sign in
      </Link>
      <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
        {MARKETING.cta.primary}
      </Link>
    </div>
  </nav>
);

export const MarketingFooter = () => (
  <footer className="mk-footer">
    <div className="mk-container">
      <div className="mk-footer-grid">
        <div>
          <div className="mk-nav-logo" style={{ marginBottom: 8 }}>
            <Mark />
            {MARKETING.brand}
          </div>
          <div>{MARKETING.openSource.line}</div>
          <div style={{ marginTop: 6 }}>
            <Link href="/source">{MARKETING.openSource.linkLabel}</Link>
          </div>
        </div>
        <div className="mk-footer-links">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/security">Security</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href={MARKETING.authLogin}>Sign in</Link>
        </div>
      </div>
      <div className="mk-footer-note">{MARKETING.footerNote}</div>
    </div>
  </footer>
);
