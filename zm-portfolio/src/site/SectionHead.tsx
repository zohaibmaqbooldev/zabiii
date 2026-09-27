import type { ReactNode } from 'react';
import { Reveal } from '../components/ui';

/** Editorial section opener: a ruled line with index + label, then the headline. */
export function SectionHead({ index, label, title, aside, id }: { index: string; label: string; title: ReactNode; aside?: ReactNode; id: string }) {
  return (
    <Reveal as="header" className="section-head">
      <div className="section-head__rule">
        <span className="mono">({index})</span>
        <span className="mono">{label}</span>
      </div>
      <div className="section-head__row">
        <h2 id={id} className="section-head__title">
          {title}
        </h2>
        {aside && <div className="section-head__aside">{aside}</div>}
      </div>
    </Reveal>
  );
}
