import { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import type { FC } from 'react';

const LazyMilkdownEditor = lazy(() => import('./MilkdownEditorImpl'));

export interface MarkdownEditorProps {
  value: string;
  onChange: (nextMarkdown: string) => void;
  ariaLabel?: string;
}

/**
 * Markdown 编辑器入口：
 * - 运行时：懒加载 Milkdown（避免把一堆 ProseMirror 代码塞进首屏）
 * - Jest 单测：退化为 textarea，保证“流程测试”稳定（jsdom 对 ProseMirror 支持不完整）
 */
export const MarkdownEditor: FC<MarkdownEditorProps> = ({
  value,
  onChange,
  ariaLabel = '日记内容',
}) => {
  const isTestEnv = useMemo(() => {
    const maybeProcess = (globalThis as unknown as { process?: unknown }).process as
      | { env?: Record<string, string | undefined> }
      | undefined;
    if (maybeProcess?.env?.NODE_ENV === 'test') return true;
    return typeof (globalThis as unknown as { jest?: unknown }).jest !== 'undefined';
  }, []);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  if (isTestEnv) {
    return (
      <textarea
        className="td-editor"
        value={value}
        onChange={(e) => onChangeRef.current(e.currentTarget.value)}
        placeholder="写点什么…"
        rows={18}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <textarea
          className="td-editor"
          value={value}
          onChange={(e) => onChangeRef.current(e.currentTarget.value)}
          placeholder="加载编辑器中…"
          rows={18}
          aria-label={ariaLabel}
        />
      }
    >
      <LazyMilkdownEditor value={value} onChange={onChange} ariaLabel={ariaLabel} />
    </Suspense>
  );
};
