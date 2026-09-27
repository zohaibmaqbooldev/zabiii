import { useEffect, useState } from 'react';
import { cx } from '../lib/utils';
import { SUPABASE_URL } from '../lib/supabase';

/**
 * Responsive image with a skeleton while loading and a designed fallback when
 * the image is missing or broken — never a broken-image icon, never layout shift.
 */

const BUILT_IN: Record<string, number[]> = {
  profile: [480, 720, 928],
  'project-dashboard': [640, 1024, 1376],
  'project-ai-workspace': [640, 1024, 1376],
};

export function srcSetFor(src: string): string | undefined {
  const local = src.match(/^\/images\/([a-z-]+)-(\d+)\.webp$/);
  if (local && BUILT_IN[local[1]]) return BUILT_IN[local[1]].map((w) => `/images/${local[1]}-${w}.webp ${w}w`).join(', ');
  // our uploads always come as a large + small pair
  if (SUPABASE_URL && src.startsWith(SUPABASE_URL) && /-lg\.(webp|jpg)$/.test(src)) {
    const sm = src.replace(/-lg\.(webp|jpg)$/, '-sm.$1');
    const isPortrait = src.includes('/profile/');
    return `${sm} ${isPortrait ? 560 : 800}w, ${src} ${isPortrait ? 1100 : 1600}w`;
  }
  return undefined;
}

interface Props {
  src: string | null | undefined;
  alt: string;
  /** CSS aspect-ratio for the frame, e.g. "16 / 9". Omit to fill the parent. */
  ratio?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  fallbackLabel?: string;
  position?: string;
}

export function SmartImage({ src, alt, ratio, sizes = '100vw', priority, className, imgClassName, fallbackLabel, position }: Props) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');
  useEffect(() => setState(src ? 'loading' : 'error'), [src]);

  return (
    <div className={cx('smart-img', `is-${state}`, className)} style={ratio ? { aspectRatio: ratio } : undefined}>
      {src && state !== 'error' && (
        <img
          src={src}
          srcSet={srcSetFor(src)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          className={imgClassName}
          style={position ? { objectPosition: position } : undefined}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          ref={(el) => {
            // cached images can finish before React attaches onLoad
            if (el?.complete && el.naturalWidth > 0 && state === 'loading') setState('loaded');
          }}
        />
      )}
      {state === 'error' && (
        <div className="smart-img__fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined}>
          <svg viewBox="0 0 120 80" aria-hidden="true" className="smart-img__grid">
            <defs>
              <pattern id="g" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0H0V10" fill="none" stroke="currentColor" strokeWidth=".4" />
              </pattern>
            </defs>
            <rect width="120" height="80" fill="url(#g)" />
          </svg>
          <span className="smart-img__mark">ZM</span>
          {fallbackLabel && <span className="smart-img__label">{fallbackLabel}</span>}
        </div>
      )}
    </div>
  );
}
