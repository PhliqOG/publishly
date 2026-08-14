import { PostFailureClass } from './post.failure';

export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;

export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];
export type PlatformTruthState =
  | 'NOT_APPLICABLE'
  | 'READY'
  | 'LIMITED'
  | 'INVALID'
  | 'UNKNOWN';
export type PlatformPublishingMode =
  | 'NOT_APPLICABLE'
  | 'PUBLIC_CAPABLE'
  | 'ACCOUNT_RESTRICTED'
  | 'SELF_ONLY'
  | 'UNKNOWN';
export type PlatformAuditState =
  | 'NOT_APPLICABLE'
  | 'AUDITED'
  | 'UNAUDITED'
  | 'UNKNOWN';

export type PlatformTruthMetadata = {
  privacyLevelOptions?: TikTokPrivacyLevel[];
  commentDisabled?: boolean | null;
  duetDisabled?: boolean | null;
  stitchDisabled?: boolean | null;
  maxVideoDurationSeconds?: number | null;
  creatorNickname?: string | null;
  creatorUsername?: string | null;
  facebookPageLinked?: boolean;
};

export type PlatformTruthSnapshot = {
  state: PlatformTruthState;
  publishingMode: PlatformPublishingMode;
  auditState: PlatformAuditState;
  code: string;
  reason: string;
  checkedAt: Date;
  accountType?: string | null;
  linkedResourceId?: string | null;
  metadata?: PlatformTruthMetadata;
};

export type PlatformPreflightIssue = {
  failureClass: PostFailureClass;
  code: string;
  reason: string;
};

export type ComposeMediaTruth = {
  id?: string;
  path: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSize?: number | null;
  metadataStatus?: string | null;
  metadataVerified?: boolean;
};

const INSTAGRAM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const INSTAGRAM_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
const INSTAGRAM_MIN_IMAGE_RATIO = 4 / 5;
const INSTAGRAM_MAX_IMAGE_RATIO = 1.91;
const INSTAGRAM_VIDEO_MIN_SECONDS = 3;
const INSTAGRAM_VIDEO_MAX_SECONDS = 15 * 60;
const INSTAGRAM_STORY_MAX_SECONDS = 60;
const INSTAGRAM_VIDEO_MAX_WIDTH = 1920;

function text(value: unknown, fallback: string, max = 2_000) {
  return typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : fallback;
}

function issue(
  failureClass: PostFailureClass,
  code: string,
  reason: string
): PlatformPreflightIssue {
  return {
    failureClass,
    code: text(code, 'platform_preflight_failed', 120),
    reason: text(reason, 'Platform preflight failed.'),
  };
}

export class PlatformTruthInspectionError extends Error {
  constructor(
    readonly failureClass: PostFailureClass,
    readonly code: string,
    reason: string
  ) {
    super(text(reason, 'Publishly could not inspect platform capabilities.'));
    this.name = 'PlatformTruthInspectionError';
  }
}

function recognizedPrivacyOptions(value: unknown): TikTokPrivacyLevel[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((entry): entry is TikTokPrivacyLevel =>
        TIKTOK_PRIVACY_LEVELS.includes(entry as TikTokPrivacyLevel)
      )
    ),
  ];
}

export function deriveTikTokPlatformTruth(
  payload: any,
  checkedAt = new Date()
): PlatformTruthSnapshot {
  const errorCode = text(payload?.error?.code, 'unknown', 120);
  if (errorCode !== 'ok') {
    const reason = text(
      payload?.error?.message,
      `TikTok creator-info failed with ${errorCode}.`
    );
    if (
      [
        'access_token_invalid',
        'scope_not_authorized',
        'scope_permission_missed',
      ].includes(errorCode)
    ) {
      throw new PlatformTruthInspectionError(
        'user_action_needed',
        errorCode === 'access_token_invalid'
          ? 'tiktok_reconnect_required'
          : 'tiktok_publish_permission_required',
        reason
      );
    }
    throw new PlatformTruthInspectionError(
      'recoverable',
      errorCode === 'rate_limit_exceeded'
        ? 'tiktok_creator_info_rate_limited'
        : 'tiktok_creator_info_unavailable',
      reason
    );
  }

  const privacyLevelOptions = recognizedPrivacyOptions(
    payload?.data?.privacy_level_options
  );
  if (!privacyLevelOptions.length) {
    throw new PlatformTruthInspectionError(
      'recoverable',
      'tiktok_creator_info_malformed',
      'TikTok creator-info returned no usable privacy options. Publishly cannot safely assume a visibility.'
    );
  }

  const onlySelf =
    privacyLevelOptions.length === 1 && privacyLevelOptions[0] === 'SELF_ONLY';
  const publicCapable = privacyLevelOptions.includes('PUBLIC_TO_EVERYONE');
  const maxVideoDurationSeconds = Number(
    payload?.data?.max_video_post_duration_sec
  );
  const metadata: PlatformTruthMetadata = {
    privacyLevelOptions,
    commentDisabled:
      typeof payload?.data?.comment_disabled === 'boolean'
        ? payload.data.comment_disabled
        : null,
    duetDisabled:
      typeof payload?.data?.duet_disabled === 'boolean'
        ? payload.data.duet_disabled
        : null,
    stitchDisabled:
      typeof payload?.data?.stitch_disabled === 'boolean'
        ? payload.data.stitch_disabled
        : null,
    maxVideoDurationSeconds:
      Number.isFinite(maxVideoDurationSeconds) && maxVideoDurationSeconds > 0
        ? Math.floor(maxVideoDurationSeconds)
        : null,
    creatorNickname: text(payload?.data?.creator_nickname, '', 200) || null,
    creatorUsername: text(payload?.data?.creator_username, '', 200) || null,
  };

  if (onlySelf) {
    return {
      state: 'LIMITED',
      publishingMode: 'SELF_ONLY',
      auditState: 'UNAUDITED',
      code: 'tiktok_self_only_unaudited',
      reason:
        'TikTok reports SELF_ONLY as the sole visibility. This Publishly TikTok app is unaudited, so every direct post is private-only.',
      checkedAt,
      metadata,
    };
  }

  if (!publicCapable) {
    return {
      state: 'LIMITED',
      publishingMode: 'ACCOUNT_RESTRICTED',
      auditState: 'AUDITED',
      code: 'tiktok_account_visibility_restricted',
      reason:
        "TikTok does not currently allow public visibility for this creator account. Publishly will expose only TikTok's returned choices.",
      checkedAt,
      metadata,
    };
  }

  return {
    state: 'READY',
    publishingMode: 'PUBLIC_CAPABLE',
    auditState: 'AUDITED',
    code: 'tiktok_public_posting_ready',
    reason:
      'TikTok creator-info currently includes public posting for this connection.',
    checkedAt,
    metadata,
  };
}

export function deriveInstagramGraphPlatformTruth(
  input: {
    expectedInstagramId: unknown;
    linkedInstagramId: unknown;
    pageId: unknown;
    accountType: unknown;
  },
  checkedAt = new Date()
): PlatformTruthSnapshot {
  const expectedInstagramId = text(input.expectedInstagramId, '', 300);
  const linkedInstagramId = text(input.linkedInstagramId, '', 300);
  const pageId = text(input.pageId, '', 300);
  const accountType = text(input.accountType, 'UNKNOWN', 80).toUpperCase();

  if (!pageId || !linkedInstagramId) {
    return {
      state: 'INVALID',
      publishingMode: 'UNKNOWN',
      auditState: 'NOT_APPLICABLE',
      code: 'instagram_facebook_page_link_required',
      reason:
        'This Instagram connection is not linked to a Facebook Page. Link the Professional Instagram account to a Page, then reconnect it.',
      checkedAt,
      accountType,
      linkedResourceId: pageId || null,
      metadata: { facebookPageLinked: false },
    };
  }

  if (!expectedInstagramId || linkedInstagramId !== expectedInstagramId) {
    return {
      state: 'INVALID',
      publishingMode: 'UNKNOWN',
      auditState: 'NOT_APPLICABLE',
      code: 'instagram_facebook_page_link_mismatch',
      reason:
        'The selected Facebook Page is linked to a different Instagram account. Select the matching Page and reconnect.',
      checkedAt,
      accountType,
      linkedResourceId: pageId,
      metadata: { facebookPageLinked: false },
    };
  }

  if (!['BUSINESS', 'CREATOR'].includes(accountType)) {
    return {
      state: 'INVALID',
      publishingMode: 'UNKNOWN',
      auditState: 'NOT_APPLICABLE',
      code: 'instagram_professional_account_required',
      reason:
        'Instagram Graph publishing requires a Business or Creator account linked to a Facebook Page. Convert the account and reconnect it.',
      checkedAt,
      accountType,
      linkedResourceId: pageId,
      metadata: { facebookPageLinked: true },
    };
  }

  return {
    state: 'READY',
    publishingMode: 'PUBLIC_CAPABLE',
    auditState: 'NOT_APPLICABLE',
    code: 'instagram_graph_ready',
    reason: `Instagram reports a linked ${accountType.toLowerCase()} account and Facebook Page.`,
    checkedAt,
    accountType,
    linkedResourceId: pageId,
    metadata: { facebookPageLinked: true },
  };
}

export function failedPlatformTruth(
  provider: string,
  failure: PlatformPreflightIssue,
  checkedAt = new Date()
): PlatformTruthSnapshot {
  const invalid = failure.failureClass === 'user_action_needed';
  return {
    state: invalid ? 'INVALID' : 'UNKNOWN',
    publishingMode: 'UNKNOWN',
    auditState: provider === 'tiktok' ? 'UNKNOWN' : 'NOT_APPLICABLE',
    code: failure.code,
    reason: failure.reason,
    checkedAt,
    metadata:
      provider === 'instagram' ? { facebookPageLinked: false } : undefined,
  };
}

function isVideo(media: ComposeMediaTruth) {
  return (
    media.mimeType?.toLowerCase().startsWith('video/') === true ||
    /\.mp4(?:$|[?#])/i.test(media.path)
  );
}

function validateTikTokCompose(
  truth: PlatformTruthSnapshot,
  settings: any,
  media: ComposeMediaTruth[]
): PlatformPreflightIssue | null {
  if (settings?.publish_consent !== true) {
    return issue(
      'data_problem',
      'tiktok_publish_consent_required',
      "Explicitly agree to TikTok's Music Usage Confirmation before sending this post."
    );
  }
  if (settings?.content_posting_method === 'UPLOAD') return null;
  if (
    settings?.disclose === true &&
    !settings?.brand_organic_toggle &&
    !settings?.brand_content_toggle
  ) {
    return issue(
      'data_problem',
      'tiktok_disclosure_selection_required',
      'TikTok content disclosure is on. Select Your brand, Branded content, or both before scheduling.'
    );
  }
  if (
    settings?.disclose !== true &&
    (settings?.brand_organic_toggle || settings?.brand_content_toggle)
  ) {
    return issue(
      'data_problem',
      'tiktok_disclosure_state_invalid',
      'Turn on TikTok content disclosure before selecting Your brand or Branded content.'
    );
  }
  const options = truth.metadata?.privacyLevelOptions || [];
  const privacy = settings?.privacy_level;
  if (!privacy) {
    return issue(
      'data_problem',
      'tiktok_privacy_required',
      'Choose a TikTok privacy level explicitly before scheduling this post.'
    );
  }
  if (!options.includes(privacy)) {
    return issue(
      truth.publishingMode === 'SELF_ONLY'
        ? 'user_action_needed'
        : 'data_problem',
      truth.publishingMode === 'SELF_ONLY'
        ? 'tiktok_self_only_unaudited'
        : 'tiktok_privacy_not_available',
      truth.publishingMode === 'SELF_ONLY'
        ? 'TikTok permits only SELF_ONLY for this unaudited Publishly app. Choose SELF_ONLY or complete TikTok Content Posting audit before public posting.'
        : `TikTok does not currently offer ${String(
            privacy
          )} for this creator. Choose one of: ${options.join(', ')}.`
    );
  }
  if (settings?.brand_content_toggle && privacy === 'SELF_ONLY') {
    return issue(
      'data_problem',
      'tiktok_branded_content_cannot_be_private',
      'TikTok branded content cannot use SELF_ONLY visibility. Change the disclosure or choose an allowed non-private visibility.'
    );
  }
  const video = media.find(isVideo);
  if (video) {
    if (!video.metadataVerified || !Number.isFinite(video.durationSeconds)) {
      return issue(
        'data_problem',
        'tiktok_media_metadata_unavailable',
        'Publishly cannot verify this TikTok video duration. Upload or re-upload it through Publishly before scheduling.'
      );
    }
    const max = truth.metadata?.maxVideoDurationSeconds;
    if (max && Number(video.durationSeconds) > max) {
      return issue(
        'data_problem',
        'tiktok_video_too_long_for_creator',
        `This video is ${Number(video.durationSeconds).toFixed(
          2
        )} seconds, but TikTok currently allows at most ${max} seconds for this creator.`
      );
    }
    if (settings?.duet && truth.metadata?.duetDisabled) {
      return issue(
        'data_problem',
        'tiktok_duet_disabled',
        'TikTok reports that Duet is disabled for this creator. Turn off Duet before scheduling.'
      );
    }
    if (settings?.stitch && truth.metadata?.stitchDisabled) {
      return issue(
        'data_problem',
        'tiktok_stitch_disabled',
        'TikTok reports that Stitch is disabled for this creator. Turn off Stitch before scheduling.'
      );
    }
  }
  if (settings?.comment && truth.metadata?.commentDisabled) {
    return issue(
      'data_problem',
      'tiktok_comments_disabled',
      'TikTok reports that comments are disabled for this creator. Turn off comments before scheduling.'
    );
  }
  return null;
}

function validateInstagramMedia(
  truth: PlatformTruthSnapshot,
  settings: any,
  media: ComposeMediaTruth[]
): PlatformPreflightIssue | null {
  if (!media.length) {
    return issue(
      'data_problem',
      'instagram_media_required',
      'Instagram requires at least one media attachment.'
    );
  }
  if (media.length > 10) {
    return issue(
      'data_problem',
      'instagram_carousel_too_large',
      'Instagram carousels support at most 10 media attachments.'
    );
  }
  if (settings?.post_type === 'story' && media.length !== 1) {
    return issue(
      'data_problem',
      'instagram_story_requires_one_media',
      'Instagram Stories require exactly one image or video.'
    );
  }
  if (
    settings?.post_type === 'story' &&
    String(truth.accountType || '').toUpperCase() !== 'BUSINESS'
  ) {
    return issue(
      'user_action_needed',
      'instagram_story_requires_business',
      'Instagram Graph permits Story publishing only for Business accounts. Convert this account to Business and reconnect it.'
    );
  }
  if (settings?.is_trial_reel && (media.length !== 1 || !isVideo(media[0]))) {
    return issue(
      'data_problem',
      'instagram_trial_reel_requires_one_video',
      'Instagram Trial Reels require exactly one video.'
    );
  }
  if (settings?.audio?.id) {
    if (settings?.post_type === 'story') {
      return issue(
        'data_problem',
        'instagram_audio_not_supported_for_story',
        'Instagram audio can be added to Reels, not Stories.'
      );
    }
    if (media.length !== 1 || !isVideo(media[0])) {
      return issue(
        'data_problem',
        'instagram_audio_requires_one_video',
        'Instagram audio requires exactly one video Reel.'
      );
    }
  }

  for (const item of media) {
    if (
      !item.metadataVerified ||
      !item.mimeType ||
      !Number.isFinite(item.fileSize) ||
      !Number.isFinite(item.width) ||
      !Number.isFinite(item.height)
    ) {
      return issue(
        'data_problem',
        'instagram_media_metadata_unavailable',
        'Publishly cannot verify this Instagram media file. Upload or re-upload it through Publishly before scheduling.'
      );
    }
    const width = Number(item.width);
    const height = Number(item.height);
    if (width <= 0 || height <= 0 || Number(item.fileSize) <= 0) {
      return issue(
        'data_problem',
        'instagram_media_metadata_invalid',
        'This Instagram media file has invalid size or dimensions. Re-upload a valid file.'
      );
    }

    if (isVideo(item)) {
      if (item.mimeType.toLowerCase() !== 'video/mp4') {
        return issue(
          'data_problem',
          'instagram_video_format_unsupported',
          'Instagram video publishing requires an MP4 file.'
        );
      }
      if (Number(item.fileSize) > INSTAGRAM_VIDEO_MAX_BYTES) {
        return issue(
          'data_problem',
          'instagram_video_too_large',
          'Instagram videos must be no larger than 1 GB.'
        );
      }
      if (!Number.isFinite(item.durationSeconds)) {
        return issue(
          'data_problem',
          'instagram_video_duration_unavailable',
          'Publishly cannot verify this Instagram video duration. Re-upload it before scheduling.'
        );
      }
      const duration = Number(item.durationSeconds);
      if (
        duration < INSTAGRAM_VIDEO_MIN_SECONDS ||
        duration > INSTAGRAM_VIDEO_MAX_SECONDS
      ) {
        return issue(
          'data_problem',
          'instagram_video_duration_invalid',
          'Instagram videos must be between 3 seconds and 15 minutes.'
        );
      }
      if (
        settings?.post_type === 'story' &&
        duration > INSTAGRAM_STORY_MAX_SECONDS
      ) {
        return issue(
          'data_problem',
          'instagram_story_video_too_long',
          'Instagram Story videos must be 60 seconds or shorter.'
        );
      }
      if (width > INSTAGRAM_VIDEO_MAX_WIDTH) {
        return issue(
          'data_problem',
          'instagram_video_width_too_large',
          'Instagram videos can be at most 1920 pixels wide.'
        );
      }
      continue;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType)) {
      return issue(
        'data_problem',
        'instagram_image_format_unsupported',
        'Instagram images must be JPEG or a Publishly-supported image that can be converted safely to JPEG.'
      );
    }
    if (Number(item.fileSize) > INSTAGRAM_IMAGE_MAX_BYTES) {
      return issue(
        'data_problem',
        'instagram_image_too_large',
        'Instagram images must be no larger than 8 MB.'
      );
    }
    const ratio = width / height;
    if (
      ratio < INSTAGRAM_MIN_IMAGE_RATIO ||
      ratio > INSTAGRAM_MAX_IMAGE_RATIO
    ) {
      return issue(
        'data_problem',
        'instagram_image_aspect_ratio_invalid',
        'Instagram image aspect ratio must be between 4:5 and 1.91:1.'
      );
    }
  }
  return null;
}

export function validatePlatformTruthAtCompose(input: {
  provider: string;
  truth: PlatformTruthSnapshot;
  settings: any;
  media: ComposeMediaTruth[];
}): PlatformPreflightIssue | null {
  if (input.truth.state === 'UNKNOWN') {
    return issue('recoverable', input.truth.code, input.truth.reason);
  }
  if (input.truth.state === 'INVALID') {
    return issue('user_action_needed', input.truth.code, input.truth.reason);
  }
  if (input.provider === 'tiktok') {
    return validateTikTokCompose(input.truth, input.settings, input.media);
  }
  if (input.provider === 'instagram') {
    return validateInstagramMedia(input.truth, input.settings, input.media);
  }
  return null;
}

function safeMetadata(value: unknown): PlatformTruthMetadata {
  const metadata = (value && typeof value === 'object' ? value : {}) as any;
  const privacyLevelOptions = recognizedPrivacyOptions(
    metadata.privacyLevelOptions
  );
  const max = Number(metadata.maxVideoDurationSeconds);
  return {
    ...(privacyLevelOptions.length ? { privacyLevelOptions } : {}),
    commentDisabled:
      typeof metadata.commentDisabled === 'boolean'
        ? metadata.commentDisabled
        : null,
    duetDisabled:
      typeof metadata.duetDisabled === 'boolean' ? metadata.duetDisabled : null,
    stitchDisabled:
      typeof metadata.stitchDisabled === 'boolean'
        ? metadata.stitchDisabled
        : null,
    maxVideoDurationSeconds:
      Number.isFinite(max) && max > 0 ? Math.floor(max) : null,
    creatorNickname: text(metadata.creatorNickname, '', 200) || null,
    creatorUsername: text(metadata.creatorUsername, '', 200) || null,
    facebookPageLinked: metadata.facebookPageLinked === true,
  };
}

export function platformTruthResponse(input: {
  platformTruthState?: unknown;
  platformPublishingMode?: unknown;
  platformAuditState?: unknown;
  platformTruthCode?: unknown;
  platformTruthReason?: unknown;
  platformTruthCheckedAt?: Date | string | null;
  platformAccountType?: unknown;
  platformLinkedResourceId?: unknown;
  platformTruthMetadata?: unknown;
}) {
  const state = text(input.platformTruthState, 'NOT_APPLICABLE', 40);
  const metadata = safeMetadata(input.platformTruthMetadata);
  return {
    state,
    publishingMode: text(input.platformPublishingMode, 'NOT_APPLICABLE', 40),
    auditState: text(input.platformAuditState, 'NOT_APPLICABLE', 40),
    code:
      typeof input.platformTruthCode === 'string'
        ? input.platformTruthCode
        : null,
    reason:
      typeof input.platformTruthReason === 'string'
        ? input.platformTruthReason
        : null,
    checkedAt: input.platformTruthCheckedAt || null,
    accountType:
      typeof input.platformAccountType === 'string'
        ? input.platformAccountType
        : null,
    facebookPageLinked:
      metadata.facebookPageLinked ||
      (state !== 'NOT_APPLICABLE' && !!input.platformLinkedResourceId),
    privacyLevelOptions: metadata.privacyLevelOptions || [],
    commentDisabled: metadata.commentDisabled ?? null,
    duetDisabled: metadata.duetDisabled ?? null,
    stitchDisabled: metadata.stitchDisabled ?? null,
    maxVideoDurationSeconds: metadata.maxVideoDurationSeconds ?? null,
    creatorNickname: metadata.creatorNickname ?? null,
    creatorUsername: metadata.creatorUsername ?? null,
  };
}

export function platformTruthEventKind(state: PlatformTruthState) {
  switch (state) {
    case 'READY':
      return {
        type: 'PLATFORM_READY' as const,
        severity: 'RECOVERY' as const,
      };
    case 'LIMITED':
      return {
        type: 'PLATFORM_LIMITATION' as const,
        severity: 'CRITICAL' as const,
      };
    case 'INVALID':
      return {
        type: 'PLATFORM_INVALID' as const,
        severity: 'CRITICAL' as const,
      };
    case 'UNKNOWN':
      return {
        type: 'PLATFORM_TRUTH_UNKNOWN' as const,
        severity: 'WARNING' as const,
      };
    case 'NOT_APPLICABLE':
    default:
      return null;
  }
}
