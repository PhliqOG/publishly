import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { CalendarBoard } from '@gitroom/frontend/components/marketing/hero-cinema';

export const metadata: Metadata = {
  title: 'Social media content calendar for multi-brand teams',
  description:
    'Plan brands, clients, locations, and markets in month, week, or day views, then reschedule without breaking delivery.',
  alternates: { canonical: '/calendar' },
};

export default function CalendarPage() {
  return (
    <ProductMarketingPage
      eyebrow="Calendar"
      title="See what is planned, live, or needs attention."
      lede="Month, week, and day views keep drafts, scheduled posts, failures, and published content in one calendar you can change directly."
      visual={<CalendarBoard mini />}
      visualTone="light"
      spotlight={{
        eyebrow: 'The board',
        heading: 'Month, week & day — one schedule.',
        body: 'Drafts, scheduled posts, failures, and published work share one board. Drag a post to a new time and its schedule changes with it.',
        points: [
          'Drag-and-drop rescheduling',
          'Filter by platform, account & state',
          'Timezone-safe slots',
        ],
      }}
      statement="Move a post to a new time and Publishly updates the real schedule, not just the picture on your screen."
      items={[
        {
          title: 'Drag to reschedule',
          body: 'Move an item and its real schedule updates with it. Closing the browser does not stop the post.',
        },
        {
          title: 'Filter the noise',
          body: 'Narrow by platform, connected account or publishing state when the board gets busy.',
        },
        {
          title: 'Bulk changes with a preview first',
          body: 'Check a CSV before importing it, shift selected dates, or cancel a group without making the browser wait through the whole job.',
        },
      ]}
    />
  );
}
