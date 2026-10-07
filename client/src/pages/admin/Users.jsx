import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Avatar, Confirm, Dropdown, MenuItem, Modal, Spinner, Switch } from '../../components/ui.jsx';
import { api, qs } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { ROLE_LABELS, timeAgo } from '../../lib/format.js';

function UserModal({ user, groups, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({
    username: user?.username || '', displayName: user?.displayName || '', email: user?.email || '',
    role: user?.role || 'editor', password: '', isActive: user?.isActive ?? true,
    groupIds: groups.filter((g) => g.members.some((m) => m.id === user?.id)).map((g) => g.id),
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const body = { displayName: f.displayName, email: f.email || null, role: f.role, groupIds: f.groupIds };
      if (user) {
        if (f.password) body.password = f.password;
        body.isActive = f.isActive;
        await api.patch(`/admin/users/${user.id}`, body);
      } else {
        await api.post('/admin/users', { ...body, username: f.username, password: f.password, email: f.email || undefined });
      }
      toast(user ? 'Benutzer gespeichert' : 'Benutzer angelegt');
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  const genPw = () => set('password', Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''));
  return (
    <Modal title={user ? `${user.username} bearbeiten` : 'Neuer Benutzer'} icon="user" size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" onClick={save}><Icon name="save" /> Speichern</button></>}>
      <div className="form-grid">
        <div className="field"><label>Benutzername</label><input className="input mono" value={f.username} disabled={!!user} onChange={(e) => set('username', e.target.value)} autoFocus={!user} /></div>
        <div className="field"><label>Anzeigename</label><input className="input" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></div>
        <div className="field"><label>E-Mail</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Rolle</label>
        <div className="segmented">
          {['admin', 'editor', 'viewer'].map((r) => <button key={r} className={f.role === r ? 'active' : ''} onClick={() => set('role', r)}>{ROLE_LABELS[r]}</button>)}
        </div>
        <span className="hint">
          {f.role === 'admin' && 'Vollzugriff auf alle Bereiche und das Admin-Panel.'}
          {f.role === 'editor' && 'Kann Bereiche anlegen und in freigegebenen Bereichen schreiben.'}
          {f.role === 'viewer' && 'Kann nur lesen – auch wenn ein Bereich Schreibrechte vergibt.'}
        </span>
      </div>
      <div className="field">
        <label>{user ? 'Neues Passwort (leer lassen = unverändert)' : 'Passwort'}</label>
        <div className="row">
          <input className="input mono" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder="mind. 8 Zeichen" />
          <button className="btn" type="button" onClick={genPw} title="Zufällig generieren"><Icon name="wand" /></button>
        </div>
      </div>
      <div className="field">
        <label>Gruppen</label>
        <div className="row wrap">
          {groups.length === 0 && <span className="faint small">Noch keine Gruppen angelegt.</span>}
          {groups.map((g) => (
            <label key={g.id} className={`btn sm ${f.groupIds.includes(g.id) ? 'active' : ''}`}>
              <input type="checkbox" hidden checked={f.groupIds.includes(g.id)} onChange={(e) => set('groupIds', e.target.checked ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id))} />
              <Icon name="users" size={13} /> {g.name}
            </label>
          ))}
        </div>
      </div>
      {user && <Switch checked={f.isActive} onChange={(v) => set('isActive', v)} label="Konto aktiv" />}
    </Modal>
  );
}

export default function Users() {
  const { toast, user: me } = useApp();
  const [q, setQ] = useState('');
  const { data, loading, reload } = useFetch(`/admin/users${qs({ q })}`);
  const groups = useFetch('/admin/groups');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><h1>Benutzer</h1><p>Konten, Rollen und Gruppenzugehörigkeit verwalten.</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="user-plus" /> Benutzer anlegen</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="input-icon" style={{ maxWidth: 320, width: '100%' }}><Icon name="search" /><input className="input sm" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="faint small">{data?.users.length ?? 0} Benutzer</span>
        </div>
        {loading && !data ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Benutzer</th><th>Rolle</th><th>Gruppen</th><th>Status</th><th>Letzter Login</th><th>Edits</th><th /></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="row"><Avatar name={u.displayName} size={30} /><div><div style={{ fontWeight: 600 }}>{u.displayName}</div><div className="small muted">{u.username}{u.email ? `, ${u.email}` : ''}</div></div></div></td>
                    <td><span className={`badge ${u.role === 'admin' ? 'accent' : ''}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td><div className="row wrap" style={{ gap: 4 }}>{u.groups.map((g) => <span key={g} className="badge">{g}</span>)}</div></td>
                    <td>{u.isActive ? <span className="badge success">aktiv</span> : <span className="badge danger">deaktiviert</span>}</td>
                    <td className="small faint nowrap">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'nie'}</td>
                    <td className="mono small">{u.edits}</td>
                    <td className="actions">
                      <Dropdown trigger={({ toggle }) => <button className="btn ghost icon sm" onClick={toggle} aria-label="Aktionen"><Icon name="more" size={15} /></button>}>
                        <MenuItem icon="edit" onClick={() => setEdit(u)}>Bearbeiten</MenuItem>
                        <MenuItem icon="log-out" onClick={async () => { await api.del(`/admin/users/${u.id}/sessions`); toast('Alle Sitzungen beendet'); }}>Abmelden erzwingen</MenuItem>
                        {u.id !== me.id && <MenuItem icon={u.isActive ? 'lock' : 'check'} onClick={async () => {
                          try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); reload(); } catch (e) { toast(e.message, 'error'); }
                        }}>{u.isActive ? 'Deaktivieren' : 'Aktivieren'}</MenuItem>}
                        {u.id !== me.id && <><div className="menu-sep" /><MenuItem icon="trash" danger onClick={() => setDel(u)}>Löschen</MenuItem></>}
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && groups.data && <UserModal user={edit.id ? edit : null} groups={groups.data.groups} onClose={() => setEdit(null)} onSaved={() => { reload(); groups.reload(); }} />}
      {del && (
        <Confirm danger title="Benutzer löschen?" message={`@${del.username} wird gelöscht. Seiten bleiben erhalten, verlieren aber die Autorenzuordnung.`} confirmLabel="Löschen" onClose={() => setDel(null)}
          onConfirm={async () => { try { await api.del(`/admin/users/${del.id}`); toast('Benutzer gelöscht'); reload(); } catch (e) { toast(e.message, 'error'); } }} />
      )}
    </>
  );
}
