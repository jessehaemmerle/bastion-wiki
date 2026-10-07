import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Avatar, Confirm, Empty, Modal, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { tr } from '../../lib/i18n.js';

function GroupModal({ group, users, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: group?.name || '', description: group?.description || '', externalName: group?.externalName || '', memberIds: group?.members.map((m) => m.id) || [] });
  const [q, setQ] = useState('');
  const save = async () => {
    try {
      if (group) await api.patch(`/admin/groups/${group.id}`, f);
      else await api.post('/admin/groups', f);
      toast(tr('Gruppe gespeichert'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = (id) => setF((x) => ({ ...x, memberIds: x.memberIds.includes(id) ? x.memberIds.filter((m) => m !== id) : [...x.memberIds, id] }));
  const filtered = users.filter((u) => !q || `${u.displayName} ${u.username}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={group ? tr('Gruppe bearbeiten') : tr('Neue Gruppe')} icon="users" size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!f.name} onClick={save}><Icon name="save" /> {tr('Speichern')}</button></>}>
      <div className="form-grid">
        <div className="field"><label>{tr('Name')}</label><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr('z. B. Netzwerk-Team')} /></div>
        <div className="field"><label>{tr('Beschreibung')}</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="field span-2">
          <label htmlFor="g-ext">{tr('Externer Name (LDAP-/SSO-Gruppe)')}</label>
          <input id="g-ext" className="input mono" value={f.externalName} onChange={(e) => setF({ ...f, externalName: e.target.value })} placeholder="cn=netzwerk,ou=groups,dc=corp,dc=local" />
          <span className="hint">{tr('Optional. Mitglieder dieser Verzeichnis- bzw. SSO-Gruppe werden bei der Anmeldung automatisch hinzugefügt und wieder entfernt.')}</span>
        </div>
      </div>
      <div className="field">
        <label>{tr('Mitglieder ({n})', { n: f.memberIds.length })}</label>
        <div className="input-icon"><Icon name="search" /><input className="input sm" placeholder={tr('Filtern …')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="card" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {filtered.map((u) => (
            <label key={u.id} className="row" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.memberIds.includes(u.id)} onChange={() => toggle(u.id)} style={{ accentColor: 'var(--accent)' }} />
              <Avatar name={u.displayName} size={24} /> {u.displayName} <span className="faint tiny mono">@{u.username}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function Groups() {
  const { toast } = useApp();
  const { data, loading, reload } = useFetch('/admin/groups');
  const users = useFetch('/admin/users');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Gruppen')}</h1><p>{tr('Gruppen bündeln Personen – Bereichsrechte vergibst du dann einmal pro Gruppe.')}</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" /> {tr('Gruppe anlegen')}</button>
      </div>
      {loading ? <Spinner /> : !data.groups.length ? (
        <div className="card"><Empty icon="users" title={tr('Noch keine Gruppen')}>{tr('Lege z. B. „Netzwerk“, „Linux“ oder „Service Desk“ an.')}</Empty></div>
      ) : (
        <div className="grid-3">
          {data.groups.map((g) => (
            <div key={g.id} className="card pad col" style={{ gap: 10 }}>
              <div className="row between">
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{g.name}</h3>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn ghost icon sm" onClick={() => setEdit(g)} aria-label={tr('Bearbeiten')}><Icon name="edit" size={14} /></button>
                  <button className="btn ghost icon sm" onClick={() => setDel(g)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                </div>
              </div>
              <div className="small muted">{g.description || tr('Keine Beschreibung')}{g.externalName && <span className="mono"> · ⇄ {g.externalName}</span>}</div>
              <div className="row" style={{ gap: 0 }}>
                {g.members.slice(0, 8).map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={m.displayName} size={28} /></span>)}
                {g.members.length > 8 && <span className="faint small" style={{ marginLeft: 6 }}>+{g.members.length - 8}</span>}
              </div>
              <div className="small muted">{tr('{m} Mitglieder, Rechte in {s} Bereichen', { m: g.members.length, s: g.spaceCount })}</div>
            </div>
          ))}
        </div>
      )}
      {edit && users.data && <GroupModal group={edit.id ? edit : null} users={users.data.users} onClose={() => setEdit(null)} onSaved={reload} />}
      {del && <Confirm danger title={tr('Gruppe löschen?')} message={tr('„{name}“ und alle zugehörigen Bereichsrechte werden entfernt.', { name: del.name })} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/admin/groups/${del.id}`); toast(tr('Gruppe gelöscht')); reload(); }} />}
    </>
  );
}
