import { useDeferredValue, useMemo, useState, type MouseEvent } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { EmptyState, Reveal, Skeleton } from '../components/ui';
import { Link } from '../lib/router';
import { usePortfolio } from '../lib/portfolio';
import type { Project } from '../lib/types';
import { cx, pad2, safeUrl } from '../lib/utils';
import { SectionHead } from './SectionHead';

/** Name the clicked project's image so the browser morphs it into the detail page hero. */
export function markHero(e: MouseEvent<HTMLElement>) {
  const img = e.currentTarget.closest('article')?.querySelector<HTMLElement>('.smart-img');
  if (img) img.style.setProperty('view-transition-name', 'project-hero');
}

export function TechTags({ list, max }: { list: string[] | null; max?: number }) {
  const all = (list || []).filter(Boolean);
  if (!all.length) return null;
  const shown = max ? all.slice(0, max) : all;
  return (
    <ul className="tags" aria-label="Technologies">
      {shown.map((t) => (
        <li key={t} className="tag">
          {t}
        </li>
      ))}
      {max && all.length > max && <li className="tag tag--more">+{all.length - max}</li>}
    </ul>
  );
}

/** GitHub / Live buttons — rendered only for links that actually exist. */
export function ProjectLinks({ p, size = 'sm' }: { p: Project; size?: 'sm' | 'md' }) {
  const gh = safeUrl(p.github_url);
  const live = safeUrl(p.live_url);
  if (!gh && !live) return null;
  const cls = cx('btn', 'btn--ghost', size === 'sm' && 'btn--sm');
  return (
    <>
      {live && (
        <a className={cx('btn', size === 'sm' ? 'btn--sm' : '', 'btn--blue')} href={live} target="_blank" rel="noopener noreferrer">
          Live Demo <Icon name="arrow-up-right" size={15} className="btn__arrow-ur" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {gh && (
        <a className={cls} href={gh} target="_blank" rel="noopener noreferrer">
          <Icon name="github" size={15} /> View on GitHub
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </>
  );
}

// ------------------------------------------------------------ Featured ----

export function FeaturedProjects() {
  const { data, status } = usePortfolio();
  const featured = data.projects.filter((p) => p.featured);
  const [lead, ...others] = featured;

  return (
    <section id="work" className="section work" aria-labelledby="work-title">
      <div className="container">
        <SectionHead
          index="03"
          label="Selected work"
          id="work-title"
          title={
            <>
              Featured <span className="serif accent">projects</span>
            </>
          }
          aside={<p className="section-head__note">A closer look at the work I'm most proud of — what it does and what it's built with.</p>}
        />

        {status === 'loading' && !data.projects.length ? (
          <div className="feature" aria-busy="true">
            <Skeleton className="feature__media-skel" h="auto" />
            <div className="feature__body">
              <Skeleton w={100} />
              <Skeleton w="80%" h={44} />
              <Skeleton w="95%" />
              <Skeleton w="70%" />
            </div>
          </div>
        ) : !lead ? (
          <EmptyState
            icon="star"
            title={data.projects.length ? 'No featured projects yet.' : 'No projects added yet.'}
            text={data.projects.length ? 'Mark a project as “Featured” in the admin dashboard to spotlight it here.' : undefined}
          />
        ) : (
          <>
            <FeatureBlock p={lead} index={1} lead />
            {others.slice(0, 2).map((p, i) => (
              <FeatureBlock key={p.id} p={p} index={i + 2} flip={i % 2 === 0} />
            ))}
            {others.length > 2 && (
              <div className="feature-grid">
                {others.slice(2).map((p, i) => (
                  <ProjectCard key={p.id} p={p} index={i + 4} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FeatureBlock({ p, index, flip, lead }: { p: Project; index: number; flip?: boolean; lead?: boolean }) {
  return (
    <Reveal as="article" className={cx('feature', flip && 'feature--flip', lead && 'feature--lead')}>
      <Link to={`/projects/${p.slug}`} className="feature__media" aria-label={`Open ${p.title}`} tabIndex={-1} onClick={markHero}>
        <SmartImage
          src={p.image}
          alt={`${p.title} — project preview`}
          ratio="16 / 10"
          sizes={lead ? '(max-width: 900px) 92vw, 60vw' : '(max-width: 900px) 92vw, 50vw'}
          className="feature__img"
          fallbackLabel={p.title}
        />
        <span className="feature__num mono">F/{pad2(index)}</span>
      </Link>
      <div className="feature__body">
        <p className="feature__meta mono">
          <span>{p.category || 'Project'}</span>
          <span aria-hidden="true">·</span>
          <span>{new Date(p.created_at).getFullYear()}</span>
        </p>
        <h3 className="feature__title">
          <Link to={`/projects/${p.slug}`} onClick={markHero}>
            {p.title}
          </Link>
        </h3>
        {p.short_description && <p className="feature__desc">{p.short_description}</p>}
        <TechTags list={p.technologies} />
        <div className="feature__actions">
          <Link to={`/projects/${p.slug}`} className="btn btn--primary btn--sm" onClick={markHero}>
            View project <Icon name="arrow" size={15} className="btn__arrow" />
          </Link>
          <ProjectLinks p={p} />
        </div>
      </div>
    </Reveal>
  );
}

// ------------------------------------------------------------ Card --------

export function ProjectCard({ p, index }: { p: Project; index: number }) {
  return (
    <article className="card">
      <Link to={`/projects/${p.slug}`} className="card__link" onClick={markHero}>
        <span className="sr-only">View project: {p.title}</span>
      </Link>
      <div className="card__media">
        <SmartImage src={p.image} alt="" ratio="16 / 10" sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 30vw" fallbackLabel={p.title} />
        <span className="card__num mono">{pad2(index)}</span>
      </div>
      <div className="card__body">
        <p className="card__meta mono">{p.category || 'Project'}</p>
        <h3 className="card__title">{p.title}</h3>
        {p.short_description && <p className="card__desc">{p.short_description}</p>}
        <TechTags list={p.technologies} max={4} />
        <span className="card__cta" aria-hidden="true">
          View Project <Icon name="arrow-up-right" size={15} />
        </span>
      </div>
    </article>
  );
}

// ------------------------------------------------------------ Archive -----

const PAGE = 6;

export function ProjectArchive() {
  const { data, status } = usePortfolio();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [tech, setTech] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const categories = useMemo(() => ['All', ...new Set(data.projects.map((p) => p.category?.trim()).filter(Boolean) as string[])], [data.projects]);
  const techs = useMemo(() => [...new Set(data.projects.flatMap((p) => p.technologies || []))].sort((a, b) => a.localeCompare(b)), [data.projects]);

  const filtered = useMemo(
    () =>
      data.projects.filter((p) => {
        if (cat !== 'All' && (p.category?.trim() || '') !== cat) return false;
        if (tech && !(p.technologies || []).includes(tech)) return false;
        if (!q) return true;
        return [p.title, p.short_description, p.category, ...(p.technologies || [])].join(' ').toLowerCase().includes(q);
      }),
    [data.projects, cat, tech, q],
  );
  const shown = filtered.slice(0, limit);
  const filtering = q || cat !== 'All' || tech;

  return (
    <section id="projects" className="section archive" aria-labelledby="archive-title">
      <div className="container">
        <SectionHead
          index="04"
          label="Archive"
          id="archive-title"
          title={
            <>
              All <span className="serif accent">projects</span>
            </>
          }
          aside={
            data.projects.length > 0 && (
              <p className="section-head__note">
                <strong>{pad2(data.projects.length)}</strong> {data.projects.length === 1 ? 'project' : 'projects'} — search or filter by category and technology.
              </p>
            )
          }
        />

        {data.projects.length > 0 && (
          <div className="toolbar" role="search">
            <label className="search">
              <Icon name="search" size={17} />
              <span className="sr-only">Search projects</span>
              <input
                type="search"
                placeholder="Search projects…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
              />
            </label>
            <div className="segmented" role="group" aria-label="Filter by category">
              {categories.map((c) => (
                <button
                  key={c}
                  className={cx('segmented__btn', cat === c && 'is-active')}
                  aria-pressed={cat === c}
                  onClick={() => {
                    setCat(c);
                    setLimit(PAGE);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            {techs.length > 1 && (
              <label className="select">
                <span className="sr-only">Filter by technology</span>
                <select
                  value={tech}
                  onChange={(e) => {
                    setTech(e.target.value);
                    setLimit(PAGE);
                  }}
                >
                  <option value="">All technologies</option>
                  {techs.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Icon name="arrow-down" size={14} />
              </label>
            )}
          </div>
        )}

        {status === 'loading' && !data.projects.length ? (
          <div className="card-grid" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div className="card card--skel" key={i}>
                <Skeleton h="auto" className="card__skel-media" />
                <div className="card__body">
                  <Skeleton w={80} />
                  <Skeleton w="70%" h={24} />
                  <Skeleton w="95%" />
                </div>
              </div>
            ))}
          </div>
        ) : data.projects.length === 0 ? (
          <EmptyState icon="folder" title="No projects added yet." text="New projects appear here the moment they're published from the admin dashboard." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="No projects match those filters."
            action={
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setQuery('');
                  setCat('All');
                  setTech('');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {filtering ? `${filtered.length} projects found` : ''}
            </p>
            <div className="card-grid">
              {shown.map((p, i) => (
                <ProjectCard key={p.id} p={p} index={i + 1} />
              ))}
            </div>
            {filtered.length > limit && (
              <div className="archive__more">
                <button className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more <span className="mono">({filtered.length - limit})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
