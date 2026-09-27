import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Skeleton } from '../components/ui';
import { admin } from '../lib/api';
import { isBuiltIn } from '../lib/builtins';
import { Link } from '../lib/router';
import { formatDate, pad2 } from '../lib/utils';
import { AdminLayout, LoadFailed, Panel } from './Layout';
import { useLoad } from './useLoad';

export function Overview() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [projects, skills, education, certificates, profile, experience] = await Promise.all([
      admin.projects(),
      admin.skills(),
      admin.education(),
      admin.certificates(),
      admin.profile(),
      admin.experience(),
    ]);
    return { projects, skills, education, certificates, profile, experience };
  });

  const stats = data
    ? [
        { label: 'Total projects', value: data.projects.length, to: '/admin/projects', icon: 'folder' },
        { label: 'Published', value: data.projects.filter((p) => p.published).length, to: '/admin/projects', icon: 'eye' },
        { label: 'Featured', value: data.projects.filter((p) => p.featured).length, to: '/admin/projects', icon: 'star' },
        { label: 'Skills', value: data.skills.length, to: '/admin/skills', icon: 'code' },
        { label: 'Certificates', value: data.certificates.length, to: '/admin/certificates', icon: 'award' },
        { label: 'Education', value: data.education.length, to: '/admin/education', icon: 'cap' },
        { label: 'Experience', value: data.experience.length, to: '/admin/experience', icon: 'layers' },
      ]
    : [];

  const usesBuiltIn =
    data &&
    (data.projects.some((p) => isBuiltIn(p.image)) || isBuiltIn(data.profile?.profile_image) || !data.profile?.profile_image);

  return (
    <AdminLayout
      title="Dashboard"
      actions={
        <Link to="/admin/projects/new" className="btn btn--blue btn--sm">
          <Icon name="plus" size={16} /> Add New Project
        </Link>
      }
    >
      {error && <LoadFailed message={error} onRetry={reload} />}

      <div className="stats">
        {loading && !data
          ? Array.from({ length: 6 }, (_, i) => (
              <div className="stat" key={i}>
                <Skeleton w={80} />
                <Skeleton w={50} h={34} />
              </div>
            ))
          : stats.map((s) => (
              <Link key={s.label} to={s.to} className="stat">
                <span className="stat__label">
                  <Icon name={s.icon} size={15} /> {s.label}
                </span>
                <span className="stat__value">{pad2(s.value)}</span>
              </Link>
            ))}
      </div>

      {usesBuiltIn && (
        <div className="callout">
          <Icon name="image" size={18} />
          <div>
            <strong>Your provided images are in use.</strong> They're served, optimised, with the site. To manage them in the
            <code> portfolio-images </code> bucket, copy them there from <Link to="/admin/media">Media</Link> — or upload new ones any time.
          </div>
        </div>
      )}

      <div className="overview-grid">
        <Panel
          title="Recent projects"
          actions={
            <Link to="/admin/projects" className="btn btn--ghost btn--xs">
              All projects <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {data && data.projects.length === 0 && <p className="muted pad">No projects yet — add your first one.</p>}
          <ul className="mini-list">
            {data?.projects
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 5)
              .map((p) => (
                <li key={p.id}>
                  <Link to={`/admin/projects/${p.id}`} className="mini-row">
                    <SmartImage src={p.image} alt="" ratio="16 / 10" className="mini-row__img" sizes="80px" />
                    <span className="mini-row__text">
                      <strong>{p.title}</strong>
                      <small>
                        {p.category || 'Uncategorised'} · {formatDate(p.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </small>
                    </span>
                    <span className="mini-row__flags">
                      {p.featured && <span className="pill pill--blue">Featured</span>}
                      <span className={p.published ? 'pill pill--green' : 'pill'}>{p.published ? 'Published' : 'Hidden'}</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Panel>

        <Panel title="Quick actions">
          <div className="quick">
            <Link to="/admin/projects/new" className="quick__item">
              <Icon name="plus" /> New project
            </Link>
            <Link to="/admin/skills" className="quick__item">
              <Icon name="code" /> Manage skills
            </Link>
            <Link to="/admin/profile" className="quick__item">
              <Icon name="user" /> Edit profile & photo
            </Link>
            <Link to="/admin/media" className="quick__item">
              <Icon name="image" /> Media library
            </Link>
            <Link to="/admin/certificates" className="quick__item">
              <Icon name="award" /> Add certificate
            </Link>
            <Link to="/admin/contact" className="quick__item">
              <Icon name="whatsapp" /> Contact & WhatsApp
            </Link>
            <a href="/" target="_blank" rel="noopener" className="quick__item">
              <Icon name="external" /> View live site
            </a>
          </div>
        </Panel>
      </div>
    </AdminLayout>
  );
}
