import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { ComposerReplica } from '@gitroom/frontend/components/marketing/replicas/composer-replica';

export const metadata: Metadata = {
  title: 'Reliable social media publishing across multiple accounts',
  description:
    'Draft once, tailor each network, and get a clear result for every selected brand, client, or location account.',
  alternates: { canonical: '/publishing' },
};

export default function PublishingPage() {
  return (
    <ProductMarketingPage
      eyebrow="Publishing"
      title="Write once. Get proof everywhere it goes."
      lede="Draft the idea once, tailor what each network needs, and get a separate result for every selected brand, client, or location account."
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
      statement="A post sent to six selected brand accounts gets six results. One can fail and retry while the other five stay published."
      items={[
        {
          title: 'Every format in one draft',
          body: 'Compose images, video, carousels & per-network captions in one draft. First comments, thumbnails & platform settings appear only where a network supports them.',
          points: [
            '1 draft, 10 possible destinations',
            'Controls gated by network capability',
          ],
        },
        {
          title: 'No failures the composer could foresee',
          body: 'Character limits, attachment counts, MIME types, file sizes & provider settings are checked before a job ever enters the schedule.',
          points: [
            'Checked against each provider’s real limits',
            'Problems surface before anything queues',
          ],
        },
        {
          title: 'Each destination delivers on its own',
          body: 'Each selected account gets its own result. A failed network retries alone while the rest stay published.',
          points: [
            'Honest failure reporting',
            'Conservative retries, never blind re-posts',
          ],
        },
      ]}
    />
  );
}
