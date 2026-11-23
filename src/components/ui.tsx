import type { ReactNode } from 'react';

export function TierBadge({ tier }: { tier: number }) {
  return <span className={`tier tier-${tier}`} title={`Suitability tier ${tier} (1 high risk, 4 fully safe)`}>{tier}</span>;
}

export function Chip({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'no' | 'event' | 'brand'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Panel({ id, step, title, question, highlighted, children }: {
  id: string; step: number; title: string; question: string; highlighted: boolean; children: ReactNode;
}) {
  return (
    <section id={id} className={`panel${highlighted ? ' is-highlighted' : ''}`} aria-labelledby={`${id}-title`}>
      <header className="panel-head">
        <span className="step" aria-hidden="true">{step}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{question}</p>
        </div>
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
