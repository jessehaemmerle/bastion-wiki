import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';

export default function NotFound({ message = 'Diese Seite existiert nicht oder du hast keinen Zugriff darauf.' }) {
  return (
    <div className="content narrow">
      <Empty icon="radar" title="404 – Nicht gefunden" action={<Link className="btn primary" to="/">Zum Dashboard</Link>}>
        {message}
      </Empty>
    </div>
  );
}
