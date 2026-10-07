import sanitizeHtml from 'sanitize-html';

const SAFE_STYLE = {
  color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^var\(--[a-z0-9-]+\)$/i],
  'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^var\(--[a-z0-9-]+\)$/i],
  'text-align': [/^(left|right|center|justify)$/],
  width: [/^\d+(px|%)$/],
  'min-width': [/^\d+(px|%)$/],
};

const OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark', 'sub', 'sup', 'code', 'kbd', 'span',
    'a', 'img', 'blockquote', 'pre', 'ul', 'ol', 'li', 'label', 'input', 'div',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'details', 'summary',
  ],
  allowedAttributes: {
    '*': ['data-type', 'data-variant', 'data-checked', 'data-language', 'data-id', 'data-color', 'data-secret-id', 'data-label', 'data-snippet-id', 'style', 'id'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    input: ['type', 'checked', 'disabled'],
    th: ['colspan', 'rowspan', 'colwidth'],
    td: ['colspan', 'rowspan', 'colwidth'],
    col: ['span'],
    ol: ['start', 'type'],
    details: ['open'],
  },
  allowedClasses: {
    code: [/^language-[\w+#-]+$/, /^hljs.*/],
    pre: [/^language-[\w+#-]+$/],
    span: [/^hljs.*/],
  },
  allowedStyles: { '*': SAFE_STYLE },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'ssh', 'rdp', 'vnc', 'smb', 'ftp', 'sftp'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href || '');
      return {
        tagName,
        attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } : attribs,
      };
    },
    input: (tagName, attribs) => ({
      tagName,
      attribs: attribs.type === 'checkbox' ? { type: 'checkbox', ...(attribs.checked !== undefined ? { checked: 'checked' } : {}) } : {},
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
};

export const sanitize = (html) => sanitizeHtml(String(html || ''), OPTIONS);

/** Plain-text projection of HTML used for full-text search */
export function htmlToText(html) {
  return sanitizeHtml(
    String(html || '')
      .replace(/<\/(p|h[1-6]|li|pre|blockquote|tr|div)>/gi, '$&\n')
      .replace(/<br\s*\/?>/gi, '\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" stays "&lt;" instead of being decoded twice
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
