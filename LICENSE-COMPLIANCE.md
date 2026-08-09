# Publishly — License Compliance (AGPL-3.0)

Publishly is a derivative work of [Postiz](https://github.com/gitroomhq/postiz-app)
(copyright Nevo David and contributors), licensed under the **GNU Affero General
Public License v3.0** (see `LICENSE`). Verified 2026-08-09 from the upstream
LICENSE file: standard AGPL-3.0 text, no additional custom terms.

## What the license permits

- Commercial use, including offering the software as a paid hosted SaaS
  ("you may charge any price or no price for each copy that you convey").
- Rebranding the product name and UI (trademarks are separate from copyright —
  we do not use the "Postiz" name or logo for the Publishly brand).
- Modifying and extending the software.

## What the license requires of the Publishly operation

1. **Network source offer (AGPL §13).** Every user who interacts with a modified
   version over a network must be prominently offered access to the Corresponding
   Source of the running version, at no charge. Implementation: the app footer and
   marketing site link to a source archive/repository for the exact deployed
   revision. Operational rule: each production deploy must have its source
   obtainable by users (public mirror of the deployed tree, or an authenticated
   "download source" endpoint available to all users).
2. **Preserve notices (§4, §5, §7).** Keep the `LICENSE` file, upstream copyright
   headers, and this notice intact. Modified files carry relevant notices via git
   history and release notes.
3. **License continuity (§5, §10).** All Publishly modifications are themselves
   AGPL-3.0. No additional restrictions may be imposed on users' AGPL rights.
4. **No warranty disclaimers removed (§15, §16).** Keep as-is.

## What this means commercially

- Charging subscriptions for the hosted service: permitted.
- Keeping *operational* secrets private (credentials, infrastructure config,
  prices, non-code business assets): permitted — AGPL covers the program source,
  not env values or data.
- Keeping *code* modifications private from your own network users: **not
  permitted.** Competitors may obtain and reuse the source under the same
  license. This is an accepted cost of building on Postiz; the moat is
  operations, brand, and distribution, not source secrecy.
- Alternative: Postiz also sells commercial licensing for closed deployments —
  an operator decision if source disclosure becomes unacceptable.

## Trademark hygiene

- "Publishly" branding must not imply endorsement by or affiliation with Postiz.
- The docs credit Postiz as the upstream project (this file and README).

## Update path

Upstream remains a git remote (`upstream`); baseline tag
`upstream-baseline-20260809` marks the fork point. Merging upstream keeps the
combined work under AGPL-3.0; nothing extra required beyond the obligations above.
