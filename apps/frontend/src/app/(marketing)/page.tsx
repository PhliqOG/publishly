import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { DeparturesBoard } from '@gitroom/frontend/components/marketing/departures-board';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export default function MarketingHome() {
  return (
    <>
      <MarketingNav />

      <header className="mk-hero">
        <div className="mk-container mk-hero-inner">
          <div>
            <p className="mk-eyebrow">Scheduling for social teams</p>
            <h1 className="mk-h1">
              Every post leaves <span className="mk-h1-time">on time.</span>
            </h1>
            <p className="mk-hero-sub">{MARKETING.sub}</p>
            <div className="mk-hero-ctas">
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
              <Link href="/features" className="mk-btn mk-btn-ghost">
                {MARKETING.cta.secondary}
              </Link>
            </div>
            <p className="mk-hero-note">
              Free plan included. No card required to start.
            </p>
          </div>
          <DeparturesBoard />
        </div>
      </header>

      <section className="mk-section mk-section-alt" id="reliability">
        <div className="mk-container">
          <h2 className="mk-h2">Runs on rails.</h2>
          <p className="mk-section-lede">
            Most schedulers are a cron job with a nice calendar. {MARKETING.brand}{' '}
            treats publishing like infrastructure: a durable workflow engine
            executes every post, so the worst moments — crashes, rate limits,
            expired tokens — stay boring.
          </p>
          <div className="mk-cards">
            {MARKETING.reliability.map((card, i) => (
              <div className="mk-card" key={card.title}>
                <span className="mk-card-num">
                  RAIL {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <h2 className="mk-h2">Write once, arrive everywhere.</h2>
          <p className="mk-section-lede">
            A composer that understands each network is different — and a
            calendar that makes a full week feel finished, not frantic.
          </p>
          <div className="mk-cards">
            {MARKETING.composer.map((card) => (
              <div className="mk-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section mk-section-alt">
        <div className="mk-container">
          <h2 className="mk-h2">Ten networks. Official APIs only.</h2>
          <p className="mk-section-lede">
            Connections use each platform&apos;s official OAuth and permission
            model. No password sharing, no browser puppets, nothing that breaks
            when a platform sneezes.
          </p>
          <div className="mk-networks">
            {MARKETING.networks.map((n) => (
              <span className="mk-network-chip" key={n}>
                {n}
              </span>
            ))}
          </div>
          <p className="mk-networks-note">
            Plus twenty more communities and publishing targets inherited from
            the open-source engine underneath.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <h2 className="mk-h2">Pricing that reads like a timetable.</h2>
          <p className="mk-section-lede">
            Four plans, one variable that matters: how much you publish. Every
            plan starts with a 7-day trial.
          </p>
          <PricingCards compact />
          <p className="mk-free-line">
            There is also a free plan for trying the composer and calendar —
            upgrade when a channel goes live.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-band">
            <div>
              <h2 className="mk-h2">Monday, planned by Friday.</h2>
              <p>
                Connect a channel, fill the week, and watch the board clear
                itself.
              </p>
            </div>
            <Link
              href={MARKETING.authRegister}
              className="mk-btn mk-btn-primary"
            >
              {MARKETING.cta.primary}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
