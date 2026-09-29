import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent, type DragEvent } from 'react';
import { Icon } from '../components/Icon';
import { SmartImage } from '../components/SmartImage';
import { Dialog, Spinner, useToast } from '../components/ui';
import { uploadImage, type UploadedImage } from '../lib/api';
import { BUILT_IN_IMAGES } from '../lib/builtins';
import { ACCEPT_ATTR, validateImage, type ImageKind } from '../lib/image';
import { publicUrl, storage, type StorageObject } from '../lib/supabase';
import { cx } from '../lib/utils';
import { AiAssist, type AiSpec } from './AiAssist';

// --------------------------------------------------------------- Field ---

export function Field({ label, hint, error, children, htmlFor, required, className }: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('afield', error && 'has-error', className)}>
      <label htmlFor={htmlFor} className="afield__label">
        {label}
        {required && <span className="afield__req" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="afield__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="afield__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ id, value, onChange, error, ...rest }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric';
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      className="ainput"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={Boolean(error)}
      {...rest}
    />
  );
}

export function TextArea({ id, value, onChange, rows = 4, maxLength, placeholder, error, ai }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  error?: string;
  /** adds the admin-only "Write with AI / Improve" helper */
  ai?: AiSpec;
}) {
  return (
    <>
      <div className="atextarea">
        <textarea
          id={id}
          className="ainput"
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {maxLength && (
          <span className={cx('atextarea__count', value.length > maxLength * 0.9 && 'is-near')}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      {ai && <AiAssist spec={ai} value={value} onChange={onChange} maxLength={maxLength} />}
    </>
  );
}

export function Toggle({ checked, onChange, label, description, id }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  const auto = useId();
  const tid = id || auto;
  return (
    <div className="atoggle">
      <button
        id={tid}
        type="button"
        role="switch"
        aria-checked={checked}
        className={cx('switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <label htmlFor={tid} className="atoggle__text">
        <span className="atoggle__label">{label}</span>
        {description && <span className="atoggle__desc">{description}</span>}
      </label>
    </div>
  );
}

// ------------------------------------------------------------ TagInput ---

export function TagInput({ id, value, onChange, suggestions = [], placeholder, max = 20 }: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  max?: number;
}) {
  const [text, setText] = useState('');
  const listId = `${id}-list`;
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 40));
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((p) => {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    });
    onChange(next);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag-input__tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} aria-label={`Remove ${t}`}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // choosing from the datalist fires a change with the full value
          if (suggestions.includes(v)) add(v);
          else setText(v);
        }}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

// ---------------------------------------------------------- ImageField ---

/**
 * Drag-and-drop / click to upload. The file is validated, optimised to WebP and
 * uploaded immediately (with progress); the parent receives the stored URL.
 */
export function ImageField({ value, onChange, folder, kind, label = 'Image', ratio = '16 / 10', allowLibrary = true, onUploaded }: {
  value: string | null;
  onChange: (img: UploadedImage | null) => void;
  folder: string;
  kind: ImageKind;
  label?: string;
  ratio?: string;
  allowLibrary?: boolean;
  /** called for every new upload so the parent can clean up if the form is cancelled */
  onUploaded?: (img: UploadedImage) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const err = validateImage(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const img = await uploadImage(file, folder, kind, setProgress);
      onUploaded?.(img);
      onChange(img);
      toast('Image uploaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="imgfield">
      <div
        className={cx('dropzone', drag && 'is-drag', value && 'has-image', progress !== null && 'is-busy')}
        style={{ aspectRatio: ratio }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {value ? (
          <SmartImage src={value} alt={`${label} preview`} className="dropzone__preview" sizes="480px" fallbackLabel="Image unavailable" />
        ) : (
          <div className="dropzone__empty">
            <Icon name="upload" size={22} />
            <p>
              <strong>Drop an image here</strong> or click to browse
            </p>
            <p className="dropzone__sub">JPG, PNG, WebP, AVIF or GIF · up to 10 MB · optimised automatically</p>
          </div>
        )}
        <button type="button" className="dropzone__hit" onClick={() => input.current?.click()} aria-label={value ? `Replace ${label}` : `Upload ${label}`} disabled={progress !== null} />
        {progress !== null && (
          <div className="dropzone__progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <Spinner size={18} />
            <span>Uploading… {progress}%</span>
            <div className="bar">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <input ref={input} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
      <div className="imgfield__actions">
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => input.current?.click()} disabled={progress !== null}>
          <Icon name="upload" size={14} /> {value ? 'Replace' : 'Upload'}
        </button>
        {allowLibrary && (
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => setPicker(true)} disabled={progress !== null}>
            <Icon name="grid" size={14} /> Choose from library
          </button>
        )}
        {value && (
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => onChange(null)} disabled={progress !== null}>
            <Icon name="close" size={14} /> Remove
          </button>
        )}
      </div>
      {error && (
        <p className="afield__error" role="alert">
          {error}
        </p>
      )}
      {allowLibrary && (
        <MediaPicker
          open={picker}
          onClose={() => setPicker(false)}
          onPick={(url, path) => {
            onChange({ url, path: path || '' });
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------- MediaPicker ---

const FOLDERS = ['projects', 'profile', 'brand', 'certificates', 'media', 'provided'];

export async function listAllMedia(): Promise<{ path: string; url: string; obj: StorageObject }[]> {
  const lists = await Promise.all(FOLDERS.map((f) => storage.list(f).then((l) => l.map((o) => ({ o, f })))));
  return lists
    .flat()
    .filter(({ o }) => o.id && !/-sm\.(webp|jpg|gif)$/.test(o.name))
    .map(({ o, f }) => ({ path: `${f}/${o.name}`, url: publicUrl(`${f}/${o.name}`), obj: o }));
}

export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string, path: string | null) => void }) {
  const [items, setItems] = useState<{ path: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    listAllMedia()
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Choose an image" size="lg">
      <p className="picker__group mono">Uploaded to Supabase Storage</p>
      {error && <p className="afield__error">{error}</p>}
      {!items && !error && (
        <div className="picker__loading">
          <Spinner /> Loading media…
        </div>
      )}
      {items && items.length === 0 && <p className="muted">No uploads yet.</p>}
      {items && items.length > 0 && (
        <div className="picker">
          {items.map((m) => (
            <button type="button" key={m.path} className="picker__item" onClick={() => onPick(m.url, m.path)}>
              <SmartImage src={m.url} alt="" ratio="4 / 3" sizes="200px" />
              <span className="picker__name">{m.path.split('/').pop()}</span>
            </button>
          ))}
        </div>
      )}
      <p className="picker__group mono">Provided with the site</p>
      <div className="picker">
        {BUILT_IN_IMAGES.map((b) => (
          <button type="button" key={b.key} className="picker__item" onClick={() => onPick(b.url, null)}>
            <SmartImage src={b.url} alt="" ratio="4 / 3" sizes="200px" className={b.key === 'logo' ? 'is-contain' : ''} />
            <span className="picker__name">{b.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
