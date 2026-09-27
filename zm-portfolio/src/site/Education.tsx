import { EmptyState, Reveal, Skeleton } from '../components/ui';
import { usePortfolio } from '../lib/portfolio';
import { cx } from '../lib/utils';
import { SectionHead } from './SectionHead';
import { useIndex } from './Experience';

export function Education() {
  const { data, status } = usePortfolio();
  return (
    <section id="education" className="section education" aria-labelledby="edu-title">
      <div className="container">
        <SectionHead
          index={useIndex(5)}
          label="Education"
          id="edu-title"
          title={
            <>
              The <span className="serif accent">foundation</span>
            </>
          }
        />
        {status === 'loading' && !data.education.length ? (
          <div className="timeline" aria-busy="true">
            <div className="tl-item">
              <Skeleton w={90} />
              <div className="tl-item__body">
                <Skeleton w="60%" h={30} />
                <Skeleton w="40%" />
              </div>
            </div>
          </div>
        ) : data.education.length === 0 ? (
          <EmptyState icon="cap" title="No education added yet." />
        ) : (
          <ol className="timeline">
            {data.education.map((e, i) => {
              const when = [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' — ');
              return (
                <Reveal as="li" key={e.id} className={cx('tl-item', e.is_current && 'is-current')} delay={i * 80}>
                  <div className="tl-item__when mono">{when || (e.is_current ? 'Present' : '')}</div>
                  <div className="tl-item__node" aria-hidden="true" />
                  <div className="tl-item__body">
                    {e.is_current && (
                      <p className="status-pill">
                        <span className="live-dot" aria-hidden="true" /> Currently studying
                      </p>
                    )}
                    <h3 className="tl-item__title">{e.degree}</h3>
                    {(e.institution || e.location) && (
                      <p className="tl-item__place">{[e.institution, e.location].filter(Boolean).join(' · ')}</p>
                    )}
                    {e.field && e.field !== e.degree && !e.degree.includes(e.field) && <p className="tl-item__field mono">{e.field}</p>}
                    {e.description && <p className="tl-item__desc">{e.description}</p>}
                  </div>
                </Reveal>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
