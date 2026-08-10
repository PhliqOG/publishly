import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { ComposerReplica } from '@gitroom/frontend/components/marketing/replicas/composer-replica';

export const metadata: Metadata = { title: 'Publishing' };

export default function PublishingPage() {
  return (
    <ProductMarketingPage
      eyebrow="Publishing"
      title="One idea. Ten native destinations."
      lede="Draft once, tailor the parts that differ, validate against each provider, and hand every destination to a durable server-side workflow."
      visual={<ComposerReplica />}
      items={[
        { title: 'Universal composer', body: 'Images, video, carousels, per-network captions, first comments, thumbnails, and platform settings appear only where supported.' },
        { title: 'Validation before queueing', body: 'Character limits, attachment counts, MIME types, file sizes, and provider settings are checked before a job enters the schedule.' },
        { title: 'Independent destinations', body: 'One failed destination does not roll back networks that already published successfully.' },
      ]}
    />
  );
}
