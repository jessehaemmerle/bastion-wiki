import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Avatar, Confirm, Dropdown, MenuItem, Modal, Spinner, Switch } from '../../components/ui.jsx';
import { api, qs } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { ROLE_LABELS, timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

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
      toast(user ? tr('Benutzer gespeichert') : tr('Benutzer angelegt'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  const genPw = () => set('password', Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''));
  return (
    <Modal title={user ? tr('{name} bearbeiten', { name: user.username }) : tr('Neuer Benutzer')} icon="user" size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" onClick={save}><Icon name="save" /> {tr('Speichern')}</button></>}>
      <div className="form-grid">
        <div className="field"><label>{tr('Benutzername')}</label><input className="input mono" value={f.username} disabled={!!user} onChange={(e) => set('username', e.target.value)} autoFocus={!user} /></div>
        <div className="field"><label>{tr('Anzeigename')}</label><input className="input" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} /></div>
        <div className="field"><label>{tr('E-Mail')}</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      </div>
      <div className="field">
        <label>{tr('Rolle')}</label>
        <div className="segmented">
          {['admin', 'editor', 'viewer'].map((r) => <button key={r} className={f.role === r ? 'active' : ''} onClick={() => set('role', r)}>{ROLE_LABELS[r]}</button>)}
        </div>
        <span className="hint">
          {f.role === 'admin' && tr('Vollzugriff auf alle Bereiche und die Administration.')}
          {f.role === 'editor' && tr('Kann Bereiche anlegen und in freigegebenen Bereichen schreiben.')}
          {f.role === 'viewer' && tr('Kann nur lesen – auch wenn ein Bereich Schreibrechte vergibt.')}
        </span>
      </div>
      {(!user || user.authSource === 'local') ? (
        <div className="field">
          <label>{user ? tr('Neues Passwort (leer lassen = unverändert)') : tr('Passwort')}</label>
          <div className="row">
            <input className="input mono" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={tr('mind. 8 Zeichen')} />
            <button className="btn" type="button" onClick={genPw} title={tr('Zufällig generieren')}><Icon name="wand" /></button>
          </div>
        </div>
      ) : (
        <div className="small muted">{user.authSource === 'ldap'
          ? tr('Konto aus dem Verzeichnisdienst – Passwort wird dort verwaltet. Rolle und Gruppen werden bei der Anmeldung abgeglichen, falls eine Gruppenzuordnung eingerichtet ist.')
          : tr('Single-Sign-on-Konto – Anmeldung über den Identitätsanbieter. Rolle und Gruppen werden bei der Anmeldung abgeglichen, falls eine Gruppenzuordnung eingerichtet ist.')}</div>
      )}
      <div className="field">
        <label>{tr('Gruppen')}</label>
        <div className="row wrap">
          {groups.length === 0 && <span className="faint small">{tr('Noch keine Gruppen angelegt.')}</span>}
          {groups.map((g) => (
            <label key={g.id} className={`btn sm ${f.groupIds.includes(g.id) ? 'active' : ''}`}>
              <input type="checkbox" hidden checked={f.groupIds.includes(g.id)} onChange={(e) => set('groupIds', e.target.checked ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id))} />
              <Icon name="users" size={13} /> {g.name}
            </label>
          ))}
        </div>
      </div>
      {user && <Switch checked={f.isActive} onChange={(v) => set('isActive', v)} label={tr('Konto aktiv')} />}
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
        <div><h1>{tr('Benutzer')}</h1><p>{tr('Konten, Rollen und Gruppenzugehörigkeit verwalten.')}</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="user-plus" /> {tr('Benutzer anlegen')}</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="input-icon" style={{ maxWidth: 320, width: '100%' }}><Icon name="search" /><input className="input sm" placeholder={tr('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="faint small">{tr('{n} Benutzer', { n: data?.users.length ?? 0 })}</span>
        </div>
        {loading && !data ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Benutzer')}</th><th>{tr('Rolle')}</th><th>{tr('Gruppen')}</th><th>{tr('Status')}</th><th>{tr('Letzter Login')}</th><th>{tr('Edits')}</th><th /></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td><div className="row"><Avatar name={u.displayName} size={30} /><div><div style={{ fontWeight: 600 }}>{u.displayName}</div><div className="small muted">{u.username}{u.email ? `, ${u.email}` : ''}</div></div></div></td>
                    <td><span className={`badge ${u.role === 'admin' ? 'accent' : ''}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td><div className="row wrap" style={{ gap: 4 }}>{u.groups.map((g) => <span key={g} className="badge">{g}</span>)}</div></td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {u.isActive ? <span className="badge success">{tr('aktiv')}</span> : <span className="badge danger">{tr('deaktiviert')}</span>}
                        {u.authSource !== 'local' && <span className="badge mono">{u.authSource === 'ldap' ? 'LDAP' : 'SSO'}</span>}
                        {u.totpEnabled && <span className="badge" title={tr('Zwei-Faktor-Anmeldung aktiv')}>2FA</span>}
                      </div>
                    </td>
                    <td className="small faint nowrap">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : tr('nie')}</td>
                    <td className="mono small">{u.edits}</td>
                    <td className="actions">
                      <Dropdown trigger={({ toggle }) => <button className="btn ghost icon sm" onClick={toggle} aria-label={tr('Aktionen')}><Icon name="more" size={15} /></button>}>
                        <MenuItem icon="edit" onClick={() => setEdit(u)}>{tr('Bearbeiten')}</MenuItem>
                        <MenuItem icon="log-out" onClick={async () => { await api.del(`/admin/users/${u.id}/sessions`); toast(tr('Alle Sitzungen beendet')); }}>{tr('Abmelden erzwingen')}</MenuItem>
                        {u.totpEnabled && <MenuItem icon="smartphone" onClick={async () => {
                          if (!confirm(tr('Zwei-Faktor-Anmeldung für {name} zurücksetzen? Die Person kann sich danach nur mit Passwort anmelden und muss 2FA neu einrichten.', { name: u.displayName }))) return;
                          try { await api.patch(`/admin/users/${u.id}`, { reset2fa: true }); toast(tr('2FA zurückgesetzt')); reload(); } catch (e) { toast(e.message, 'error'); }
                        }}>{tr('2FA zurücksetzen')}</MenuItem>}
                        {u.id !== me.id && <MenuItem icon={u.isActive ? 'lock' : 'check'} onClick={async () => {
                          try { await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }); reload(); } catch (e) { toast(e.message, 'error'); }
                        }}>{u.isActive ? tr('Deaktivieren') : tr('Aktivieren')}</MenuItem>}
                        {u.id !== me.id && <><div className="menu-sep" /><MenuItem icon="trash" danger onClick={() => setDel(u)}>{tr('Löschen')}</MenuItem></>}
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
        <Confirm danger title={tr('Benutzer löschen?')} message={tr('{name} wird gelöscht. Seiten bleiben erhalten, verlieren aber die Autorenzuordnung.', { name: del.username })} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
          onConfirm={async () => { try { await api.del(`/admin/users/${del.id}`); toast(tr('Benutzer gelöscht')); reload(); } catch (e) { toast(e.message, 'error'); } }} />
      )}
    </>
  );
}
