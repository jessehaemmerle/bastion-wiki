import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';
import { tr } from '../lib/i18n.js';

export default function NotFound({ message }) {
  return (
    <div className="content narrow">
      <Empty icon="radar" title={tr('404 – Nicht gefunden')} action={<Link className="btn primary" to="/">{tr('Zum Dashboard')}</Link>}>
        {message || tr('Diese Seite existiert nicht oder du hast keinen Zugriff darauf.')}
      </Empty>
    </div>
  );
}
