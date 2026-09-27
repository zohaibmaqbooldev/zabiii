import { Icon } from '../components/Icon';
import { Reveal } from '../components/ui';
import { usePortfolio } from '../lib/portfolio';
import { cx, safeUrl } from '../lib/utils';
import { TechTags } from './Projects';
import { SectionHead } from './SectionHead';

/**
 * Work / experience. Renders nothing until the admin publishes an entry,
 * so the rest of the page is unchanged while there's no experience to show.
 */
export function Experience() {
  const { data } = usePortfolio();
  if (!data.experience.length) return null;
  return (
    <section id="experience" className="section education" aria-labelledby="exp-title">
      <div className="container">
        <SectionHead
          index="05"
          label="Experience"
          id="exp-title"
          title={
            <>
              Work &amp; <span className="serif accent">experience</span>
            </>
          }
        />
        <ol className="timeline">
          {data.experience.map((e, i) => {
            const when = [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' — ');
            const url = safeUrl(e.company_url);
            return (
              <Reveal as="li" key={e.id} className={cx('tl-item', e.is_current && 'is-current')} delay={i * 80}>
                <div className="tl-item__when mono">{when}</div>
                <div className="tl-item__node" aria-hidden="true" />
                <div className="tl-item__body">
                  <h3 className="tl-item__title">{e.position}</h3>
                  <p className="tl-item__place">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-link">
                        {e.company} <Icon name="arrow-up-right" size={13} />
                      </a>
                    ) : (
                      e.company
                    )}
                    {e.location && <> · {e.location}</>}
                  </p>
                  {e.description && <p className="tl-item__desc">{e.description}</p>}
                  <TechTags list={e.technologies} />
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Section numbers after Experience move up by one only when Experience is shown. */
export function useIndex(base: number) {
  const { data } = usePortfolio();
  return String(base + (data.experience.length ? 1 : 0)).padStart(2, '0');
}
