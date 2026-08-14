import Link from 'next/link';
import {
  pricing,
  UNLIMITED_CHANNELS,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { MARKETING } from './marketing.config';

// Rendered from the same entitlement config the server enforces - the page
// can never drift from what billing actually grants. (Client bundles see the
// defaults; server-side overrides only tighten or relabel entitlements.)
// Historical ULTIMATE records resolve to Scale. There are exactly four public
// plans, and only these keys may render.

const PLAN_FOR: Record<string, string> = {
  FREE: 'Try it on five accounts',
  STANDARD: 'For growing teams',
  TEAM: 'For multi-brand teams',
  PRO: 'For agencies & media networks',
};

const ORDER = ['FREE', 'STANDARD', 'TEAM', 'PRO'];

// 1,000,000 is the internal "no practical cap" sentinel — say it like a human.
const posts = (n: number) =>
  `Up to ${n.toLocaleString()} confirmed-live posts / month`;

// UNLIMITED_CHANNELS is a sentinel, never a number to print.
const accounts = (n?: number) =>
  (n ?? 0) >= UNLIMITED_CHANNELS
    ? 'Unlimited social accounts'
    : `${n ?? 0} social accounts`;

export const PricingCards = ({ compact = false }: { compact?: boolean }) => (
  <div className="mk-pricing-grid">
    {ORDER.map((tier) => {
      const plan = pricing[tier];
      return (
        <div
          key={tier}
          className={`mk-plan ${tier === 'TEAM' ? 'mk-plan-highlight' : ''}`}
        >
          <h3>{plan.display_name}</h3>
          <div className="mk-plan-for">{PLAN_FOR[tier]}</div>
          <div className="mk-plan-price">
            ${plan.month_price}
            <span> /month</span>
          </div>
          <ul>
            <li>
              <strong>{accounts(plan.channel)}</strong>
            </li>
            <li>{posts(plan.posts_per_month)}</li>
            <li>Failed and unconfirmed posts use no quota</li>
            {plan.full_observability && (
              <li>Full receipts, failure reasons &amp; account health</li>
            )}
            {plan.dead_account_detection && <li>Disconnected-account alerts</li>}
            {plan.priority_retries && <li>Faster retry handling</li>}
            {plan.sla && <li>Reliability SLA</li>}
            {plan.team_members ? (
              <li>{plan.seats} team members</li>
            ) : (
              <li>1 seat</li>
            )}
            {!compact && (
              <li>
                {plan.workspaces > 1
                  ? `${plan.workspaces} workspaces`
                  : '1 workspace'}
              </li>
            )}
            {!compact && (
              <li>
                {plan.analytics_retention_days >= 365
                  ? `${Math.round(plan.analytics_retention_days / 365)}-year`
                  : `${plan.analytics_retention_days}-day`}{' '}
                analytics history
              </li>
            )}
            {!compact && <li>{plan.storage_gb} GB media storage</li>}
            {plan.public_api && <li>API access</li>}
            {plan.bulk_tools && <li>Bulk CSV scheduling</li>}
            {plan.autoPost && <li>RSS auto-posting</li>}
          </ul>
          <Link
            href={MARKETING.authRegister}
            className={`mk-btn ${
              tier === 'TEAM' ? 'mk-btn-primary' : 'mk-btn-ghost'
            }`}
          >
            {tier === 'FREE' ? 'Start free' : 'Start 7-day trial'}
          </Link>
        </div>
      );
    })}
  </div>
);
