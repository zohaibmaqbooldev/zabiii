import { useState, type FormEvent } from 'react';
import { Icon, platformIcon } from '../components/Icon';
import { Reveal } from '../components/ui';
import { usePortfolio, useProfile } from '../lib/portfolio';
import { isValidEmail, prettyHost, safeUrl, telLink, whatsappLink } from '../lib/utils';
import { SectionHead } from './SectionHead';
import { useIndex } from './Experience';

interface Row {
  icon: string;
  label: string;
  value: string;
  href: string | null;
  external?: boolean;
}

export function Contact() {
  const p = useProfile();
  const { data } = usePortfolio();
  const wa = whatsappLink(p.whatsapp);

  const rows: Row[] = [
    p.email && { icon: 'mail', label: 'Email', value: p.email, href: `mailto:${p.email}` },
    p.phone && { icon: 'phone', label: 'Phone', value: p.phone, href: telLink(p.phone) },
    wa && { icon: 'whatsapp', label: 'WhatsApp', value: p.whatsapp!, href: wa, external: true },
    { icon: 'pin', label: 'Location', value: p.location, href: null },
    p.github && { icon: 'github', label: 'GitHub', value: prettyHost(p.github), href: p.github, external: true },
    p.linkedin && { icon: 'linkedin', label: 'LinkedIn', value: prettyHost(p.linkedin), href: p.linkedin, external: true },
    p.website && { icon: 'globe', label: 'Website', value: prettyHost(p.website), href: p.website, external: true },
  ].filter(Boolean) as Row[];

  // extra platforms managed under Social Links (GitHub/LinkedIn already shown above)
  const shown = new Set(rows.map((r) => r.label.toLowerCase()));
  data.socials.forEach((s) => {
    const url = safeUrl(s.url);
    if (!url || shown.has(s.platform.toLowerCase())) return;
    shown.add(s.platform.toLowerCase());
    rows.push({ icon: platformIcon(s.platform, s.icon), label: s.platform, value: prettyHost(url), href: url, external: true });
  });

  return (
    <section id="contact" className="section contact" aria-labelledby="contact-title">
      <div className="contact__glow" aria-hidden="true" />
      <div className="container">
        <SectionHead
          index={useIndex(7)}
          label="Contact"
          id="contact-title"
          title={
            <>
              Let's build something <span className="serif accent">meaningful.</span>
            </>
          }
        />

        <div className="contact__grid">
          <Reveal className="contact__list">
            <ul>
              {rows.map((r) => {
                const inner = (
                  <>
                    <span className="contact-row__icon">
                      <Icon name={r.icon} size={17} />
                    </span>
                    <span className="contact-row__label mono">{r.label}</span>
                    <span className="contact-row__value">{r.value}</span>
                    {r.href && <Icon name={r.external ? 'arrow-up-right' : 'arrow'} size={17} className="contact-row__arrow" />}
                  </>
                );
                return (
                  <li key={r.label}>
                    {r.href ? (
                      <a className="contact-row" href={r.href} {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        {inner}
                      </a>
                    ) : (
                      <div className="contact-row contact-row--static">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Reveal>

          <Reveal className="contact__form-wrap" delay={100}>
            <ContactForm email={p.email} whatsapp={wa} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactForm({ email, whatsapp }: { email: string | null; whatsapp: string | null }) {
  const [form, setForm] = useState({ name: '', from: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (form.name.trim().length < 2) er.name = 'Please enter your name.';
    if (!isValidEmail(form.from)) er.from = 'Please enter a valid email address.';
    if (form.message.trim().length < 10) er.message = 'Please write at least a sentence.';
    setErrors(er);
    if (Object.keys(er).length || !email) return;
    const subject = `Portfolio enquiry from ${form.name.trim()}`;
    const body = `${form.message.trim()}\n\n— ${form.name.trim()}\n${form.from.trim()}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <form className="contact-form" onSubmit={submit} noValidate aria-describedby="form-note">
      <div className="contact-form__head">
        <p className="mono">Send a message</p>
      </div>
      <div className="field">
        <label htmlFor="cf-name">Your name</label>
        <input id="cf-name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'cf-name-err' : undefined} maxLength={80} />
        {errors.name && <p className="field__error" id="cf-name-err">{errors.name}</p>}
      </div>
      <div className="field">
        <label htmlFor="cf-email">Your email</label>
        <input id="cf-email" type="email" autoComplete="email" inputMode="email" value={form.from} onChange={set('from')} aria-invalid={Boolean(errors.from)} aria-describedby={errors.from ? 'cf-email-err' : undefined} maxLength={120} />
        {errors.from && <p className="field__error" id="cf-email-err">{errors.from}</p>}
      </div>
      <div className="field">
        <label htmlFor="cf-msg">Message</label>
        <textarea id="cf-msg" rows={5} value={form.message} onChange={set('message')} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? 'cf-msg-err' : undefined} maxLength={3000} />
        {errors.message && <p className="field__error" id="cf-msg-err">{errors.message}</p>}
      </div>
      <button className="btn btn--primary contact-form__submit" type="submit" disabled={!email}>
        <Icon name="send" size={16} /> Compose email
      </button>
      <p className="contact-form__note" id="form-note">
        {!email
          ? whatsapp
            ? 'Email isn’t set up yet — please reach out on WhatsApp instead.'
            : 'Contact details are being added — please check back soon.'
          : opened
            ? 'Your email app should have opened with the message ready to send.'
            : 'This opens your own email app with the message filled in — nothing is stored on this site.'}
      </p>
    </form>
  );
}

export function WhatsAppFab() {
  const p = useProfile();
  const wa = whatsappLink(p.whatsapp); // e.g. https://wa.me/923456300129 — number comes from Supabase
  if (!wa) return null;
  return (
    <a className="wa-fab" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp (opens in a new tab)">
      <Icon name="whatsapp" size={24} />
    </a>
  );
}
