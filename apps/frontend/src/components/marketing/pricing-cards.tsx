import Link from 'next/link';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { MARKETING } from './marketing.config';

// Rendered from the same entitlement config the server enforces - the page
// can never drift from what billing actually grants. (Client bundles see the
// defaults; server-side overrides only tighten or relabel entitlements.)

const PLAN_FOR: Record<string, string> = {
  STANDARD: 'For one brand, run properly',
  TEAM: 'For small teams sharing one calendar',
  PRO: 'For multi-brand operators',
  ULTIMATE: 'For agencies and heavy pipelines',
};

const ORDER = ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'];

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
            <li>{plan.channel} connected channels</li>
            <li>
              Up to {plan.posts_per_month.toLocaleString()} scheduled posts / month
            </li>
            {!compact && <li>{plan.webhooks} outgoing webhooks</li>}
            {!compact && <li>{plan.storage_gb} GB media storage</li>}
            {!compact && <li>{plan.analytics_retention_days} days analytics retention</li>}
            {plan.team_members ? (
              <li>Team members &amp; roles</li>
            ) : (
              <li>Single seat</li>
            )}
            {plan.public_api && <li>API access with scoped keys</li>}
            {plan.autoPost && <li>RSS auto-posting</li>}
            {!compact && plan.bulk_tools && <li>Bulk scheduling tools</li>}
            {!compact && plan.ai && <li>AI writing assistance</li>}
          </ul>
          <Link
            href={MARKETING.authRegister}
            className={`mk-btn ${
              tier === 'TEAM' ? 'mk-btn-primary' : 'mk-btn-ghost'
            }`}
          >
            Start 7-day trial
          </Link>
        </div>
      );
    })}
  </div>
);
