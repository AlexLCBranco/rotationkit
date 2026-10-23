import type { ReactNode } from 'react';

export function Header({ children, back }: { children?: ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/">rotationkit</a>
      {back && (
        <button className="back" onClick={back.onClick}>
          ← {back.label}
        </button>
      )}
      {children}
    </header>
  );
}
