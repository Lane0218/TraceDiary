import React, { useEffect, useRef } from 'react';

import { defaultValueCtx, Editor, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';

export interface MilkdownEditorImplProps {
  value: string;
  onChange: (nextMarkdown: string) => void;
  ariaLabel: string;
}

export const MilkdownEditorImpl: React.FC<MilkdownEditorImplProps> = ({
  value,
  onChange,
  ariaLabel,
}) => {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEditor(
    (root) => {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);

          // Make ProseMirror feel like our app surface.
          ctx.update(editorViewOptionsCtx, (prev) => {
            const prevAttrs = prev.attributes;
            return {
              ...prev,
              attributes: (state) => {
                const attrs =
                  typeof prevAttrs === 'function' ? prevAttrs(state) : prevAttrs;
                return {
                  ...attrs,
                  class: `${attrs?.class ?? ''} td-prosemirror`.trim(),
                  'aria-label': ariaLabel,
                  role: 'textbox',
                  'aria-multiline': 'true',
                };
              },
            };
          });

          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChangeRef.current(markdown);
          });
        })
        .use(commonmark)
        .use(listener);

      return editor;
    },
    // Parent remounts this component via React key when the source content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="td-editorShell" data-testid="milkdown-editor">
      <MilkdownProvider>
        <Milkdown />
      </MilkdownProvider>
    </div>
  );
};

export default MilkdownEditorImpl;

