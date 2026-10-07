import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { ColorPicker, IconPicker, Modal, Spinner } from './ui.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { ACCESS_LABELS } from '../lib/format.js';
import { slugify } from '../lib/slug.js';

export function SpaceFormModal({ space, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({
    name: space?.name || '',
    key: space?.key || '',
    description: space?.description || '',
    icon: space?.icon || 'folder',
    color: space?.color || '#6366f1',
    defaultAccess: space?.defaultAccess || 'read',
  });
  const [keyTouched, setKeyTouched] = useState(Boolean(space));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const res = space ? await api.patch(`/spaces/${space.id}`, f) : await api.post('/spaces', f);
      toast(space ? 'Bereich gespeichert' : 'Bereich angelegt');
      onSaved?.(res.space);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={space ? 'Bereich bearbeiten' : 'Neuer Bereich'}
      icon="grid"
      onClose={onClose}
      size="lg"
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy || !f.name || !f.key} onClick={save}><Icon name="save" /> Speichern</button></>}
    >
      <form onSubmit={save} className="col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <span className="space-chip" style={{ '--sc': f.color, width: 54, height: 54, borderRadius: 14 }}><Icon name={f.icon} size={24} /></span>
          <div className="form-grid grow">
            <div className="field">
              <label>Name</label>
              <input className="input" value={f.name} autoFocus required maxLength={80}
                onChange={(e) => { set('name', e.target.value); if (!keyTouched) set('key', slugify(e.target.value).slice(0, 30)); }} />
            </div>
            <div className="field">
              <label>Schlüssel (URL)</label>
              <input className="input mono" value={f.key} required pattern="[a-z0-9][a-z0-9-]{1,30}"
                onChange={(e) => { setKeyTouched(true); set('key', e.target.value.toLowerCase()); }} />
              <span className="hint">/s/{f.key || 'schluessel'}</span>
            </div>
          </div>
        </div>
        <div className="field">
          <label>Beschreibung</label>
          <textarea className="textarea" rows={2} value={f.description} maxLength={500} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="field"><label>Farbe</label><ColorPicker value={f.color} onChange={(c) => set('color', c)} /></div>
        <div className="field"><label>Symbol</label><IconPicker value={f.icon} onChange={(i) => set('icon', i)} /></div>
        <div className="field">
          <label>Standardzugriff für alle angemeldeten Nutzer</label>
          <div className="segmented">
            {['none', 'read', 'write'].map((a) => (
              <button type="button" key={a} className={f.defaultAccess === a ? 'active' : ''} onClick={() => set('defaultAccess', a)}>
                <Icon name={a === 'none' ? 'lock' : a === 'read' ? 'eye' : 'pen'} size={14} /> {ACCESS_LABELS[a]}
              </button>
            ))}
          </div>
          <span className="hint">Feinere Rechte für Gruppen und Personen vergibst du unter „Berechtigungen“.</span>
        </div>
      </form>
    </Modal>
  );
}

export function PermissionsModal({ space, onClose }) {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [dir, setDir] = useState({ users: [], groups: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/spaces/${space.id}/permissions`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [space.id, toast]);

  useEffect(() => {
    const t = setTimeout(() => api.get(`/directory${qs({ q })}`).then(setDir).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);

  if (!data) return <Modal title="Berechtigungen" onClose={onClose}><Spinner /></Modal>;

  const has = (type, id) => data.permissions.some((p) => p.principalType === type && p.principalId === id);
  const add = (type, item) => {
    if (has(type, item.id)) return;
    setData({ ...data, permissions: [...data.permissions, { principalType: type, principalId: item.id, level: 'read', name: type === 'user' ? item.displayName : item.name, username: item.username }] });
  };
  const update = (i, level) => setData({ ...data, permissions: data.permissions.map((p, j) => (j === i ? { ...p, level } : p)) });
  const remove = (i) => setData({ ...data, permissions: data.permissions.filter((_, j) => j !== i) });

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/spaces/${space.id}/permissions`, { defaultAccess: data.defaultAccess, permissions: data.permissions });
      toast('Berechtigungen gespeichert');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Berechtigungen für ${space.name}`}
      icon="shield"
      size="lg"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={busy} onClick={save}><Icon name="save" /> Speichern</button></>}
    >
      <div className="field">
        <label>Standardzugriff (alle angemeldeten Nutzer)</label>
        <div className="segmented">
          {['none', 'read', 'write'].map((a) => (
            <button key={a} className={data.defaultAccess === a ? 'active' : ''} onClick={() => setData({ ...data, defaultAccess: a })}>{ACCESS_LABELS[a]}</button>
          ))}
        </div>
        <span className="hint">Administratoren haben immer Vollzugriff. Betrachter (Rolle) können höchstens lesen.</span>
      </div>

      <div className="card">
        <table className="data">
          <thead><tr><th>Wer</th><th>Stufe</th><th /></tr></thead>
          <tbody>
            {data.permissions.length === 0 && <tr><td colSpan={3} className="faint">Keine expliziten Berechtigungen.</td></tr>}
            {data.permissions.map((p, i) => (
              <tr key={`${p.principalType}${p.principalId}`}>
                <td>
                  <div className="row">
                    <Icon name={p.principalType === 'group' ? 'users' : 'user'} size={15} />
                    <strong>{p.name}</strong>
                    {p.username && <span className="faint mono tiny">@{p.username}</span>}
                    {p.principalType === 'group' && <span className="badge">Gruppe</span>}
                  </div>
                </td>
                <td>
                  <select className="select sm" value={p.level} onChange={(e) => update(i, e.target.value)} style={{ width: 150 }}>
                    <option value="read">Lesen</option>
                    <option value="write">Schreiben</option>
                    <option value="admin">Verwalten</option>
                  </select>
                </td>
                <td className="actions"><button className="btn ghost icon sm" onClick={() => remove(i)} aria-label="Entfernen"><Icon name="trash" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="field">
        <label>Person oder Gruppe hinzufügen</label>
        <div className="input-icon"><Icon name="search" /><input className="input" placeholder="Name suchen …" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="row wrap" style={{ marginTop: 6 }}>
          {dir.groups.map((g) => (
            <button key={`g${g.id}`} className="btn sm" disabled={has('group', g.id)} onClick={() => add('group', g)}>
              <Icon name="users" size={13} /> {g.name} <span className="faint tiny">({g.members})</span>
            </button>
          ))}
          {dir.users.map((u) => (
            <button key={`u${u.id}`} className="btn sm" disabled={has('user', u.id)} onClick={() => add('user', u)}>
              <Icon name="user" size={13} /> {u.displayName}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
