import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import { MotionRuntime } from '@gitroom/frontend/components/marketing/motion';
import './marketing.css';

const display = Geist({
  subsets: ['latin'],
  variable: '--mk-font-display',
});
const body = Geist({
  subsets: ['latin'],
  variable: '--mk-font-body',
});
const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--mk-font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.MAIN_URL || 'http://localhost:4200'),
  title: {
    default: `${MARKETING.brand} — social scheduling that leaves on time`,
    template: `%s — ${MARKETING.brand}`,
  },
  description: MARKETING.sub,
  manifest: '/site.webmanifest',
  icons: {
    icon: '/publishly.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    title: MARKETING.brand,
    description: MARKETING.sub,
    images: [{ url: '/publishly-social.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: MARKETING.brand,
    description: MARKETING.sub,
    images: ['/publishly-social.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`mk-body ${display.variable} ${body.variable} ${mono.variable}`}
      >
        <a href="#mk-main" className="mk-skip">
          Skip to content
        </a>
        {children}
        <MotionRuntime />
      </body>
    </html>
  );
}
