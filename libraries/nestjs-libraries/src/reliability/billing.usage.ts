import {
  BillingTier,
  pricingForTier,
  resolveBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export type MonthlyBillingWindow = {
  start: Date;
  end: Date;
};

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addUtcMonths(anchor: Date, months: number) {
  const absoluteMonth = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

export function monthlyBillingWindow(
  anchor: Date,
  now = new Date()
): MonthlyBillingWindow {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(now.getTime())) {
    throw new Error(
      'Billing usage requires valid anchor and current timestamps.'
    );
  }
  if (anchor.getTime() > now.getTime()) {
    throw new Error('Billing usage anchor cannot be in the future.');
  }

  let ordinal =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  let start = addUtcMonths(anchor, ordinal);
  if (start.getTime() > now.getTime()) {
    ordinal -= 1;
    start = addUtcMonths(anchor, ordinal);
  }

  let end = addUtcMonths(anchor, ordinal + 1);
  if (end.getTime() <= now.getTime()) {
    ordinal += 1;
    start = end;
    end = addUtcMonths(anchor, ordinal + 1);
  }

  return { start, end };
}

export function successfulPostUsageProjection(input: {
  tier?: string | null;
  anchor: Date;
  used: number;
  now?: Date;
}) {
  const tier: BillingTier = resolveBillingTier(input.tier);
  const plan = pricingForTier(tier);
  const window = monthlyBillingWindow(input.anchor, input.now);
  const used = Math.max(0, Math.floor(input.used));
  const limit = plan.posts_per_month;
  return {
    metric: 'confirmed_live_destinations' as const,
    tier,
    periodStart: window.start,
    periodEnd: window.end,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    exhausted: used >= limit,
  };
}
