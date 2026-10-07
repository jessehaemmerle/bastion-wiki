import { formatDate } from '../lib/format.js';

/** Edits per day for the last `days` days – one series, so no legend; hover shows the value. */
export function ActivityBars({ activity, days = 30, height = 44 }) {
  const map = new Map((activity || []).map((a) => [a.day, a.edits]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push({ d, n: map.get(d) || 0 });
  }
  const max = Math.max(1, ...series.map((x) => x.n));
  const total = series.reduce((a, b) => a + b.n, 0);
  const w = 100 / days;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={`${total} Änderungen in ${days} Tagen`} style={{ height }}>
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {series.map((x, i) => {
          const h = x.n ? Math.max(2, (x.n / max) * (height - 2)) : 0;
          return (
            <g key={x.d}>
              <rect x={i * w} y="0" width={w} height={height} fill="transparent">
                <title>{`${formatDate(x.d)}: ${x.n} Änderung${x.n === 1 ? '' : 'en'}`}</title>
              </rect>
              {h > 0 && <rect x={i * w + w * 0.15} y={height - 1 - h} width={w * 0.7} height={h} fill={i === days - 1 ? 'var(--accent)' : 'var(--text-muted)'} pointerEvents="none" />}
            </g>
          );
        })}
      </svg>
      <figcaption className="row between tiny faint" style={{ marginTop: 4 }}>
        <span>vor {days} Tagen</span><span>heute</span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars with the value written next to each bar. */
export function BarList({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list" role="table">
      {rows.map((r) => (
        <div className="bar-row" key={r.label} role="row">
          <span className="ellipsis" role="rowheader">{r.label}</span>
          <div className="bar" aria-hidden="true"><span style={{ width: `${(r.value / max) * 100}%`, '--c': r.color }} /></div>
          <span role="cell">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
