import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import SlashMenu from './SlashMenu.jsx';
import { filterSlashItems } from './slashItems.js';

function position(el, rect) {
  if (!rect) return;
  const menuH = Math.min(el.offsetHeight || 340, 340);
  const below = rect.bottom + 6;
  const top = below + menuH > window.innerHeight ? Math.max(8, rect.top - menuH - 6) : below;
  Object.assign(el.style, { position: 'fixed', left: `${Math.min(rect.left, window.innerWidth - 310)}px`, top: `${top}px`, zIndex: 500 });
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return { context: {} };
  },

  addProseMirrorPlugins() {
    const ctx = this.options.context;
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== 'codeBlock';
        },
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor, ctx);
        },
        render: () => {
          let renderer;
          let el;
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              el = document.createElement('div');
              el.append(renderer.element);
              document.body.append(el);
              position(el, props.clientRect?.());
            },
            onUpdate: (props) => {
              renderer.updateProps(props);
              position(el, props.clientRect?.());
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') { el?.remove(); return true; }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              el?.remove();
              renderer?.destroy();
            },
          };
        },
      }),
    ];
  },
});
