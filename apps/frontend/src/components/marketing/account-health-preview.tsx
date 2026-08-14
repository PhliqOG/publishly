const HEALTH_ROWS = [
  {
    name: 'Northline locations',
    detail: '48 connected accounts',
    state: 'Healthy',
    note: 'All scheduled posts on time',
    tone: 'ok',
  },
  {
    name: 'Sunday Ledger brands',
    detail: '12 connected accounts',
    state: 'Token warning',
    note: '2 connections need attention this week',
    tone: 'warn',
  },
  {
    name: 'Field Notes channels',
    detail: '64 connected accounts',
    state: 'Retrying',
    note: 'Instagram rate limit · next try in 42s',
    tone: 'retry',
  },
  {
    name: 'Harbor & Pine locations',
    detail: '20 connected accounts',
    state: 'Reconnect',
    note: '1 Facebook connection expired',
    tone: 'bad',
  },
] as const;

export function AccountHealthPreview() {
  return (
    <div className="mk-health-preview" aria-label="Example account health view">
      <div className="mk-health-top">
        <div>
          <span className="mk-health-kicker">Example workspace</span>
          <h3>Account health</h3>
        </div>
        <span className="mk-health-live">
          <i aria-hidden="true" /> Updated just now
        </span>
      </div>
      <div className="mk-health-stats">
        <div>
          <strong>186</strong>
          <span>brand &amp; client accounts</span>
        </div>
        <div>
          <strong>172</strong>
          <span>healthy</span>
        </div>
        <div>
          <strong>8</strong>
          <span>early warnings</span>
        </div>
        <div>
          <strong>4</strong>
          <span>retrying now</span>
        </div>
        <div>
          <strong>2</strong>
          <span>need reconnecting</span>
        </div>
      </div>
      <div className="mk-health-rows">
        {HEALTH_ROWS.map((row) => (
          <div className="mk-health-row" key={row.name}>
            <div>
              <strong>{row.name}</strong>
              <span>{row.detail}</span>
            </div>
            <div className="mk-health-row-note">{row.note}</div>
            <span className="mk-health-state" data-tone={row.tone}>
              <i aria-hidden="true" /> {row.state}
            </span>
          </div>
        ))}
      </div>
      <p className="mk-health-caption">
        Illustrative product preview · sample names and sample data
      </p>
    </div>
  );
}
