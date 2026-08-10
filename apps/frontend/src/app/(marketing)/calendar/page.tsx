import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { CalendarBoard } from '@gitroom/frontend/components/marketing/hero-cinema';

export const metadata: Metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <ProductMarketingPage
      eyebrow="Calendar"
      title="See the whole publishing week move."
      lede="Month, week, and day views keep drafts, queued work, failures, and published content in one responsive schedule."
      visual={<CalendarBoard mini />}
      items={[
        { title: 'Drag to reschedule', body: 'Moving an item updates its durable workflow instead of leaving an old browser timer behind.' },
        { title: 'Filter the noise', body: 'Narrow by platform, connected account, or publishing state when a calendar gets busy.' },
        { title: 'Bulk control', body: 'Preview CSV validation, shift selected dates, or cancel a group without tying up one long web request.' },
      ]}
    />
  );
}
