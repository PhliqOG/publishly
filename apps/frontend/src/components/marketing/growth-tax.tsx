'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';

// The growth-tax calculator: what N connected accounts costs per month on
// Publishly's flat plans vs per-profile / per-channel pricing.
//
// Every competitor number below is transcribed from data/claim-provenance.json
// (ids: ayrshare-100-profiles, buffer-30-channels, metricool-tiers), verified
// 2026-08-10. No other competitor figures are permitted on this page.

const AYRSHARE_BASE = 599; // Business plan, monthly billing
const AYRSHARE_INCLUDED_PROFILES = 30; // included in the base price
const AYRSHARE_PER_EXTRA_PROFILE = 8.99; // per profile beyond 30
const BUFFER_PER_CHANNEL = 12; // Team plan, monthly billing; $10 on annual billing
const METRICOOL_BRAND_CAP = 50; // published 50-brand maximum
const METRICOOL_ADVANCED_RANGE = '$53–$159'; // published Advanced range

const ayrshareCost = (n: number) =>
  n <= AYRSHARE_INCLUDED_PROFILES
    ? AYRSHARE_BASE
    : AYRSHARE_BASE +
      (n - AYRSHARE_INCLUDED_PROFILES) * AYRSHARE_PER_EXTRA_PROFILE;

const money = (n: number) => {
  const cents = Math.round(n * 100);
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

const noteStyle: CSSProperties = {
  margin: '10px 0 16px',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: 'var(--mk-text-3)',
};

const mutedLabel: CSSProperties = { color: 'var(--mk-text-3)' };

export const GrowthTax = () => {
  const [accounts, setAccounts] = useState(100);
  const ayrshare = ayrshareCost(accounts);
  const buffer = accounts * BUFFER_PER_CHANNEL;
  const metricoolOffered = accounts <= METRICOOL_BRAND_CAP;
  const max = Math.max(99, ayrshare, buffer);

  const bar = (cost: number, us = false) => (
    <div
      aria-hidden="true"
      style={{
        marginTop: 'auto',
        height: 8,
        borderRadius: 999,
        background: 'var(--mk-surface-2)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(3, (cost / max) * 100)}%`,
          height: '100%',
          borderRadius: 999,
          background: us ? 'var(--mk-brand-400)' : 'var(--mk-line-strong)',
        }}
      />
    </div>
  );

  return (
    <div>
      <div className="mk-duo-cell" style={{ gap: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor="gt-accounts"
            style={{ fontSize: 15, fontWeight: 600 }}
          >
            Connected brand, client, or location accounts
          </label>
          <output htmlFor="gt-accounts" className="mk-tile-stat">
            {accounts}
            <span> accounts</span>
          </output>
        </div>
        <input
          id="gt-accounts"
          type="range"
          min={10}
          max={300}
          step={5}
          value={accounts}
          onChange={(e) => setAccounts(Number(e.target.value))}
          aria-valuetext={`${accounts} connected brand, client, or location accounts`}
          style={{
            width: '100%',
            margin: 0,
            accentColor: 'var(--mk-brand-600)',
          }}
        />
        <div
          className="mk-mono"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'var(--mk-text-3)',
          }}
        >
          <span>10</span>
          <span>300</span>
        </div>
      </div>

      <div className="mk-pricing-grid" style={{ marginTop: 20 }}>
        <div
          className="mk-plan"
          style={{
            borderColor: 'var(--mk-brand-400)',
            boxShadow: '0 0 0 1px var(--mk-brand-400), var(--mk-shadow)',
          }}
        >
          <div className="mk-tile-label">Publishly &mdash; Growth</div>
          <div className="mk-plan-price">
            $99
            <span> /month flat</span>
          </div>
          <p style={noteStyle}>
            The comparison anchor. Your Publishly price depends on how much you
            post, not on {accounts} accounts &mdash; Starter is $29, Scale is
            $299, all with unlimited connected accounts.
          </p>
          {bar(99, true)}
        </div>

        <div className="mk-plan">
          <div className="mk-tile-label" style={mutedLabel}>
            Ayrshare &mdash; Business
          </div>
          <div className="mk-plan-price">
            ${money(ayrshare)}
            <span> /month</span>
          </div>
          <p style={noteStyle}>
            $599/mo includes 30 profiles; each extra profile is $8.99/mo, billed
            monthly.
          </p>
          {bar(ayrshare)}
        </div>

        <div className="mk-plan">
          <div className="mk-tile-label" style={mutedLabel}>
            Buffer &mdash; Team
          </div>
          <div className="mk-plan-price">
            ${money(buffer)}
            <span> /month</span>
          </div>
          <p style={noteStyle}>
            $12 per channel on monthly billing ($10 when billed annually), at{' '}
            {accounts} channels.
          </p>
          {bar(buffer)}
        </div>

        <div className="mk-plan">
          <div className="mk-tile-label" style={mutedLabel}>
            Metricool &mdash; Advanced
          </div>
          {metricoolOffered ? (
            <>
              <div className="mk-plan-price">
                {METRICOOL_ADVANCED_RANGE}
                <span> /month</span>
              </div>
              <p style={noteStyle}>
                Published Advanced range. Metricool caps at 50 brands &mdash;
                fine at {accounts}, a wall at 51.
              </p>
            </>
          ) : (
            <>
              <div className="mk-plan-price">Not offered</div>
              <p style={noteStyle}>
                Metricool caps at 50 brands &mdash; no published plan covers{' '}
                {accounts} accounts.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
