import { SocialProvider } from './social/social.integrations.interface';

export type ProviderCapabilities = {
  image: boolean;
  video: boolean;
  carousel: boolean;
  story: boolean;
  shortFormVideo: boolean;
  scheduledPublishing: boolean;
  firstComment: boolean;
  thumbnail: boolean;
  location: boolean;
  collaborators: boolean;
  tags: boolean;
  analytics: boolean;
  comments: boolean;
  commentReplies: boolean;
  directMessages: boolean;
  directMessageReplies: boolean;
};

type MediaCapabilities = Partial<
  Omit<
    ProviderCapabilities,
    | 'scheduledPublishing'
    | 'firstComment'
    | 'analytics'
    | 'comments'
    | 'commentReplies'
    | 'directMessages'
    | 'directMessageReplies'
  >
>;

// Conservative, implementation-backed flags. A missing flag is false; adding
// support requires changing both the provider implementation and this table.
const MEDIA_CAPABILITIES: Record<string, MediaCapabilities> = {
  instagram: {
    image: true,
    video: true,
    carousel: true,
    story: true,
    shortFormVideo: true,
    thumbnail: true,
    collaborators: true,
  },
  'instagram-standalone': {
    image: true,
    video: true,
    carousel: true,
    story: true,
    shortFormVideo: true,
    thumbnail: true,
    collaborators: true,
  },
  facebook: { image: true, video: true, carousel: true, story: true },
  tiktok: { image: true, video: true, carousel: true, shortFormVideo: true },
  youtube: { video: true, shortFormVideo: true, thumbnail: true, tags: true },
  x: { image: true, video: true, carousel: true },
  threads: { image: true, video: true, carousel: true },
  linkedin: { image: true, video: true, carousel: true },
  'linkedin-page': { image: true, video: true, carousel: true },
  pinterest: { image: true, video: true, carousel: true },
  bluesky: { image: true, video: true, carousel: true },
  mastodon: { image: true, video: true, carousel: true },
  testprovider: { image: true, video: true, carousel: true },
};

const EMPTY: ProviderCapabilities = {
  image: false,
  video: false,
  carousel: false,
  story: false,
  shortFormVideo: false,
  scheduledPublishing: false,
  firstComment: false,
  thumbnail: false,
  location: false,
  collaborators: false,
  tags: false,
  analytics: false,
  comments: false,
  commentReplies: false,
  directMessages: false,
  directMessageReplies: false,
};

export function providerCapabilities(
  provider: SocialProvider
): ProviderCapabilities {
  return {
    ...EMPTY,
    ...(MEDIA_CAPABILITIES[provider.identifier] || {}),
    scheduledPublishing: typeof provider.post === 'function',
    firstComment: typeof provider.comment === 'function',
    analytics:
      typeof provider.analytics === 'function' ||
      typeof provider.postAnalytics === 'function',
    comments: typeof provider.listComments === 'function',
    commentReplies: typeof provider.replyToComment === 'function',
    directMessages: typeof provider.listDirectMessages === 'function',
    directMessageReplies: typeof provider.sendDirectMessage === 'function',
  };
}
