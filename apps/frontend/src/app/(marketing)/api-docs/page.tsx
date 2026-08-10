import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';

export const metadata: Metadata = { title: 'API' };

// Paths are relative to /public/v1 & mirror the shipped public controller —
// keep this list in sync with backend/src/public-api/routes/v1.
const ENDPOINTS = [
  {
    method: 'POST',
    path: '/posts',
    note: 'Create, schedule or draft a post — validated server-side with the same rules as the dashboard, rejected as a readable 400.',
  },
  {
    method: 'GET',
    path: '/posts',
    note: 'List scheduled posts for a date range.',
  },
  {
    method: 'GET',
    path: '/posts/:id/status',
    note: 'Read the publishing job status of one post.',
  },
  {
    method: 'DELETE',
    path: '/posts/:id',
    note: 'Remove a post & its scheduled deliveries.',
  },
  {
    method: 'POST',
    path: '/upload',
    note: 'Upload a media file (multipart).',
  },
  {
    method: 'POST',
    path: '/upload-from-url',
    note: 'Import media from a URL into the workspace library.',
  },
  {
    method: 'GET',
    path: '/find-slot/:id',
    note: 'Return the next free posting slot for a channel.',
  },
  {
    method: 'GET',
    path: '/integrations',
    note: 'List connected channels & their identifiers.',
  },
  {
    method: 'GET',
    path: '/analytics/:integration',
    note: 'Platform-reported metrics for one connected channel.',
  },
];

export default function ApiMarketingPage() {
  return (
    <ProductMarketingPage
      eyebrow="API"
      title="Automate the schedule without widening access."
      lede="Issue workspace-owned keys, reveal them once & grant only the scopes each integration needs. Everything the app schedules, your scripts can schedule."
      endpoints={ENDPOINTS}
      capabilitiesHeading="Keys that behave like credentials."
      statement="Everything the app does, a scoped key can do — & nothing a scoped key was not granted."
      items={[
        {
          title: 'Keys shown once, hashed forever',
          body: 'Keys are hashed before storage — the raw value appears once at creation, is never recoverable from the database & revokes independently.',
        },
        {
          title: 'Scopes end where the grant ends',
          body: 'Grant read or write per resource — posts, integrations, media, notifications — & nothing beyond the grant.',
        },
        {
          title: 'Integrations you can watch & throttle',
          body: 'Server-side rate limiting & last-used timestamps keep every customer integration observable.',
        },
      ]}
    />
  );
}
