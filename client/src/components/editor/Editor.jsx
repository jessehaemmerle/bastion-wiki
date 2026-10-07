import { useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Typography from '@tiptap/extension-typography';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { lowlight } from '../../lib/highlight.js';
import { Callout } from './Callout.js';
import { SlashCommand } from './SlashCommand.js';
import CodeBlockView from './CodeBlockView.jsx';
import Icon from '../Icon.jsx';
import { tr } from '../../lib/i18n.js';

const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: 'bash' });

function Btn({ icon, label, active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={`tb-btn ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={15} /> : children}
    </button>
  );
}

function Toolbar({ editor, onPickImage }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2'
        : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('heading', { level: 4 }) ? 'h4' : 'p',
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      code: e.isActive('code'), highlight: e.isActive('highlight'), link: e.isActive('link'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'),
      quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'), callout: e.isActive('callout'),
      table: e.isActive('table'), sub: e.isActive('subscript'), sup: e.isActive('superscript'),
      alignCenter: e.isActive({ textAlign: 'center' }), alignRight: e.isActive({ textAlign: 'right' }),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt(tr('Link-Adresse (URL oder /p/<id>)'), prev);
    if (url === null) return;
    if (!url) return c().extendMarkRange('link').unsetLink().run();
    c().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="toolbar">
      <Btn icon="undo" label={tr('Rückgängig (Strg+Z)')} disabled={!s.canUndo} onClick={() => c().undo().run()} />
      <span className="tb-sep" />
      <select
        className="tb-select"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') c().setParagraph().run();
          else c().setHeading({ level: Number(v[1]) }).run();
        }}
        aria-label={tr('Absatzformat')}
      >
        <option value="p">{tr('Text')}</option>
        <option value="h1">{tr('Überschrift 1')}</option>
        <option value="h2">{tr('Überschrift 2')}</option>
        <option value="h3">{tr('Überschrift 3')}</option>
        <option value="h4">{tr('Überschrift 4')}</option>
      </select>
      <span className="tb-sep" />
      <Btn label={tr('Fett (Strg+B)')} active={s.bold} onClick={() => c().toggleBold().run()}><b>B</b></Btn>
      <Btn label={tr('Kursiv (Strg+I)')} active={s.italic} onClick={() => c().toggleItalic().run()}><i style={{ fontFamily: 'serif' }}>I</i></Btn>
      <Btn label={tr('Unterstrichen (Strg+U)')} active={s.underline} onClick={() => c().toggleUnderline().run()}><u>U</u></Btn>
      <Btn label={tr('Durchgestrichen')} active={s.strike} onClick={() => c().toggleStrike().run()}><s>S</s></Btn>
      <Btn icon="code" label={tr('Inline-Code (Strg+E)')} active={s.code} onClick={() => c().toggleCode().run()} />
      <Btn icon="brush" label={tr('Markieren')} active={s.highlight} onClick={() => c().toggleHighlight().run()} />
      <Btn icon="link" label={tr('Link')} active={s.link} onClick={setLink} />
      <Btn label={tr('Tiefgestellt')} active={s.sub} onClick={() => c().toggleSubscript().run()}>x<sub>2</sub></Btn>
      <Btn label={tr('Hochgestellt')} active={s.sup} onClick={() => c().toggleSuperscript().run()}>x<sup>2</sup></Btn>
      <span className="tb-sep" />
      <Btn label={tr('Aufzählung')} active={s.bullet} onClick={() => c().toggleBulletList().run()}>•≡</Btn>
      <Btn label={tr('Nummerierte Liste')} active={s.ordered} onClick={() => c().toggleOrderedList().run()}>1≡</Btn>
      <Btn icon="clipboard-check" label={tr('Checkliste')} active={s.task} onClick={() => c().toggleTaskList().run()} />
      <span className="tb-sep" />
      <Btn icon="square-terminal" label={tr('Codeblock')} active={s.codeBlock} onClick={() => c().toggleCodeBlock({ language: 'bash' }).run()} />
      <Btn icon="message" label={tr('Zitat')} active={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <Btn icon="info" label={tr('Info-Box')} active={s.callout} onClick={() => c().toggleCallout('info').run()} />
      <Btn icon="alert-triangle" label={tr('Warnung')} onClick={() => c().toggleCallout('warning').run()} />
      <Btn icon="flame" label={tr('Gefahr')} onClick={() => c().toggleCallout('danger').run()} />
      <Btn icon="grid" label={tr('Tabelle einfügen')} active={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <Btn icon="upload" label={tr('Bild einfügen')} onClick={onPickImage} />
      <Btn icon="more" label={tr('Trennlinie')} onClick={() => c().setHorizontalRule().run()} />
      <span className="tb-sep" />
      <Btn label={tr('Linksbündig')} active={!s.alignCenter && !s.alignRight} onClick={() => c().setTextAlign('left').run()}>⟸</Btn>
      <Btn label={tr('Zentriert')} active={s.alignCenter} onClick={() => c().setTextAlign('center').run()}>⟺</Btn>
      <Btn label={tr('Rechtsbündig')} active={s.alignRight} onClick={() => c().setTextAlign('right').run()}>⟹</Btn>
      {s.table && (
        <>
          <span className="tb-sep" />
          <Btn label={tr('Zeile darunter')} onClick={() => c().addRowAfter().run()}>+Z</Btn>
          <Btn label={tr('Spalte rechts')} onClick={() => c().addColumnAfter().run()}>+S</Btn>
          <Btn label={tr('Zeile löschen')} onClick={() => c().deleteRow().run()}>−Z</Btn>
          <Btn label={tr('Spalte löschen')} onClick={() => c().deleteColumn().run()}>−S</Btn>
          <Btn label={tr('Kopfzeile umschalten')} onClick={() => c().toggleHeaderRow().run()}>H</Btn>
          <Btn icon="trash" label={tr('Tabelle löschen')} onClick={() => c().deleteTable().run()} />
        </>
      )}
    </div>
  );
}

/**
 * WYSIWYG editor.
 * `onUpload(files)` must return [{ url, filename, mimeType }]. If missing, images are embedded as data URLs.
 */
export default function Editor({ content, onChange, onUpload, placeholder, onSaveShortcut }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef(onUpload);
  uploadRef.current = onUpload;
  const saveRef = useRef(onSaveShortcut);
  saveRef.current = onSaveShortcut;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const insertFiles = async (editor, files, pos) => {
    const list = [...files];
    if (!list.length) return;
    let uploaded;
    if (uploadRef.current) {
      uploaded = await uploadRef.current(list);
    } else {
      uploaded = await Promise.all(list.filter((f) => f.type.startsWith('image/')).map((f) => new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve({ url: r.result, filename: f.name, mimeType: f.type });
        r.readAsDataURL(f);
      })));
    }
    const chain = editor.chain().focus();
    if (pos != null) chain.setTextSelection(pos);
    for (const f of uploaded || []) {
      if (f.mimeType?.startsWith('image/')) chain.setImage({ src: f.url, alt: f.filename });
      else chain.insertContent({ type: 'paragraph', content: [{ type: 'text', text: `📎 ${f.filename}`, marks: [{ type: 'link', attrs: { href: f.url } }] }] });
    }
    chain.run();
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: null, target: null } },
      }),
      CodeBlock,
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || tr('Schreibe los … oder tippe „/“ für Blöcke') }),
      CharacterCount,
      Typography,
      Subscript,
      Superscript,
      Callout,
      SlashCommand.configure({ context: { pickImage: () => fileRef.current?.click() } }),
    ],
    content,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      handlePaste: (view, event) => {
        const files = [...(event.clipboardData?.files || [])];
        if (!files.length) return false;
        event.preventDefault();
        insertFiles(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        setDragging(false);
        const files = [...(event.dataTransfer?.files || [])];
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFiles(editorRef.current, files, pos);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current?.(e.getHTML()),
  });
  const editorRef = useRef(null);
  editorRef.current = editor;

  if (!editor) return null;
  const words = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div
      className="editor-frame"
      style={{ position: 'relative' }}
      onDragOver={(e) => e.dataTransfer?.types?.includes('Files') && setDragging(true)}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragging(false)}
    >
      <Toolbar editor={editor} onPickImage={() => fileRef.current?.click()} />
      <BubbleMenu editor={editor} shouldShow={({ editor: e, state }) => !state.selection.empty && !e.isActive('codeBlock') && !e.isActive('image')}>
        <div className="bubble">
          <Btn label={tr('Fett')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
          <Btn label={tr('Kursiv')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
          <Btn icon="code" label={tr('Code')} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
          <Btn icon="brush" label={tr('Markieren')} active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
          <Btn icon="link" label={tr('Link')} active={editor.isActive('link')} onClick={() => {
            const url = window.prompt(tr('Link-Adresse'), editor.getAttributes('link').href || '');
            if (url === null) return;
            if (!url) editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }} />
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
      <div className="row between faint tiny mono" style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
        <span>{tr('„/“ fügt Blöcke ein. Bilder per Drag & Drop oder Einfügen. Strg+S speichert.')}</span>
        <span>{tr('{n} Wörter', { n: words })}</span>
      </div>
      {dragging && <div className="drop-hint">{tr('Dateien hier ablegen')}</div>}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => { insertFiles(editor, e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
