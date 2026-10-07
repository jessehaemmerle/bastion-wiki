import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Confirm, Empty, Modal, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, PAGE_TYPES, timeAgo } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

function RestoreTarget({ entry, onClose, onDone }) {
  const { spaces } = useApp();
  const writable = spaces.filter((s) => ['write', 'admin'].includes(s.access));
  const [spaceId, setSpaceId] = useState(writable[0]?.id || '');
  return (
    <Modal title={tr('Wiederherstellen in …')} icon="archive-restore" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!spaceId} onClick={() => onDone(Number(spaceId))}>{tr('Wiederherstellen')}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{tr('Der ursprüngliche Bereich von „{title}“ existiert nicht mehr.', { title: entry.title })}</p>
      <select className="select" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} aria-label={tr('Zielbereich')}>
        {writable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </Modal>
  );
}

export default function Trash() {
  const [params] = useSearchParams();
  const space = params.get('space') || '';
  const navigate = useNavigate();
  const { toast, refreshTree, spaces } = useApp();
  const { data, error, loading, reload } = useFetch(`/trash${space ? `?space=${encodeURIComponent(space)}` : ''}`);
  const [purge, setPurge] = useState(null);
  const [target, setTarget] = useState(null);
  useChrome([{ label: tr('Papierkorb') }]);

  const restore = async (e, spaceId) => {
    try {
      const { page } = await api.post(`/trash/${e.id}/restore`, spaceId ? { spaceId } : {});
      toast(tr('„{title}“ wiederhergestellt', { title: page.title }));
      refreshTree();
      navigate(`/p/${page.id}`);
    } catch (err) {
      if (err.status === 400 && !spaceId) setTarget(e);
      else toast(err.message, 'error');
    }
  };

  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Papierkorb')}</h1>
          <p>{data ? trn(data.retentionDays, 'Gelöschte Seiten bleiben 1 Tag erhalten und lassen sich samt Versionen, Anhängen, Kommentaren und Geheimnissen wiederherstellen.', 'Gelöschte Seiten bleiben {n} Tage erhalten und lassen sich samt Versionen, Anhängen, Kommentaren und Geheimnissen wiederherstellen.') : ''}</p>
        </div>
        <select className="select" style={{ width: 'auto' }} value={space} onChange={(e) => navigate(e.target.value ? `/trash?space=${e.target.value}` : '/trash')} aria-label={tr('Bereich')}>
          <option value="">{tr('Alle Bereiche')}</option>
          {spaces.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
        </select>
      </div>
      {loading && !data ? <Spinner /> : error ? <Empty icon="alert-triangle" title={tr('Fehler')}>{error.message}</Empty> : !data.entries.length ? (
        <Empty icon="trash" title={tr('Der Papierkorb ist leer')}>{tr('Hier landen gelöschte Seiten aus Bereichen, in denen du schreiben darfst.')}</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead><tr><th>{tr('Seite')}</th><th>{tr('Bereich')}</th><th>{tr('Gelöscht')}</th><th>{tr('Löschung in')}</th><th /></tr></thead>
            <tbody>
              {data.entries.map((e) => {
                const left = Math.max(0, data.retentionDays - Math.floor((Date.now() - new Date(e.deletedAt).getTime()) / 864e5));
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="row" style={{ gap: 8 }}><Icon name={PAGE_TYPES[e.pageType]?.icon || 'file-text'} size={15} /> <strong>{e.title}</strong></div>
                      <div className="tiny faint">{trn(e.versions, '1 Version', '{n} Versionen')}{e.attachments > 0 && ` · ${trn(e.attachments, '1 Anhang', '{n} Anhänge')}`}{e.children > 0 && ` · ${trn(e.children, '1 Unterseite', '{n} Unterseiten')}`}</div>
                    </td>
                    <td className="small">{e.spaceName ? <span className="row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': e.spaceColor }} />{e.spaceName}</span> : <span className="faint">{tr('gelöscht')}</span>}</td>
                    <td className="small" title={formatDate(e.deletedAt, true)}>{timeAgo(e.deletedAt)}<div className="tiny faint">{e.deletedBy}</div></td>
                    <td className="small mono">{trn(left, '1 Tag', '{n} Tage')}</td>
                    <td className="actions">
                      <button className="btn sm" onClick={() => restore(e)}><Icon name="archive-restore" size={14} /> {tr('Wiederherstellen')}</button>
                      <button className="btn ghost icon sm" onClick={() => setPurge(e)} aria-label={tr('Endgültig löschen')} title={tr('Endgültig löschen')}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {target && <RestoreTarget entry={target} onClose={() => setTarget(null)} onDone={(sid) => { setTarget(null); restore(target, sid); }} />}
      {purge && (
        <Confirm danger title={tr('Endgültig löschen?')} confirmLabel={tr('Endgültig löschen')} onClose={() => setPurge(null)}
          message={tr('„{title}“ wird samt Versionen und Anhängen gelöscht. Das lässt sich nicht rückgängig machen.', { title: purge.title })}
          onConfirm={async () => {
            try { await api.del(`/trash/${purge.id}`); toast(tr('Endgültig gelöscht')); reload(); } catch (e) { toast(e.message, 'error'); }
          }} />
      )}
    </div>
  );
}
