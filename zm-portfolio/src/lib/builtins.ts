/** The four images Zohaib provided, shipped optimised with the site. */
export const BUILT_IN_IMAGES = [
  { key: 'profile', label: 'Professional profile photo', url: '/images/profile-928.webp', small: '/images/profile-480.webp' },
  { key: 'logo', label: 'ZM logo mark', url: '/brand/zm-mark.webp', small: '/brand/zm-mark.webp' },
  { key: 'featured', label: 'Featured project image', url: '/images/project-dashboard-1376.webp', small: '/images/project-dashboard-640.webp' },
  { key: 'second', label: 'Second project image', url: '/images/project-ai-workspace-1376.webp', small: '/images/project-ai-workspace-640.webp' },
] as const;

export const isBuiltIn = (url: string | null | undefined) => Boolean(url && url.startsWith('/') && !url.startsWith('//'));
