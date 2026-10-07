import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { tr } from '../lib/i18n.js';

const storeKey = (pageId) => `bastion.vars.${pageId}`;

/** Default values: matching data-sheet fields of the page (case-insensitive) */
function defaultsFor(names, properties) {
  const props = Object.entries(properties || {});
  const out = {};
  for (const n of names) {
    const hit = props.find(([k]) => k.toLowerCase() === n.toLowerCase());
    if (hit) out[n] = hit[1];
  }
  return out;
}

/**
 * Fill-in fields for {{placeholders}} used in the page's code blocks.
 * Values stay in this browser only and are applied to display and copy.
 */
export default function Variables({ names, pageId, properties, value, onChange }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(storeKey(pageId)) || '{}'); } catch { /* ignore */ }
    onChange({ ...defaultsFor(names, properties), ...stored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, names.join('|')]);

  if (!names.length) return null;
  const set = (n, v) => {
    const next = { ...value, [n]: v };
    onChange(next);
    try {
      const own = Object.fromEntries(Object.entries(next).filter(([k, x]) => x && x !== defaultsFor([k], properties)[k]));
      localStorage.setItem(storeKey(pageId), JSON.stringify(own));
    } catch { /* ignore */ }
  };
  const reset = () => {
    try { localStorage.removeItem(storeKey(pageId)); } catch { /* ignore */ }
    onChange(defaultsFor(names, properties));
  };
  const filled = names.filter((n) => value?.[n]).length;

  return (
    <section className="vars" aria-label={tr('Platzhalter in Befehlen')}>
      <button type="button" className="vars-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="variable" size={15} />
        <span className="grow">{tr('Platzhalter in Befehlen')}</span>
        <span className="faint small mono">{filled}/{names.length}</span>
        <Icon name="chevron-down" size={14} className={open ? '' : 'rot'} />
      </button>
      {open && (
        <div className="vars-body">
          <div className="vars-grid">
            {names.map((n) => (
              <label key={n} className="vars-field">
                <span className="mono">{`{{${n}}}`}</span>
                <input className="input sm mono" value={value?.[n] || ''} placeholder={n} onChange={(e) => set(n, e.target.value)} spellCheck={false} />
              </label>
            ))}
          </div>
          <div className="row between small faint" style={{ marginTop: 8 }}>
            <span>{tr('Werte werden in die Codeblöcke eingesetzt und nur in diesem Browser gespeichert.')}</span>
            <button type="button" className="link-btn" onClick={reset}>{tr('Zurücksetzen')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
