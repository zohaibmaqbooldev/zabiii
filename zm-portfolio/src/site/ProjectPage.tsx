import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Reveal, Skeleton } from '../components/ui';
import { Link } from '../lib/router';
import { usePortfolio, useProfile } from '../lib/portfolio';
import { formatDate, pad2, safeUrl } from '../lib/utils';
import { ProjectLinks, TechTags } from './Projects';

function setMeta(title: string, description: string) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
}

export function ProjectPage({ slug }: { slug: string }) {
  const { data, status } = usePortfolio();
  const profile = useProfile();
  const index = data.projects.findIndex((p) => p.slug === slug);
  const p = index >= 0 ? data.projects[index] : null;
  const next = data.projects.length > 1 ? data.projects[(index + 1) % data.projects.length] : null;

  useEffect(() => {
    if (p) setMeta(`${p.title} — ${profile.name}`, p.short_description || `${p.title}, a project by ${profile.name}.`);
    return () => setMeta(`${profile.name} | ${profile.title}`, 'Zohaib Maqbool is a BS Computer Science student building modern software, web projects and digital experiences.');
  }, [p, profile.name, profile.title]);

  if (!p) {
    if (status === 'loading')
      return (
        <main id="main" className="project-page container" aria-busy="true">
          <Skeleton w={120} />
          <Skeleton w="70%" h={64} className="mt" />
          <Skeleton h={420} className="mt" />
        </main>
      );
    return (
      <main id="main" className="not-found container">
        <p className="mono">Error 404</p>
        <h1>This project isn't available.</h1>
        <p>It may have been renamed, unpublished or removed.</p>
        <Link to="/#projects" className="btn btn--primary">
          <Icon name="arrow-left" size={16} /> Back to all projects
        </Link>
      </main>
    );
  }

  const paragraphs = (p.full_description || p.short_description || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const gh = safeUrl(p.github_url);
  const live = safeUrl(p.live_url);

  return (
    <main id="main" className="project-page">
      <div className="container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/#projects" className="crumbs__back">
            <Icon name="arrow-left" size={16} /> All projects
          </Link>
          <span className="mono">
            {pad2(index + 1)} / {pad2(data.projects.length)}
          </span>
        </nav>

        <header className="project-hero">
          <p className="mono project-hero__cat">
            {p.category || 'Project'}
            {p.featured && <span className="badge">Featured</span>}
          </p>
          <h1 className="project-hero__title">{p.title}</h1>
          {p.short_description && <p className="project-hero__lede">{p.short_description}</p>}
          <div className="project-hero__actions">
            <ProjectLinks p={p} size="md" />
          </div>
        </header>
      </div>

      <div className="container project-visual-wrap">
        <div className="project-visual">
          <SmartImage
            src={p.image}
            alt={`${p.title} — project visual`}
            ratio="16 / 9"
            sizes="(max-width: 1360px) 96vw, 1320px"
            priority
            className="project-visual__img"
            fallbackLabel={p.title}
          />
        </div>
      </div>

      <div className="container project-body">
        <aside className="project-meta">
          <dl>
            <div>
              <dt className="mono">Category</dt>
              <dd>{p.category || '—'}</dd>
            </div>
            <div>
              <dt className="mono">Technologies</dt>
              <dd>{(p.technologies || []).length ? <TechTags list={p.technologies} /> : '—'}</dd>
            </div>
            {gh && (
              <div>
                <dt className="mono">Source</dt>
                <dd>
                  <a href={gh} target="_blank" rel="noopener noreferrer" className="text-link">
                    GitHub repository <Icon name="arrow-up-right" size={14} />
                  </a>
                </dd>
              </div>
            )}
            {live && (
              <div>
                <dt className="mono">Live</dt>
                <dd>
                  <a href={live} target="_blank" rel="noopener noreferrer" className="text-link">
                    Open live demo <Icon name="arrow-up-right" size={14} />
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="mono">Updated</dt>
              <dd>{formatDate(p.updated_at || p.created_at, { month: 'long', year: 'numeric' })}</dd>
            </div>
          </dl>
        </aside>

        <article className="project-prose">
          <Reveal>
            <h2 className="mono">Overview</h2>
            {paragraphs.length ? paragraphs.map((t, i) => <p key={i}>{t}</p>) : <p>More details about this project are coming soon.</p>}
          </Reveal>
        </article>
      </div>

      {next && next.id !== p.id && (
        <div className="container">
          <Link to={`/projects/${next.slug}`} className="next-project">
            <span className="mono">Next project</span>
            <span className="next-project__title">
              {next.title} <Icon name="arrow" size={28} />
            </span>
          </Link>
        </div>
      )}
    </main>
  );
}
