import { Icon } from '../components/Icon';
import { Link } from '../lib/router';
import { usePortfolio } from '../lib/portfolio';
import { About } from './About';
import { Certificates } from './Certificates';
import { Contact, WhatsAppFab } from './Contact';
import { Education } from './Education';
import { Experience } from './Experience';
import { Footer } from './Footer';
import { Header } from './Header';
import { Hero } from './Hero';
import { ProjectPage } from './ProjectPage';
import { FeaturedProjects, ProjectArchive } from './Projects';
import { Marquee, Skills } from './Skills';

function LoadError() {
  const { status, data, reload } = usePortfolio();
  const empty = !data.projects.length && !data.skills.length;
  if (status !== 'error' || !empty) return null;
  return (
    <div className="container">
      <div className="load-error" role="alert">
        <Icon name="alert" size={18} />
        <p>We couldn't load the latest portfolio content right now. Please check your connection and try again.</p>
        <button className="btn btn--ghost btn--sm" onClick={reload}>
          <Icon name="refresh" size={15} /> Retry
        </button>
      </div>
    </div>
  );
}

function Home() {
  return (
    <main id="main">
      <Hero />
      <Marquee />
      <LoadError />
      <About />
      <Skills />
      <FeaturedProjects />
      <ProjectArchive />
      <Experience />
      <Education />
      <Certificates />
      <Contact />
    </main>
  );
}

function NotFound() {
  return (
    <main id="main" className="not-found container">
      <p className="mono">Error 404</p>
      <h1>This page doesn't exist.</h1>
      <p>The link may be broken or the page may have moved.</p>
      <Link to="/" className="btn btn--primary">
        <Icon name="arrow-left" size={16} /> Back home
      </Link>
    </main>
  );
}

export function SiteApp({ route }: { route: { name: 'home' } | { name: 'project'; slug: string } | { name: 'notfound' } }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      {route.name === 'home' && <Home />}
      {route.name === 'project' && <ProjectPage key={route.slug} slug={route.slug} />}
      {route.name === 'notfound' && <NotFound />}
      <Footer />
      <WhatsAppFab />
    </>
  );
}
