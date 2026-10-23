import { useState } from 'react';

/** NBA headshot with a silent fallback to initials if the image fails. */
export function Headshot({ id, name }: { id: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ž]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  if (failed) return <span className="headshot initials" aria-hidden>{initials}</span>;
  return (
    <img
      className="headshot"
      src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Team logo with a fallback to the tricode. */
export function TeamLogo({ teamId, tri }: { teamId: number; tri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !teamId) return <span className="logo-fallback">{tri}</span>;
  return <img className="logo" src={`https://cdn.nba.com/logos/nba/${teamId}/global/L/logo.svg`} alt="" onError={() => setFailed(true)} />;
}
