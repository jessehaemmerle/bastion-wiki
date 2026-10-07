import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { TagPill } from './ui.jsx';
import { api } from '../lib/api.js';

export function TagInput({ value, onChange }) {
  const [text, setText] = useState('');
  const [all, setAll] = useState([]);
  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState(false);
  useEffect(() => { api.get('/tags').then((d) => setAll(d.tags)).catch(() => {}); }, []);
  const norm = (t) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
  const suggestions = useMemo(() => {
    const q = norm(text);
    return all.filter((t) => !value.includes(t.name) && (!q || t.name.includes(q))).slice(0, 8);
  }, [all, text, value]);
  const add = (t) => {
    const n = norm(t);
    if (n && !value.includes(n)) onChange([...value, n]);
    setText('');
    setActive(0);
  };
  return (
    <div className="tag-input" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
      {value.map((t) => <TagPill key={t} name={t} onRemove={() => onChange(value.filter((x) => x !== t))} />)}
      <input
        value={text}
        placeholder={value.length ? '' : 'Tags hinzufügen … (Enter)'}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onChange={(e) => { setText(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
            if (!text && e.key === 'Tab') return;
            e.preventDefault();
            add(suggestions[active] && text && suggestions[active].name.startsWith(norm(text)) ? suggestions[active].name : text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        }}
      />
      {focus && suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((t, i) => (
            <button key={t.name} type="button" className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); add(t.name); }}>
              <Icon name="hash" size={13} /> <span className="mono">{t.name}</span> <span className="faint tiny" style={{ marginLeft: 'auto' }}>{t.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PropertiesEditor({ value, onChange }) {
  const rows = Object.entries(value);
  const update = (i, k, v) => {
    const next = rows.map((r, j) => (j === i ? [k, v] : r));
    onChange(Object.fromEntries(next));
  };
  return (
    <div className="props-editor">
      {rows.map(([k, v], i) => (
        <div className="props-row" key={i}>
          <input className="input" value={k} placeholder="Feld (z. B. IP-Adresse)" onChange={(e) => update(i, e.target.value, v)} />
          <input className="input" value={v} placeholder="Wert" onChange={(e) => update(i, k, e.target.value)} />
          <button type="button" className="btn ghost icon" onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))} aria-label="Entfernen"><Icon name="x" size={15} /></button>
        </div>
      ))}
      <div className="row wrap">
        <button type="button" className="btn sm" onClick={() => onChange({ ...value, [`Feld ${rows.length + 1}`]: '' })}><Icon name="plus" size={14} /> Eigenschaft</button>
        {['Hostname', 'IP-Adresse', 'Verantwortlich', 'Umgebung'].filter((k) => !(k in value)).map((k) => (
          <button type="button" key={k} className="btn sm ghost" onClick={() => onChange({ ...value, [k]: '' })}>+ {k}</button>
        ))}
      </div>
    </div>
  );
}

