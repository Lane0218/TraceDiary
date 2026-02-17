import { describe, expect, it } from 'vitest'
import { buildMarkdownToc } from '../../utils/markdown-toc'

describe('markdown-toc', () => {
  it('应仅解析 h1 标题', () => {
    const markdown = `# 总览\n\n## 复盘\n\n### 细节\n\n#### 不收录`
    expect(buildMarkdownToc(markdown)).toEqual([
      { id: '总览', level: 1, text: '总览', line: 1 },
    ])
  })

  it('重复 h1 标题应自动追加序号', () => {
    const markdown = `# 计划\n# 计划\n# 计划`
    expect(buildMarkdownToc(markdown).map((item) => item.id)).toEqual(['计划', '计划-2', '计划-3'])
  })

  it('应忽略 fenced code block 内的标题', () => {
    const markdown = `# 可见\n\n\`\`\`md\n# 忽略\n## 忽略\n\`\`\`\n\n## 仍可见`
    expect(buildMarkdownToc(markdown)).toEqual([
      { id: '可见', level: 1, text: '可见', line: 1 },
    ])
  })

  it('空 h1 标题应跳过，仅收录有效 h1', () => {
    const markdown = `#\n##   \n### 有效\n# 一级有效`
    expect(buildMarkdownToc(markdown)).toEqual([{ id: '一级有效', level: 1, text: '一级有效', line: 4 }])
  })
})
