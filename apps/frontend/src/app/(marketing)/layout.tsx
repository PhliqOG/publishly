import type { Metadata } from 'next';
import { ReactNode } from 'react';
import {
  Bricolage_Grotesque,
  Public_Sans,
  IBM_Plex_Mono,
} from 'next/font/google';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import { MotionRuntime } from '@gitroom/frontend/components/marketing/motion';
import './marketing.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--mk-font-display',
  weight: ['600', '700', '800'],
});
const body = Public_Sans({
  subsets: ['latin'],
  variable: '--mk-font-body',
  weight: ['400', '500', '600', '700'],
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--mk-font-mono',
  weight: ['400', '500', '600'],
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
        {children}
        <MotionRuntime />
      </body>
    </html>
  );
}
