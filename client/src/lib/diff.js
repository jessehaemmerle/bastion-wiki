/** Convert stored HTML into comparable plain-text lines */
export function htmlToLines(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.querySelectorAll('p, h1, h2, h3, h4, li, pre, tr, blockquote, div[data-type]').forEach((el) => el.append('\n'));
  doc.querySelectorAll('img').forEach((img) => img.replaceWith(`[Bild: ${img.getAttribute('alt') || img.getAttribute('src')?.slice(0, 40)}]`));
  return doc.body.textContent.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1] !== ''));
}

/** Line diff based on the longest common subsequence */
export function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return [...a.map((t) => ({ t, type: 'del' })), ...b.map((t) => ({ t, type: 'add' }))];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: a[i], type: 'same' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: a[i++], type: 'del' });
    else out.push({ t: b[j++], type: 'add' });
  }
  while (i < n) out.push({ t: a[i++], type: 'del' });
  while (j < m) out.push({ t: b[j++], type: 'add' });
  return out;
}
