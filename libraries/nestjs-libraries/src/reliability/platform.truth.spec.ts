import {
  deriveInstagramGraphPlatformTruth,
  deriveTikTokPlatformTruth,
  PlatformTruthInspectionError,
  platformTruthResponse,
  validatePlatformTruthAtCompose,
} from './platform.truth';

const now = new Date('2026-08-10T12:00:00.000Z');

function tiktokPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      creator_nickname: 'Publishly Operator',
      creator_username: 'operator',
      privacy_level_options: [
        'PUBLIC_TO_EVERYONE',
        'MUTUAL_FOLLOW_FRIENDS',
        'SELF_ONLY',
      ],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 300,
      ...overrides,
    },
    error: { code: 'ok', message: '' },
  };
}

const verifiedVideo = {
  id: 'media-1',
  path: 'video.mp4',
  mimeType: 'video/mp4',
  fileSize: 10_000_000,
  width: 1080,
  height: 1920,
  durationSeconds: 30,
  metadataVerified: true,
};

const verifiedImage = {
  id: 'media-2',
  path: 'image.jpg',
  mimeType: 'image/jpeg',
  fileSize: 2_000_000,
  width: 1080,
  height: 1080,
  metadataVerified: true,
};

describe('platform truth policy', () => {
  it('marks an exact SELF_ONLY creator response unaudited and private-only', () => {
    const truth = deriveTikTokPlatformTruth(
      tiktokPayload({ privacy_level_options: ['SELF_ONLY'] }),
      now
    );
    expect(truth).toMatchObject({
      state: 'LIMITED',
      publishingMode: 'SELF_ONLY',
      auditState: 'UNAUDITED',
      code: 'tiktok_self_only_unaudited',
      checkedAt: now,
    });
    expect(truth.reason).toContain('private-only');
  });

  it('distinguishes audited public and account-restricted options', () => {
    expect(deriveTikTokPlatformTruth(tiktokPayload(), now)).toMatchObject({
      state: 'READY',
      publishingMode: 'PUBLIC_CAPABLE',
      auditState: 'AUDITED',
    });
    expect(
      deriveTikTokPlatformTruth(
        tiktokPayload({
          privacy_level_options: [
            'FOLLOWER_OF_CREATOR',
            'MUTUAL_FOLLOW_FRIENDS',
            'SELF_ONLY',
          ],
        }),
        now
      )
    ).toMatchObject({
      state: 'LIMITED',
      publishingMode: 'ACCOUNT_RESTRICTED',
      auditState: 'AUDITED',
    });
  });

  it.each([
    ['access_token_invalid', 'user_action_needed', 'tiktok_reconnect_required'],
    [
      'scope_not_authorized',
      'user_action_needed',
      'tiktok_publish_permission_required',
    ],
    ['rate_limit_exceeded', 'recoverable', 'tiktok_creator_info_rate_limited'],
    ['internal_error', 'recoverable', 'tiktok_creator_info_unavailable'],
  ] as const)(
    'classifies TikTok creator-info %s',
    (code, failureClass, expectedCode) => {
      try {
        deriveTikTokPlatformTruth({
          error: { code, message: 'provider reason' },
        });
        throw new Error('expected inspection failure');
      } catch (error) {
        expect(error).toBeInstanceOf(PlatformTruthInspectionError);
        expect(error).toMatchObject({ failureClass, code: expectedCode });
        expect((error as Error).message).toBe('provider reason');
      }
    }
  );

  it('fails closed on missing or unrecognized TikTok privacy options', () => {
    expect(() =>
      deriveTikTokPlatformTruth(
        tiktokPayload({ privacy_level_options: ['SECRET_MODE'] })
      )
    ).toThrow('no usable privacy options');
  });

  it.each([
    [null, '1', 'BUSINESS', 'instagram_facebook_page_link_required'],
    ['page-1', '2', 'BUSINESS', 'instagram_facebook_page_link_mismatch'],
    ['page-1', '1', 'PERSONAL', 'instagram_professional_account_required'],
  ] as const)(
    'rejects invalid Instagram Page/account truth',
    (pageId, linkedInstagramId, accountType, code) => {
      expect(
        deriveInstagramGraphPlatformTruth(
          {
            expectedInstagramId: '1',
            linkedInstagramId,
            pageId,
            accountType,
          },
          now
        )
      ).toMatchObject({ state: 'INVALID', code });
    }
  );

  it.each(['BUSINESS', 'CREATOR'] as const)(
    'accepts linked Instagram %s accounts for feed/Reels',
    (accountType) => {
      expect(
        deriveInstagramGraphPlatformTruth(
          {
            expectedInstagramId: 'ig-1',
            linkedInstagramId: 'ig-1',
            pageId: 'page-1',
            accountType,
          },
          now
        )
      ).toMatchObject({
        state: 'READY',
        accountType,
        linkedResourceId: 'page-1',
      });
    }
  );

  it('blocks a public TikTok selection when creator info is SELF_ONLY', () => {
    const truth = deriveTikTokPlatformTruth(
      tiktokPayload({ privacy_level_options: ['SELF_ONLY'] }),
      now
    );
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: {
          publish_consent: true,
          content_posting_method: 'DIRECT_POST',
          privacy_level: 'PUBLIC_TO_EVERYONE',
        },
        media: [verifiedImage],
      })
    ).toEqual(
      expect.objectContaining({
        failureClass: 'user_action_needed',
        code: 'tiktok_self_only_unaudited',
      })
    );
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: {
          publish_consent: true,
          content_posting_method: 'DIRECT_POST',
          privacy_level: 'SELF_ONLY',
        },
        media: [verifiedImage],
      })
    ).toBeNull();
  });

  it.each([
    [{ comment_disabled: true }, { comment: true }, 'tiktok_comments_disabled'],
    [{ duet_disabled: true }, { duet: true }, 'tiktok_duet_disabled'],
    [{ stitch_disabled: true }, { stitch: true }, 'tiktok_stitch_disabled'],
    [
      { max_video_post_duration_sec: 10 },
      {},
      'tiktok_video_too_long_for_creator',
    ],
  ] as const)(
    'preflights TikTok creator constraint %s',
    (truthOverride, settingOverride, code) => {
      const truth = deriveTikTokPlatformTruth(
        tiktokPayload(truthOverride),
        now
      );
      expect(
        validatePlatformTruthAtCompose({
          provider: 'tiktok',
          truth,
          settings: {
            publish_consent: true,
            content_posting_method: 'DIRECT_POST',
            privacy_level: 'PUBLIC_TO_EVERYONE',
            ...settingOverride,
          },
          media: [verifiedVideo],
        })
      ).toEqual(expect.objectContaining({ code }));
    }
  );

  it('requires verified TikTok video duration instead of guessing', () => {
    const truth = deriveTikTokPlatformTruth(tiktokPayload(), now);
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: {
          publish_consent: true,
          content_posting_method: 'DIRECT_POST',
          privacy_level: 'PUBLIC_TO_EVERYONE',
        },
        media: [{ ...verifiedVideo, metadataVerified: false }],
      })
    ).toEqual(
      expect.objectContaining({ code: 'tiktok_media_metadata_unavailable' })
    );
  });

  it('requires Business for Instagram Stories but allows Creator feed posts', () => {
    const truth = deriveInstagramGraphPlatformTruth({
      expectedInstagramId: 'ig-1',
      linkedInstagramId: 'ig-1',
      pageId: 'page-1',
      accountType: 'CREATOR',
    });
    expect(
      validatePlatformTruthAtCompose({
        provider: 'instagram',
        truth,
        settings: { post_type: 'story' },
        media: [verifiedImage],
      })
    ).toEqual(
      expect.objectContaining({ code: 'instagram_story_requires_business' })
    );
    expect(
      validatePlatformTruthAtCompose({
        provider: 'instagram',
        truth,
        settings: { post_type: 'post' },
        media: [verifiedImage],
      })
    ).toBeNull();
  });

  it('requires explicit TikTok posting consent even for upload-to-inbox', () => {
    const truth = deriveTikTokPlatformTruth(tiktokPayload(), now);
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: { content_posting_method: 'UPLOAD' },
        media: [verifiedVideo],
      })
    ).toEqual(
      expect.objectContaining({ code: 'tiktok_publish_consent_required' })
    );
  });

  it('blocks incomplete and internally inconsistent TikTok disclosure state', () => {
    const truth = deriveTikTokPlatformTruth(tiktokPayload(), now);
    const base = {
      publish_consent: true,
      content_posting_method: 'DIRECT_POST',
      privacy_level: 'PUBLIC_TO_EVERYONE',
    };
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: { ...base, disclose: true },
        media: [verifiedImage],
      })
    ).toEqual(
      expect.objectContaining({ code: 'tiktok_disclosure_selection_required' })
    );
    expect(
      validatePlatformTruthAtCompose({
        provider: 'tiktok',
        truth,
        settings: { ...base, disclose: false, brand_content_toggle: true },
        media: [verifiedImage],
      })
    ).toEqual(
      expect.objectContaining({ code: 'tiktok_disclosure_state_invalid' })
    );
  });

  it.each([
    [
      [{ ...verifiedImage, metadataVerified: false }],
      {},
      'instagram_media_metadata_unavailable',
    ],
    [
      [{ ...verifiedImage, fileSize: 8 * 1024 * 1024 + 1 }],
      {},
      'instagram_image_too_large',
    ],
    [
      [{ ...verifiedImage, width: 500, height: 1000 }],
      {},
      'instagram_image_aspect_ratio_invalid',
    ],
    [
      [{ ...verifiedVideo, mimeType: 'video/quicktime' }],
      {},
      'instagram_video_format_unsupported',
    ],
    [
      [{ ...verifiedVideo, durationSeconds: 2.99 }],
      {},
      'instagram_video_duration_invalid',
    ],
    [
      [{ ...verifiedVideo, durationSeconds: 901 }],
      {},
      'instagram_video_duration_invalid',
    ],
    [
      [{ ...verifiedVideo, width: 1921 }],
      {},
      'instagram_video_width_too_large',
    ],
    [
      [{ ...verifiedVideo, durationSeconds: 61 }],
      { post_type: 'story' },
      'instagram_story_video_too_long',
    ],
  ] as const)(
    'rejects Instagram media boundary %s',
    (media, settings, code) => {
      const truth = deriveInstagramGraphPlatformTruth({
        expectedInstagramId: 'ig-1',
        linkedInstagramId: 'ig-1',
        pageId: 'page-1',
        accountType: 'BUSINESS',
      });
      expect(
        validatePlatformTruthAtCompose({
          provider: 'instagram',
          truth,
          settings,
          media: media as any,
        })
      ).toEqual(expect.objectContaining({ code }));
    }
  );

  it('returns only whitelisted platform metadata and hides the Page ID', () => {
    expect(
      platformTruthResponse({
        platformTruthState: 'READY',
        platformPublishingMode: 'PUBLIC_CAPABLE',
        platformAuditState: 'NOT_APPLICABLE',
        platformTruthCode: 'instagram_graph_ready',
        platformTruthReason: 'ready',
        platformTruthCheckedAt: now,
        platformAccountType: 'BUSINESS',
        platformLinkedResourceId: 'secret-page-id',
        platformTruthMetadata: {
          facebookPageLinked: true,
          accessToken: 'must-not-leak',
        },
      })
    ).toEqual({
      state: 'READY',
      publishingMode: 'PUBLIC_CAPABLE',
      auditState: 'NOT_APPLICABLE',
      code: 'instagram_graph_ready',
      reason: 'ready',
      checkedAt: now,
      accountType: 'BUSINESS',
      facebookPageLinked: true,
      privacyLevelOptions: [],
      commentDisabled: null,
      duetDisabled: null,
      stitchDisabled: null,
      maxVideoDurationSeconds: null,
      creatorNickname: null,
      creatorUsername: null,
    });
  });
});
