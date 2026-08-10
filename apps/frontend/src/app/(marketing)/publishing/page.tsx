import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { ComposerReplica } from '@gitroom/frontend/components/marketing/replicas/composer-replica';

export const metadata: Metadata = { title: 'Publishing' };

export default function PublishingPage() {
  return (
    <ProductMarketingPage
      eyebrow="Publishing"
      title="One idea. 10 native destinations."
      lede="Draft once, tailor what differs per network, validate against each provider’s real limits & hand every destination to a durable server-side workflow."
      visual={<ComposerReplica />}
      spotlight={{
        eyebrow: 'Composer',
        heading: 'Write once, tailor every voice.',
        body: 'The core message stays one draft. Captions, tags & first comments adapt per network — with live previews & each platform’s real limits enforced before you hit schedule.',
        points: [
          'Per-network caption variants',
          'Media rules checked before scheduling',
          'First comments & platform settings',
        ],
      }}
      statement="A post to six networks is six deliveries. One failure retries alone — the other five stay published & the calendar reports each destination honestly."
      items={[
        {
          title: 'Universal composer',
          body: 'Compose images, video, carousels & per-network captions in one draft. First comments, thumbnails & platform settings appear only where a network supports them.',
          points: [
            '1 draft, 10 possible destinations',
            'Controls gated by network capability',
          ],
        },
        {
          title: 'Validation before queueing',
          body: 'Character limits, attachment counts, MIME types, file sizes & provider settings are checked before a job ever enters the schedule.',
          points: [
            'Checked against each provider’s real limits',
            'Problems surface before anything queues',
          ],
        },
        {
          title: 'Independent destinations',
          body: 'Each destination publishes as its own durable delivery. A failed network retries alone while the rest stay published.',
          points: [
            'Honest per-network status',
            'Conservative retries, never blind re-posts',
          ],
        },
      ]}
    />
  );
}
