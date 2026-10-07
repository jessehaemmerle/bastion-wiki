import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { tr } from '../../lib/i18n.js';

const SlashMenu = forwardRef(function SlashMenu({ items, command }, ref) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') { setActive((a) => (a + 1) % Math.max(items.length, 1)); return true; }
      if (event.key === 'ArrowUp') { setActive((a) => (a - 1 + items.length) % Math.max(items.length, 1)); return true; }
      if (event.key === 'Enter') { if (items[active]) command(items[active]); return true; }
      return false;
    },
  }));

  if (!items.length) return <div className="slash-menu"><div className="faint small" style={{ padding: 10 }}>{tr('Kein Block gefunden')}</div></div>;
  return (
    <div className="slash-menu" ref={listRef}>
      {items.map((item, i) => (
        <button
          key={item.title}
          className={`slash-item ${i === active ? 'active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => { e.preventDefault(); command(item); }}
        >
          <span className="si-icon"><Icon name={item.icon} size={16} /></span>
          <span>
            <div className="si-title">{tr(item.title)}</div>
            <div className="si-desc">{tr(item.desc)}</div>
          </span>
        </button>
      ))}
    </div>
  );
});

export default SlashMenu;
