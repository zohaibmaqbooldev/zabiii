import { Icon, platformIcon } from '../components/Icon';
import { admin } from '../lib/api';
import type { SocialLink } from '../lib/types';
import { isValidHttpUrl, prettyHost } from '../lib/utils';
import { CollectionAdmin } from './Collection';
import { Field, TextInput, Toggle } from './fields';

interface F {
  platform: string;
  url: string;
  icon: string;
  visible: boolean;
}

const PLATFORMS = ['GitHub', 'LinkedIn', 'Facebook', 'Instagram', 'YouTube', 'TikTok', 'X', 'Email', 'WhatsApp', 'Website', 'Other'];

export function SocialAdmin() {
  return (
    <CollectionAdmin<SocialLink, F>
      title="Social Links"
      table="social_links"
      noun="Link"
      searchText={(s) => `${s.platform} ${s.url}`}
      load={admin.socials}
      itemName={(s) => s.platform}
      intro={
        <p className="muted intro">
          GitHub and LinkedIn set in <strong>Profile</strong> take priority in the header; any other platforms here appear in Contact and the footer.
        </p>
      }
      empty={{ icon: 'share', title: 'No social links yet.', text: 'Add GitHub, LinkedIn or any other profile you want visitors to find.' }}
      blank={() => ({ platform: 'GitHub', url: '', icon: '', visible: true })}
      toForm={(s) => ({ platform: s.platform || '', url: s.url || '', icon: s.icon || '', visible: s.visible !== false })}
      validate={(f) => {
        const e: Partial<Record<keyof F, string>> = {};
        if (!f.platform.trim()) e.platform = 'Platform is required.';
        if (!f.url.trim()) e.url = 'URL is required.';
        else if (!isValidHttpUrl(f.url) && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(f.url.trim())) e.url = 'Enter a full URL starting with https:// (or mailto:you@example.com for email)';
        return e;
      }}
      toPayload={(f) => ({ platform: f.platform.trim(), url: f.url.trim(), icon: f.icon.trim() || platformIcon(f.platform), visible: f.visible })}
      renderRow={(s) => (
        <div className="crow__with-icon">
          <span className="crow__icon">
            <Icon name={platformIcon(s.platform, s.icon)} size={17} />
          </span>
          <div className="crow__text">
            <strong>{s.platform}</strong>
            <small>{prettyHost(s.url)}</small>
          </div>
        </div>
      )}
      renderForm={({ form, set, errors }) => (
        <>
          <Field label="Platform" htmlFor="sl-platform" error={errors.platform} required>
            <input id="sl-platform" className="ainput" list="sl-list" value={form.platform} onChange={(e) => set('platform', e.target.value)} maxLength={40} />
            <datalist id="sl-list">
              {PLATFORMS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="URL" htmlFor="sl-url" error={errors.url} required>
            <TextInput id="sl-url" type="url" inputMode="url" value={form.url} onChange={(v) => set('url', v)} placeholder="https://…" error={errors.url} autoFocus />
          </Field>
          <Field label="Icon" htmlFor="sl-icon" hint="Leave empty to pick automatically from the platform.">
            <div className="icon-preview">
              <span className="crow__icon">
                <Icon name={platformIcon(form.platform, form.icon)} size={17} />
              </span>
              <TextInput id="sl-icon" value={form.icon} onChange={(v) => set('icon', v)} maxLength={20} placeholder="github, linkedin, instagram…" />
            </div>
          </Field>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible on site" />
        </>
      )}
    />
  );
}
