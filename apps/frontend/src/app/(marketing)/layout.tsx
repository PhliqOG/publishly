import type { Metadata } from 'next';
import { ReactNode } from 'react';
import {
  Bricolage_Grotesque,
  Public_Sans,
  IBM_Plex_Mono,
} from 'next/font/google';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
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
  title: {
    default: `${MARKETING.brand} — social scheduling that leaves on time`,
    template: `%s — ${MARKETING.brand}`,
  },
  description: MARKETING.sub,
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
      </body>
    </html>
  );
}
