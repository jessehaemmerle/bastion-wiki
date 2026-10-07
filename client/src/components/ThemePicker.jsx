import { THEMES } from '../lib/theme.js';
import Icon from './Icon.jsx';
import { tr } from '../lib/i18n.js';

export function ThemeGrid({ value, onChange, mode = 'dark' }) {
  return (
    <div className="theme-grid">
      {THEMES.map((t) => {
        const [bg, surface, accent, accent2] = t[mode === 'light' ? 'light' : 'dark'];
        return (
          <button key={t.id} type="button" className={`theme-card ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
            <div className="theme-preview" style={{ background: bg }}>
              <div className="tp-rail" style={{ background: surface }}>
                <i style={{ background: accent }} /><i style={{ background: accent2, opacity: 0.7 }} /><i style={{ background: accent, opacity: 0.35 }} />
              </div>
              <div className="tp-main">
                <i style={{ width: '60%', background: accent }} />
                <i style={{ width: '90%', background: surface }} />
                <i style={{ width: '75%', background: surface }} />
                <i style={{ width: '40%', background: accent2 }} />
              </div>
            </div>
            <div className="tc-name">
              <span>{t.name}</span>
              {value === t.id ? <Icon name="check-circle" size={15} style={{ color: 'var(--accent)' }} /> : <span className="faint tiny">{tr(t.desc)}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ModeSwitch({ value, onChange }) {
  return (
    <div className="segmented">
      {[['light', 'sun', tr('Hell')], ['dark', 'moon', tr('Dunkel')], ['system', 'monitor', tr('System')]].map(([m, icon, label]) => (
        <button key={m} type="button" className={value === m ? 'active' : ''} onClick={() => onChange(m)}>
          <Icon name={icon} size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
