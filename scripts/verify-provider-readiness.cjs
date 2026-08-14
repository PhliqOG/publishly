#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../data/provider-approval-manifest.json');
const productFacts = require('../data/public-product-facts.json');

const EXPECTED_PROVIDER_IDS = Object.freeze([
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'x',
  'threads',
  'linkedin',
  'pinterest',
  'bluesky',
  'mastodon',
]);

function validateProviderReadiness(rootDir = path.resolve(__dirname, '..')) {
  const issues = [];
  const seen = new Set();
  const add = (code, reason) => {
    const key = `${code}:${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, reason });
  };
  const read = (relative) =>
    fs.readFileSync(path.join(rootDir, relative), 'utf8');

  const providers = Array.isArray(manifest.providers) ? manifest.providers : [];
  const ids = providers.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    add('approval_manifest_duplicate_provider', 'Provider ids must be unique.');
  }
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_PROVIDER_IDS)) {
    add(
      'approval_manifest_provider_mismatch',
      'The approval manifest must contain the ten featured providers in the public product order.'
    );
  }
  if (
    JSON.stringify(providers.map(({ name }) => name)) !==
    JSON.stringify(productFacts.networks.posting)
  ) {
    add(
      'approval_manifest_website_mismatch',
      'Provider names in the approval manifest must match data/public-product-facts.json.'
    );
  }

  for (const provider of providers) {
    if (!provider.name || !provider.authModel || !provider.reviewPath) {
      add(
        'approval_manifest_field_missing',
        `${
          provider.id || 'unknown'
        } is missing its name, auth model, or review path.`
      );
    }
    if (
      provider.callback !== null &&
      provider.callback !== `/integrations/social/${provider.id}`
    ) {
      add(
        'approval_manifest_callback_mismatch',
        `${provider.id} must declare its exact Publishly callback path.`
      );
    }
    for (const callback of provider.additionalCallbacks || []) {
      if (
        typeof callback !== 'string' ||
        !callback.startsWith('/integrations/social/') ||
        callback.includes('://') ||
        callback.endsWith('/')
      ) {
        add(
          'approval_manifest_callback_invalid',
          `${provider.id} contains an invalid additional callback path.`
        );
      }
    }
    if (
      !Array.isArray(provider.officialDocs) ||
      !provider.officialDocs.length
    ) {
      add(
        'approval_manifest_sources_missing',
        `${provider.id} needs at least one official documentation URL.`
      );
    } else if (
      provider.officialDocs.some((url) => !String(url).startsWith('https://'))
    ) {
      add(
        'approval_manifest_source_invalid',
        `${provider.id} official documentation URLs must use HTTPS.`
      );
    }
    const declaredScopes = [
      ...(provider.scopes || []),
      ...(provider.additionalPermissionSets || []).flatMap(
        (permissionSet) => permissionSet.scopes || []
      ),
    ];
    if (new Set(declaredScopes).size !== declaredScopes.length) {
      add(
        'approval_manifest_duplicate_scope',
        `${provider.id} contains a duplicate permission scope.`
      );
    }
    for (const sourceFile of provider.sourceFiles || []) {
      const absolute = path.join(rootDir, sourceFile);
      if (!fs.existsSync(absolute)) {
        add(
          'approval_manifest_source_missing',
          `${provider.id} source file does not exist: ${sourceFile}.`
        );
        continue;
      }
      const source = read(sourceFile);
      for (const scope of declaredScopes) {
        const appearsInAnySource = (provider.sourceFiles || []).some(
          (candidate) => read(candidate).includes(`'${scope}'`)
        );
        if (!appearsInAnySource) {
          add(
            'approval_manifest_scope_drift',
            `${provider.id} declares ${scope}, but its provider sources do not request it.`
          );
        }
      }
      if (!source.includes(provider.id) && provider.id !== 'linkedin') {
        add(
          'approval_manifest_identifier_drift',
          `${sourceFile} no longer identifies the ${provider.id} integration.`
        );
      }
    }
  }

  const youtube = read(
    'libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts'
  );
  const pinterest = read(
    'libraries/nestjs-libraries/src/integrations/social/pinterest.provider.ts'
  );
  const bluesky = read(
    'libraries/nestjs-libraries/src/integrations/social/bluesky.provider.ts'
  );
  const manager = read(
    'libraries/nestjs-libraries/src/integrations/integration.manager.ts'
  );
  const metaSources = [
    read(
      'libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts'
    ),
    read(
      'libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts'
    ),
    read(
      'libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.ts'
    ),
  ].join('\n');
  const tiktok = read(
    'libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts'
  );
  const tiktokDto = read(
    'libraries/nestjs-libraries/src/dtos/posts/providers-settings/tiktok.dto.ts'
  );
  const tiktokComposer = read(
    'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx'
  );
  const engagementPage = read(
    'apps/frontend/src/app/(marketing)/engagement/page.tsx'
  );
  const inboxReplica = read(
    'apps/frontend/src/components/marketing/replicas/inbox-replica.tsx'
  );
  const privacy = read('apps/frontend/src/app/(marketing)/privacy/page.tsx');
  const terms = read('apps/frontend/src/app/(marketing)/terms/page.tsx');
  const acceptableUse = read(
    'apps/frontend/src/app/(marketing)/acceptable-use/page.tsx'
  );
  const reviewerPage = read(
    'apps/frontend/src/app/(marketing)/platform-review/page.tsx'
  );
  const refreshService = read(
    'libraries/nestjs-libraries/src/integrations/refresh.integration.service.ts'
  );
  const integrationService = read(
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts'
  );
  const oauthCallback = read(
    'apps/backend/src/api/routes/no.auth.integrations.controller.ts'
  );
  const oauthState = read(
    'libraries/nestjs-libraries/src/integrations/oauth.state.ts'
  );
  const publicController = read(
    'apps/backend/src/api/routes/public.controller.ts'
  );

  if (youtube.includes('youtube.force-ssl')) {
    add(
      'provider_scope_not_least_privilege',
      'YouTube requests youtube.force-ssl although Publishly does not manage YouTube comments or ratings.'
    );
  }
  if (
    !youtube.includes('refreshCron = true') ||
    !refreshService.includes('isDefinitiveProviderRevocation') ||
    !refreshService.includes('purgeExternallyRevokedChannel') ||
    !/startRefreshWorkflow\(\s*updated,\s*provider\s*\)/.test(
      integrationService
    ) ||
    !oauthCallback.includes('if (!createUpdate.inBetweenSteps)')
  ) {
    add(
      'youtube_revocation_retention_drift',
      'YouTube must continuously probe authorization, purge definitive external revocation, and start monitoring only after two-step account selection.'
    );
  }
  if (
    pinterest.includes("'boards:write'") ||
    pinterest.includes('boards:read,boards:write')
  ) {
    add(
      'provider_scope_not_least_privilege',
      'Pinterest requests boards:write although Publishly only lists existing boards.'
    );
  }
  if (/disable (?:it|two-factor)|disable two-factor/i.test(bluesky)) {
    add(
      'bluesky_security_guidance_invalid',
      'Bluesky guidance must never tell a user to disable two-factor authentication.'
    );
  }
  if (
    !manager.includes('new MastodonCustomProvider()') ||
    manager.includes('new MastodonProvider()')
  ) {
    add(
      'mastodon_registration_not_federated',
      'The advertised Mastodon provider must use per-instance dynamic app registration.'
    );
  }
  if (/v(?:20|21|22|23|24)\.0/.test(metaSources)) {
    add(
      'meta_graph_version_drift',
      'Facebook and Instagram provider calls must use the central META_GRAPH_VERSION pin, not old hard-coded versions.'
    );
  }
  if (
    !metaSources.includes("'instagram_manage_messages'") ||
    !metaSources.includes("'instagram_business_manage_messages'") ||
    !metaSources.includes("'pages_manage_metadata'")
  ) {
    add(
      'meta_messaging_scope_drift',
      'Instagram messaging requires the reviewed Facebook Login and Instagram Login permissions.'
    );
  }
  const deprecatedInstagramLoginScopes = [
    'business_basic',
    'business_content_publish',
    'business_manage_comments',
    'business_manage_messages',
  ];
  if (
    deprecatedInstagramLoginScopes.some(
      (scope) =>
        metaSources.includes(`'${scope}'`) || metaSources.includes(`"${scope}"`)
    )
  ) {
    add(
      'meta_deprecated_instagram_login_scope',
      'Instagram Login must use the current instagram_business_* permissions, not deprecated business_* names.'
    );
  }
  if (
    !publicController.includes("@Get('/meta/webhooks/instagram')") ||
    !publicController.includes("@Post('/meta/webhooks/instagram')") ||
    !publicController.includes("req.headers['x-hub-signature-256']")
  ) {
    add(
      'meta_messaging_webhook_drift',
      'Instagram messaging requires a public challenge endpoint and signed webhook receiver.'
    );
  }
  if (
    !oauthState.includes('const OAUTH_STATE_BYTES = 32') ||
    !oauthState.includes('getdel(`login:${state}`)') ||
    !oauthCallback.includes(
      'consumeOAuthLoginState(ioRedis, body.state, integration)'
    ) ||
    !metaSources.includes('generateOAuthState()') ||
    !tiktok.includes('generateOAuthState()')
  ) {
    add(
      'launch_provider_oauth_state_drift',
      'Instagram and TikTok OAuth must use a provider-bound, atomically consumed 256-bit state value.'
    );
  }
  if (
    !engagementPage.includes('supported Facebook and Instagram comments') ||
    /TikTok.{0,100}(?:direct message|DM|message reply|comment reply)/is.test(
      engagementPage
    )
  ) {
    add(
      'public_inbox_capability_drift',
      'The public inbox claim must stay limited to the implemented Facebook and Instagram comment APIs; TikTok inbox/comment management is unavailable.'
    );
  }
  if (
    !inboxReplica.includes('supported channels') ||
    /·\s*(?:youtube|tiktok)\s*·/i.test(inboxReplica) ||
    !inboxReplica.includes(
      'comment management is unavailable through Publishly&apos;s'
    )
  ) {
    add(
      'public_inbox_replica_overclaim',
      'The marketing inbox replica may demonstrate replies only for implemented Facebook/Instagram comments and must mark TikTok comment management unavailable.'
    );
  }

  const tiktokProvider = providers.find(({ id }) => id === 'tiktok');
  const requiredTikTokDocs = [
    'content-posting-api-reference-query-creator-info',
    'content-posting-api-reference-direct-post',
    'content-posting-api-reference-upload-video',
    'content-posting-api-reference-photo-post',
    'content-posting-api-reference-get-video-status',
    'tiktok-api-scopes',
    'oauth-user-access-token-management',
  ];
  if (
    !tiktokProvider ||
    requiredTikTokDocs.some(
      (fragment) =>
        !(tiktokProvider.officialDocs || []).some((url) =>
          String(url).includes(fragment)
        )
    )
  ) {
    add(
      'tiktok_review_sources_incomplete',
      'TikTok review evidence must link the exact creator-info, direct-post, upload, photo, status, and scope references.'
    );
  }
  const requiredTikTokEndpoints = [
    '/v2/post/publish/creator_info/query/',
    '/v2/post/publish/status/fetch/',
    '/inbox/video/init/',
    '/video/init/',
    '/content/init/',
  ];
  if (requiredTikTokEndpoints.some((endpoint) => !tiktok.includes(endpoint))) {
    add(
      'tiktok_content_posting_endpoint_drift',
      'TikTok must retain the official creator-info, Direct Post, upload-to-inbox, photo, and status endpoints.'
    );
  }
  if (
    /\b(?:listDirectMessages|sendDirectMessage|replyToComment|getComments)\s*\(/.test(
      tiktok
    )
  ) {
    add(
      'tiktok_unsupported_engagement_api',
      'TikTok Content Posting API does not authorize Publishly to manage direct messages or comments.'
    );
  }
  if (
    !tiktok.includes('async revokeConnection(accessToken: string)') ||
    !tiktok.includes('https://open.tiktokapis.com/v2/oauth/revoke/') ||
    !tiktok.includes('client_secret: clientSecret') ||
    !tiktok.includes('token: accessToken')
  ) {
    add(
      'tiktok_disconnect_revocation_drift',
      'TikTok disconnect must revoke the user access token through the official OAuth v2 endpoint before local deletion.'
    );
  }
  if (
    !tiktok.includes('private async requestOAuthToken(') ||
    !tiktok.includes("operation: 'exchange' | 'refresh'") ||
    !tiktok.includes('if (!response.ok)') ||
    !tiktok.includes('this.checkScopes(this.scopes, payload.scope)') ||
    !tiktok.includes('refreshToken: token.refreshToken') ||
    !tiktok.includes('expiresIn: token.expiresIn')
  ) {
    add(
      'tiktok_oauth_lifecycle_drift',
      'TikTok token exchange and refresh must reject upstream failures, recheck scopes, preserve rotated refresh tokens, and schedule renewal from the provider lifetime.'
    );
  }
  const inboxStatusBranch =
    tiktok.match(
      /if \(status === 'SEND_TO_USER_INBOX'\) \{([\s\S]*?)\n    \}/
    )?.[1] || '';
  if (
    !inboxStatusBranch.includes("status: 'pending'") ||
    inboxStatusBranch.includes("status: 'completed'")
  ) {
    add(
      'tiktok_inbox_delivery_claimed_published',
      'SEND_TO_USER_INBOX is notification delivery, not a published post; only PUBLISH_COMPLETE may complete the job.'
    );
  }
  if (
    /within 24 hours or it is discarded/i.test(
      `${tiktok}\n${tiktokDto}\n${tiktokComposer}`
    )
  ) {
    add(
      'tiktok_undocumented_inbox_expiry',
      'Do not invent an expiry for TikTok upload-to-inbox content; the official posting references do not document one.'
    );
  }
  if (
    !tiktokComposer.includes('/platform-truth/refresh') ||
    !tiktokComposer.includes("register('privacy_level')") ||
    !tiktokComposer.includes("register('publish_consent', { value: false })") ||
    !tiktokComposer.includes('comments: false') ||
    !tiktokComposer.includes('This does not publish the post.') ||
    !tiktokComposer.includes('tiktokConsentDeclaration') ||
    !tiktokComposer.includes("item.value === 'SELF_ONLY'") ||
    !tiktok.includes('tiktok-branded-content-private') ||
    !tiktokDto.includes('@Equals(true')
  ) {
    add(
      'tiktok_export_ui_compliance_drift',
      'TikTok composer must refresh creator info, require a non-default privacy choice and explicit consent, enforce branded-content privacy rules, disable first-comment support, and distinguish inbox upload from publication.'
    );
  }
  if (/Draft template/i.test(`${privacy}\n${terms}\n${acceptableUse}`)) {
    add(
      'public_legal_policy_is_draft',
      'Public legal pages must not ship as draft templates.'
    );
  }
  if (
    !privacy.includes('Google API Services User Data Policy') ||
    !privacy.includes('seven days') ||
    !reviewerPage.includes('provider-approval-manifest.json')
  ) {
    add(
      'public_reviewer_surface_incomplete',
      'Public legal/reviewer pages must retain Google Limited Use, deletion-window, and manifest-backed review content.'
    );
  }

  return issues;
}

function main() {
  const issues = validateProviderReadiness();
  if (issues.length) {
    console.error(
      `Provider readiness verification failed (${issues.length} issue${
        issues.length === 1 ? '' : 's'
      }).`
    );
    for (const issue of issues) {
      console.error(`- [${issue.code}] ${issue.reason}`);
    }
    return 1;
  }
  console.log(
    'Provider readiness verification passed. Website, manifest, scopes, callbacks, and review-critical source rules agree.'
  );
  return 0;
}

module.exports = {
  EXPECTED_PROVIDER_IDS,
  manifest,
  validateProviderReadiness,
  main,
};

if (require.main === module) {
  process.exitCode = main();
}
