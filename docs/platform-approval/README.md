# Publishly platform approval package

Start with the complete operator sequence in
[../APPROVAL_AND_LAUNCH.md](../APPROVAL_AND_LAUNCH.md). This directory provides
provider-specific detail; `data/provider-approval-manifest.json` and the public
`/platform-review` page are the checked permission/callback contract.

These runbooks map the exact OAuth scopes and callback paths used by Publishly
to each provider's current developer-review process. Provider portals and review
forms change, so confirm portal wording immediately before submission. Nothing
in this package represents an approval, certification, or platform partnership.

Use these canonical review files:

- [META.md](META.md) - Facebook Pages, Instagram via Facebook Login,
  Instagram Login, and Threads
- [TIKTOK.md](TIKTOK.md)
- [YOUTUBE.md](YOUTUBE.md)
- [LINKEDIN.md](LINKEDIN.md)
- [X.md](X.md)
- [PINTEREST.md](PINTEREST.md)

Bluesky and Mastodon do not have a central app-review process. Their operational
setup notes remain in [bluesky.md](bluesky.md) and [mastodon.md](mastodon.md).

## URL convention

Set `FRONTEND_URL=https://app.example.com` in production. Publishly's reference
proxy exposes the backend under `/api`, so the public URLs are:

```text
OAuth callback: https://app.example.com/integrations/social/<provider>
Meta deletion callback: https://app.example.com/api/public/meta/data-deletion
Deletion instructions/status: https://app.example.com/data-deletion
Privacy: https://app.example.com/privacy
Terms: https://app.example.com/terms
```

Production callbacks must use the exact, public HTTPS origin. The development
`redirectmeto.com` compatibility path is not a production configuration.

## Submission preparation

Before any review, deploy the public HTTPS site, publish truthful legal and data
handling pages, configure support contact details, create owner-controlled test
accounts, and record the complete connect -> consent -> compose -> schedule ->
worker publish -> status flow. Demonstrate every requested permission. Give
reviewers credentials only through the provider's protected review form.

## Safest approval order

1. Bluesky and a controlled Mastodon instance.
2. YouTube in consent-screen test mode.
3. LinkedIn member posting.
4. Meta development-role/tester accounts.
5. TikTok unaudited/private-only test posting.
6. Pinterest trial access.
7. X after funding Developer Console credits and setting a spend limit.
8. Submit provider reviews, then repeat one low-volume canary after approval.
