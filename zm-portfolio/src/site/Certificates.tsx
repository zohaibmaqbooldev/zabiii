import { useState } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Dialog, EmptyState, Reveal, Skeleton } from '../components/ui';
import { usePortfolio } from '../lib/portfolio';
import type { Certificate } from '../lib/types';
import { formatDate, safeUrl } from '../lib/utils';
import { SectionHead } from './SectionHead';
import { useIndex } from './Experience';

export function Certificates() {
  const { data, status } = usePortfolio();
  const [view, setView] = useState<Certificate | null>(null);

  return (
    <section id="certificates" className="section certs" aria-labelledby="certs-title">
      <div className="container">
        <SectionHead
          index={useIndex(6)}
          label="Certificates"
          id="certs-title"
          title={
            <>
              Credentials &amp; <span className="serif accent">courses</span>
            </>
          }
        />

        {status === 'loading' && !data.certificates.length ? (
          <div className="cert-grid" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={260} />
            ))}
          </div>
        ) : data.certificates.length === 0 ? (
          <div className="certs__empty">
            <EmptyState
              icon="award"
              title="No certificates added yet."
              text="Certificates from courses and programmes will be shown here as they're earned."
            />
          </div>
        ) : (
          <ul className="cert-grid">
            {data.certificates.map((c, i) => {
              const url = safeUrl(c.credential_url);
              return (
                <Reveal as="li" key={c.id} className="cert" delay={(i % 3) * 70}>
                  <button className="cert__media" onClick={() => setView(c)} aria-label={`Enlarge certificate: ${c.title}`} disabled={!c.image}>
                    <SmartImage src={c.image} alt="" ratio="4 / 3" sizes="(max-width: 640px) 92vw, 30vw" fallbackLabel={c.issuer || 'Certificate'} />
                  </button>
                  <div className="cert__body">
                    <p className="mono cert__meta">
                      {c.issuer || 'Certificate'}
                      {c.issue_date && <> · {formatDate(c.issue_date)}</>}
                    </p>
                    <h3 className="cert__title">{c.title}</h3>
                    {url && (
                      <a className="cert__link" href={url} target="_blank" rel="noopener noreferrer">
                        View credential <Icon name="arrow-up-right" size={14} />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(view)} onClose={() => setView(null)} title={view?.title || 'Certificate'} size="lg" className="lightbox">
        {view && (
          <>
            <SmartImage src={view.image} alt={`${view.title} certificate`} className="lightbox__img" sizes="880px" fallbackLabel={view.title} />
            <p className="lightbox__meta mono">
              {[view.issuer, view.issue_date && formatDate(view.issue_date, { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · ')}
            </p>
          </>
        )}
      </Dialog>
    </section>
  );
}
