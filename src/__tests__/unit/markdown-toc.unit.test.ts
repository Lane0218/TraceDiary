import { describe, expect, it } from 'vitest'
import { buildMarkdownToc } from '../../utils/markdown-toc'

describe('markdown-toc', () => {
  it('应按顺序解析 h1-h3 标题', () => {
    const markdown = `# 总览\n\n## 复盘\n\n### 细节\n\n#### 不收录`
    expect(buildMarkdownToc(markdown)).toEqual([
      { id: '总览', level: 1, text: '总览', line: 1 },
      { id: '复盘', level: 2, text: '复盘', line: 3 },
      { id: '细节', level: 3, text: '细节', line: 5 },
    ])
  })

  it('重复标题应自动追加序号', () => {
    const markdown = `# 计划\n## 计划\n### 计划`
    expect(buildMarkdownToc(markdown).map((item) => item.id)).toEqual(['计划', '计划-2', '计划-3'])
  })

  it('应忽略 fenced code block 内的标题', () => {
    const markdown = `# 可见\n\n\`\`\`md\n# 忽略\n## 忽略\n\`\`\`\n\n## 仍可见`
    expect(buildMarkdownToc(markdown)).toEqual([
      { id: '可见', level: 1, text: '可见', line: 1 },
      { id: '仍可见', level: 2, text: '仍可见', line: 8 },
    ])
  })

  it('空标题与仅井号标题应跳过', () => {
    const markdown = `#\n##   \n### 有效`
    expect(buildMarkdownToc(markdown)).toEqual([{ id: '有效', level: 3, text: '有效', line: 3 }])
  })
})
