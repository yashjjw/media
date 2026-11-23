export interface TourStep { title: string; caption: string }

export function Tour({ steps, index, onBack, onNext, onExit }: {
  steps: TourStep[]; index: number; onBack: () => void; onNext: () => void; onExit: () => void;
}) {
  const s = steps[index - 1];
  const last = index === steps.length;
  return (
    <div className="tour" role="region" aria-live="polite" aria-label="Guided demo">
      <div className="tour-progress" aria-hidden="true">
        {steps.map((_, i) => <i key={i} className={i < index ? 'is-done' : ''} />)}
      </div>
      <div className="tour-text">
        <span className="tour-step">Step {index} of {steps.length}: {s.title}</span>
        <p>{s.caption}</p>
      </div>
      <div className="tour-actions">
        <button type="button" onClick={onBack} disabled={index === 1}>Back</button>
        <button type="button" className="is-primary" onClick={onNext}>{last ? 'Finish' : 'Next'}</button>
        <button type="button" onClick={onExit} aria-label="Exit guided demo">Exit</button>
      </div>
    </div>
  );
}
