import { lazy, Suspense } from 'react';
import { ToastProvider } from './components/ui';
import { match, RouterProvider, useRouter } from './lib/router';
import { PortfolioProvider } from './lib/portfolio';
import { SiteApp } from './site/SiteApp';

// The CMS is a separate chunk: visitors never download admin code.
const AdminApp = lazy(() => import('./admin/AdminApp'));

function Routes() {
  const { path } = useRouter();
  if (path === '/admin' || path.startsWith('/admin/')) {
    return (
      <Suspense fallback={<div className="admin-boot" aria-busy="true" />}>
        <AdminApp />
      </Suspense>
    );
  }
  const project = match('/projects/:slug', path);
  const route = path === '/' || path === '' ? { name: 'home' as const } : project ? { name: 'project' as const, slug: project.slug } : { name: 'notfound' as const };
  return (
    <PortfolioProvider>
      <SiteApp route={route} />
    </PortfolioProvider>
  );
}

export function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </RouterProvider>
  );
}
