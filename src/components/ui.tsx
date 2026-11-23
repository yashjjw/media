import type { ReactNode } from 'react';
import type { KeywordIssue, Outcome } from '../engine';

export type Tone = 'neutral' | 'ok' | 'no' | 'warn' | 'event' | 'brand';

export function TierBadge({ tier }: { tier: number }) {
  return <span className={`tier tier-${tier}`} title={`Suitability tier ${tier} (1 high risk, 4 fully safe)`}>{tier}</span>;
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

const OUTCOME: Record<Outcome, [Tone, string]> = {
  recovered: ['ok', 'Recovered'],
  protected: ['brand', 'Protected'],
  unchanged: ['neutral', 'Unchanged'],
  changed: ['neutral', 'Changed'],
};
export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const [tone, label] = OUTCOME[outcome];
  return <Chip tone={tone}>{label}</Chip>;
}

export function IssueChip({ issue }: { issue: KeywordIssue }) {
  if (issue === 'over-blocked') return <Chip tone="warn">Over-blocked</Chip>;
  if (issue === 'risky') return <Chip tone="no">Risky placement</Chip>;
  return <Chip>No issue</Chip>;
}

export function Panel({ id, title, lede, highlighted, children }: {
  id: string; title: string; lede: string; highlighted: boolean; children: ReactNode;
}) {
  return (
    <section id={id} className={`panel${highlighted ? ' is-highlighted' : ''}`} aria-labelledby={`${id}-title`}>
      <header className="panel-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{lede}</p>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${size}`} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className={o.value === value ? 'is-on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="link-button" onClick={onClick}>{children}<span aria-hidden="true"> ›</span></button>;
}
