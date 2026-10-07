import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_VARIANTS = ['info', 'tip', 'success', 'warning', 'danger'];

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-variant') || 'info',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addCommands() {
    return {
      setCallout: (variant = 'info') => ({ commands }) => commands.wrapIn(this.name, { variant }),
      toggleCallout: (variant = 'info') => ({ commands, editor }) => {
        if (editor.isActive(this.name)) {
          if (editor.getAttributes(this.name).variant !== variant) return commands.updateAttributes(this.name, { variant });
          return commands.lift(this.name);
        }
        return commands.wrapIn(this.name, { variant });
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at start of an empty callout unwraps it
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || !editor.isActive(this.name)) return false;
        if ($from.parentOffset !== 0 || $from.parent.textContent.length) return false;
        return editor.commands.lift(this.name);
      },
    };
  },
});
