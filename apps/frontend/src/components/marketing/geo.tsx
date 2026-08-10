import { ReactNode } from 'react';
import { MARKETING } from './marketing.config';

// Answer-engine building blocks — server components only. These implement the
// GEO layer honestly: extractable structure, accurate JSON-LD, visible
// authorship & dates. No hidden text, no LLM-directed markup, ever.

// 2–3 sentence direct answer at the top of a page, before any narrative.
export function QuickAnswer({ children }: { children: ReactNode }) {
  return (
    <div className="mk-answer">
      <span className="mk-answer-label">Quick answer</span>
      <p>{children}</p>
    </div>
  );
}

// Visible byline + dates (item 7). `updated` bumps only on real content change.
export function Byline({
  published,
  updated,
}: {
  published: string;
  updated?: string;
}) {
  return (
    <p className="mk-byline">
      By {MARKETING.byline} · Published {published}
      {updated && updated !== published ? ` · Updated ${updated}` : ''}
    </p>
  );
}

// Comparison-page freshness marker, fed from data/claim-provenance.json dates.
export function LastChecked({ date }: { date: string }) {
  return (
    <p className="mk-mono mk-lastchecked">
      Competitor pricing &amp; features last checked: {date}
    </p>
  );
}

export type FaqEntry = { q: string; a: string };

// FAQ block with accurate FAQPage JSON-LD derived from the visible content —
// the markup only ever describes what's on the page.
export function FaqBlock({
  title = 'Common questions',
  entries,
}: {
  title?: string;
  entries: FaqEntry[];
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
  return (
    <section className="mk-section mk-faq-block">
      <div className="mk-container">
        <h2 className="mk-h2">{title}</h2>
        <div className="mk-faq" style={{ marginTop: 28 }}>
          {entries.map((entry) => (
            <details key={entry.q}>
              <summary>{entry.q}</summary>
              <p>{entry.a}</p>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </section>
  );
}

// Same-rows comparison table (real HTML table, horizontally scrollable).
export function CompareTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[]; // first column is the row-label header
  rows: Array<string[]>; // each row: [label, ...cell per column]
}) {
  return (
    <div className="mk-tablewrap">
      <table className="mk-table">
        <caption className="mk-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={col} scope="col" className={i === 1 ? 'mk-table-us' : undefined}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells) => (
            <tr key={cells[0]}>
              {cells.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className={i === 1 ? 'mk-table-us' : undefined}>
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A standalone extractable fact sentence — number-bearing, self-contained.
export function FactLine({ children }: { children: ReactNode }) {
  return <p className="mk-fact">{children}</p>;
}

// Organization + SoftwareApplication entities (item 18). One stable @id;
// only properties the product actually has. Rendered once per page from the
// marketing layout.
export function EntityJsonLd() {
  const origin = MARKETING.siteUrl.replace(/\/$/, '');
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: MARKETING.brand,
    url: origin,
    description: MARKETING.entity,
  };
  const application = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${origin}/#software`,
    name: MARKETING.brand,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: origin,
    description: MARKETING.entity,
    publisher: { '@id': `${origin}/#organization` },
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Starter', price: '29', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Growth', price: '99', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Scale', price: '299', priceCurrency: 'USD' },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(application) }}
      />
    </>
  );
}
