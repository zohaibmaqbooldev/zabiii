import { useMemo } from 'react';
import { EmptyState, Reveal, Skeleton } from '../components/ui';
import { usePortfolio } from '../lib/portfolio';
import { PROFICIENCY_LABELS, type Skill } from '../lib/types';
import { pad2 } from '../lib/utils';
import { SectionHead } from './SectionHead';

function Level({ value: raw }: { value: number }) {
  // older rows may store 0–100; show everything on the 1–5 scale
  const value = Math.max(1, Math.min(5, raw > 5 ? Math.ceil(raw / 20) : raw));
  return (
    <span className="level" aria-label={`${PROFICIENCY_LABELS[value]} — ${value} of 5`} title={PROFICIENCY_LABELS[value]}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Skills() {
  const { data, status } = usePortfolio();
  const groups = useMemo(() => {
    const m = new Map<string, Skill[]>();
    data.skills.forEach((s) => {
      const k = s.category?.trim() || 'General';
      m.set(k, [...(m.get(k) || []), s]);
    });
    return [...m.entries()];
  }, [data.skills]);

  return (
    <section id="skills" className="section skills" aria-labelledby="skills-title">
      <div className="container">
        <SectionHead
          index="02"
          label="Skills"
          id="skills-title"
          title={
            <>
              Tools &amp; <span className="serif accent">technologies</span>
            </>
          }
          aside={
            data.skills.length > 0 && (
              <p className="section-head__note">
                <strong>{pad2(data.skills.length)}</strong> skills across <strong>{pad2(groups.length)}</strong> disciplines — the toolkit I'm learning and
                using in coursework and personal projects.
              </p>
            )
          }
        />

        {status === 'loading' && data.skills.length === 0 ? (
          <div className="skill-rows" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div className="skill-row" key={i}>
                <Skeleton w={120} h={18} />
                <div className="skill-row__chips">
                  {[90, 70, 110, 80].map((w, j) => (
                    <Skeleton key={j} w={w} h={40} round />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="code" title="No skills added yet." text="Skills added in the admin dashboard will appear here." />
        ) : (
          <div className="skill-rows">
            {groups.map(([cat, list], gi) => (
              <Reveal key={cat} className="skill-row" delay={gi * 60}>
                <div className="skill-row__head">
                  <span className="mono skill-row__index">{pad2(gi + 1)}</span>
                  <h3>{cat}</h3>
                  <span className="mono skill-row__count">{pad2(list.length)}</span>
                </div>
                <ul className="skill-row__chips">
                  {list.map((s) => (
                    <li key={s.id} className="chip">
                      <span className="chip__name">{s.name}</span>
                      {s.proficiency ? <Level value={s.proficiency} /> : null}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function Marquee() {
  const { data } = usePortfolio();
  const names = data.skills.map((s) => s.name);
  if (names.length < 4) return null;
  const run = [...names, ...names];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {[0, 1].map((k) => (
          <div className="marquee__group" key={k}>
            {run.map((n, i) => (
              <span key={i}>
                {n}
                <i>/</i>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
