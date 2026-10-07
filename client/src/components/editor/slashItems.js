import { tr } from '../../lib/i18n.js';
/** Block types offered by the "/" menu */
export const SLASH_ITEMS = [
  { title: 'Text', desc: 'Normaler Absatz', icon: 'type', keywords: 'paragraph absatz', run: (e) => e.chain().focus().setParagraph().run() },
  { title: 'Überschrift 1', desc: 'Großer Abschnittstitel', icon: 'hash', keywords: 'h1 heading', run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: 'Überschrift 2', desc: 'Mittlerer Abschnittstitel', icon: 'hash', keywords: 'h2 heading', run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: 'Überschrift 3', desc: 'Kleiner Abschnittstitel', icon: 'hash', keywords: 'h3 heading', run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: 'Aufzählung', desc: 'Einfache Liste', icon: 'list-checks', keywords: 'bullet list ul', run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: 'Nummerierte Liste', desc: 'Schritte in Reihenfolge', icon: 'list-checks', keywords: 'ordered list ol schritte', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: 'Checkliste', desc: 'Aufgaben zum Abhaken', icon: 'clipboard-check', keywords: 'todo task checkbox', run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: 'Codeblock', desc: 'Shell, Config, Skripte …', icon: 'square-terminal', keywords: 'code bash shell pre', run: (e) => e.chain().focus().toggleCodeBlock({ language: 'bash' }).run() },
  { title: 'Info-Box', desc: 'Hinweis hervorheben', icon: 'info', keywords: 'callout info note hinweis', run: (e) => e.chain().focus().toggleCallout('info').run() },
  { title: 'Tipp', desc: 'Nützlicher Tipp', icon: 'lightbulb', keywords: 'callout tip', run: (e) => e.chain().focus().toggleCallout('tip').run() },
  { title: 'Warnung', desc: 'Vorsicht geboten', icon: 'alert-triangle', keywords: 'callout warning achtung', run: (e) => e.chain().focus().toggleCallout('warning').run() },
  { title: 'Gefahr', desc: 'Kritischer Hinweis', icon: 'flame', keywords: 'callout danger kritisch', run: (e) => e.chain().focus().toggleCallout('danger').run() },
  { title: 'Erfolg', desc: 'Positives Ergebnis', icon: 'check-circle', keywords: 'callout success ok', run: (e) => e.chain().focus().toggleCallout('success').run() },
  { title: 'Tabelle', desc: '3×3 Tabelle mit Kopfzeile', icon: 'grid', keywords: 'table tabelle', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Zitat', desc: 'Zitat oder Auszug', icon: 'message', keywords: 'quote blockquote', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: 'Trennlinie', desc: 'Horizontale Linie', icon: 'more', keywords: 'hr divider line', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: 'Bild', desc: 'Bild hochladen', icon: 'upload', keywords: 'image bild foto upload', run: (e, ctx) => { e.chain().focus().run(); ctx?.pickImage?.(); } },
];

export function filterSlashItems(query) {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || tr(i.title).toLowerCase().includes(q) || i.keywords.includes(q)).slice(0, 12);
}
