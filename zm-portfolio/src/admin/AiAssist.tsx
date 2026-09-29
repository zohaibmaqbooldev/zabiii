import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { aiWrite, type AiContext, type AiTask } from '../lib/ai';

export interface AiSpec {
  task: AiTask;
  /** Facts from the rest of the form, read at click time. */
  context?: () => AiContext;
}

/**
 * "Write with AI" / "Improve" helper shown under a text area.
 * It never runs on its own: every request is a click, and the suggestion is
 * only put into the field when the admin presses "Use this".
 */
export function AiAssist({ spec, value, onChange, maxLength }: {
  spec: AiSpec;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const [busy, setBusy] = useState<null | 'generate' | 'improve'>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<'generate' | 'improve'>('generate');
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async (mode: 'generate' | 'improve') => {
    if (busy) return;
    last.current = mode;
    const text = value.trim();
    if (mode === 'improve' && !text) {
      setError('Write some text first, then ask the AI to improve it.');
      return;
    }
    const context = spec.context?.() ?? {};
    const hasContext = Object.values(context).some((v) => v && v.trim());
    if (mode === 'generate' && !text && !hasContext) {
      setError('Add a few details first (for example a title) so the AI has something to work with.');
      return;
    }
    setBusy(mode);
    setError(null);
    setResult(null);
    ctrl.current = new AbortController();
    try {
      const out = await aiWrite({ task: spec.task, mode, text: text.slice(0, 4000), context }, ctrl.current.signal);
      setResult(maxLength ? out.slice(0, maxLength) : out);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'cancelled') setError(e instanceof Error ? e.message : 'The AI assistant is unavailable right now.');
    } finally {
      setBusy(null);
      ctrl.current = null;
    }
  };

  return (
    <div className="ai-assist" data-busy={busy ? 'true' : undefined}>
      <div className="ai-assist__bar">
        <button type="button" className="btn btn--ghost btn--xs ai-assist__btn" onClick={() => run('generate')} disabled={Boolean(busy)}>
          <Icon name="sparkle" size={14} /> {value.trim() ? 'Rewrite with AI' : 'Write with AI'}
        </button>
        <button type="button" className="btn btn--ghost btn--xs ai-assist__btn" onClick={() => run('improve')} disabled={Boolean(busy) || !value.trim()}>
          <Icon name="edit" size={14} /> Improve
        </button>
        {busy && (
          <>
            <span className="ai-assist__status" role="status">
              <Spinner size={14} /> {busy === 'improve' ? 'Improving…' : 'Writing…'}
            </span>
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => ctrl.current?.abort()}>
              Cancel
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="afield__error ai-assist__error" role="alert">
          {error}{' '}
          <button type="button" className="linkbtn" onClick={() => run(last.current)}>
            Try again
          </button>
        </p>
      )}
      {result && (
        <div className="ai-assist__result" role="region" aria-label="AI suggestion">
          <p className="ai-assist__label mono">AI suggestion — review before using</p>
          <p className="ai-assist__text">{result}</p>
          <div className="ai-assist__actions">
            <button
              type="button"
              className="btn btn--blue btn--xs"
              onClick={() => {
                onChange(result);
                setResult(null);
              }}
            >
              <Icon name="check" size={14} /> Use this
            </button>
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => run(last.current)}>
              <Icon name="refresh" size={14} /> Try again
            </button>
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
