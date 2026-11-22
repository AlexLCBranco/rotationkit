// Top-of-page warning when the data update failed or has not succeeded for too long (data/update-status.json).

import { useEffect, useState } from 'react';
import { staleBanner, type UpdateStatus } from '../domain/updateStatus.ts';

/** The status file, or null when it is missing or unreadable (no banner then). Not memoized: read once per page load. */
async function loadStatus(): Promise<UpdateStatus | null> {
  try {
    const r = await fetch('/data/update-status.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as UpdateStatus;
  } catch {
    return null;
  }
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function StaleBanner({ now = () => new Date() }: { now?: () => Date }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => void loadStatus().then(setStatus), []);
  const b = staleBanner(status, now());
  if (!b || !status) return null;
  const last = b.lastSuccess ? `Data last updated ${when(b.lastSuccess)}` : 'Data has not been updated successfully yet';
  return (
    <div className="stale-banner" role="alert" data-testid="stale-banner" data-reason={b.reason}>
      <strong>⚠ {last}, </strong>
      {b.reason === 'failed' ? (
        <>
          <strong>update failing since {when(b.since!)}.</strong>{' '}
          <span className="muted">
            Last run failed at “{status.failingStep}”. Games played since then are missing.
          </span>
        </>
      ) : (
        <>
          <strong>no successful update since then.</strong> <span className="muted">The data update has not run since {when(b.since!)}.</span>
        </>
      )}
    </div>
  );
}
