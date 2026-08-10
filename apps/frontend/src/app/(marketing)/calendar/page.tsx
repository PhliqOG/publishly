import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { CalendarBoard } from '@gitroom/frontend/components/marketing/hero-cinema';

export const metadata: Metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <ProductMarketingPage
      eyebrow="Calendar"
      title="See the whole publishing week move."
      lede="Month, week & day views keep drafts, queued work, failures & published content in one schedule you can rearrange directly."
      visual={<CalendarBoard mini />}
      visualTone="light"
      spotlight={{
        eyebrow: 'The board',
        heading: 'Month, week & day — one schedule.',
        body: 'Drafts, queued posts, failures & published work share one board. Drag an item to a new slot & its durable workflow moves with it — no orphaned jobs, no stale timers.',
        points: [
          'Drag-and-drop rescheduling',
          'Filter by platform, account & state',
          'Timezone-safe slots',
        ],
      }}
      statement="The calendar is not a picture of the plan — it is the plan. Move a slot & the publishing pipeline moves with it."
      items={[
        {
          title: 'Drag to reschedule',
          body: 'Move an item & its durable workflow updates with it — no old browser timer left behind to fire at the wrong moment.',
        },
        {
          title: 'Filter the noise',
          body: 'Narrow by platform, connected account or publishing state when the board gets busy.',
        },
        {
          title: 'Bulk changes with a preview first',
          body: 'Preview CSV validation before committing, shift selected dates or cancel a group — handled server-side, not in one long browser request.',
        },
      ]}
    />
  );
}
