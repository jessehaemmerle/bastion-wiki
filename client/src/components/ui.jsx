import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Icon, { PICKER_ICONS } from './Icon.jsx';
import { snippetParts, tagHue } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

export function Modal({ title, onClose, children, footer, size = '', icon }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3 className="row">{icon && <Icon name={icon} size={18} />} {title}</h3>
          <button className="btn ghost icon sm" onClick={onClose} aria-label={tr('Schließen')}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ title, message, confirmLabel = tr('Bestätigen'), danger, onConfirm, onClose, requireText }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      icon={danger ? 'alert-triangle' : 'help'}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tr('Abbrechen')}</button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            disabled={busy || (requireText && text !== requireText)}
            onClick={async () => {
              setBusy(true);
              setError(null);
              // A failed action keeps the dialog open and says why, instead of failing silently
              try { await onConfirm(); onClose(); } catch (e) { setError(e?.message || tr('Fehler')); } finally { setBusy(false); }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{message}</div>
      {error && <div className="error-box" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      {requireText && (
        <div className="field">
          <label>{tr('Zur Bestätigung')} <code className="mono">{requireText}</code> {tr('eingeben')}</label>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
      )}
    </Modal>
  );
}

export function Dropdown({ trigger, children, align = 'right', up = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`menu ${align === 'left' ? 'left' : ''} ${up ? 'up' : ''}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, shortcut, to, href }) {
  const inner = (
    <>
      {icon && <Icon name={icon} size={15} />}
      <span>{children}</span>
      {shortcut && <span className="shortcut">{shortcut}</span>}
    </>
  );
  if (to) return <Link to={to} className={`menu-item ${danger ? 'danger' : ''}`}>{inner}</Link>;
  if (href) return <a href={href} className={`menu-item ${danger ? 'danger' : ''}`}>{inner}</a>;
  return <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>{inner}</button>;
}

export function TagPill({ name, color, count, onRemove, link = true }) {
  const custom = color && color !== '#64748b';
  const style = custom ? { '--tc': color } : { '--h': tagHue(name) };
  const content = (
    <>
      <span className="hash">#</span>{name}
      {count != null && <span className="n">{count}</span>}
      {onRemove && (
        <button type="button" onClick={(e) => { e.preventDefault(); onRemove(); }} aria-label={tr('{name} entfernen', { name })}>
          <Icon name="x" size={12} />
        </button>
      )}
    </>
  );
  if (!link || onRemove) return <span className={`tag-pill ${custom ? 'custom' : ''}`} style={style}>{content}</span>;
  return <Link to={`/tags/${encodeURIComponent(name)}`} className={`tag-pill ${custom ? 'custom' : ''}`} style={style}>{content}</Link>;
}

export function Avatar({ name = '?', size = 30 }) {
  const hue = tagHue(name);
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?';
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${hue} 70% 50%), hsl(${(hue + 40) % 360} 70% 42%))` }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function Empty({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ center }) {
  return center ? <div className="loading-screen"><div className="spinner" /></div> : <div className="spinner" />;
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="row" style={{ cursor: 'pointer', gap: 10 }}>
      <span className="switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function IconPicker({ value, onChange, icons = PICKER_ICONS }) {
  return (
    <div className="icon-grid">
      {icons.map((n) => (
        <button type="button" key={n} className={value === n ? 'active' : ''} onClick={() => onChange(n)} title={n}>
          <Icon name={n} size={17} />
        </button>
      ))}
    </div>
  );
}

export const SPACE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#64748b'];

export function ColorPicker({ value, onChange, colors = SPACE_COLORS, allowCustom = true }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button type="button" key={c} className={`swatch ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      {allowCustom && (
        <label className="swatch" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)', position: 'relative', overflow: 'hidden' }} title={tr('Eigene Farbe')}>
          <input type="color" value={value || '#6366f1'} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
        </label>
      )}
    </div>
  );
}

/** Copies text and briefly shows a check mark */
export function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, key = true) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1400);
  };
  return [copied, copy];
}

/** Renders a search snippet with highlighted hits */
export function Snippet({ text, className }) {
  return (
    <div className={className}>
      {snippetParts(text).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </div>
  );
}
