// The small "?" next to a term (RK-9): a real link to "How to read this", opened at that term's section.
// A click never reaches the row, header cell or label it sits in.

import { HELP_SECTIONS, helpHref, type HelpSection } from '../app/help.ts';

export function HelpLink({ section }: { section: HelpSection }) {
  const tip = HELP_SECTIONS.find(([id]) => id === section)![2];
  return (
    <a className="help-q" href={helpHref(section)} title={tip} aria-label={`${tip} Opens "How to read this".`} onClick={(e) => e.stopPropagation()} data-testid="help-link" data-section={section}>
      ?
    </a>
  );
}
