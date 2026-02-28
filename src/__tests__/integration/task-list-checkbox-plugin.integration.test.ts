import { Schema, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'
import {
  collectTaskListItemPositions,
  createToggleTaskListItemTransaction,
  resolveTaskItemPosFromTarget,
} from '../../components/editor/task-list-checkbox-plugin'

const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: {
      group: 'inline',
    },
    bullet_list: {
      group: 'block',
      content: 'list_item+',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    list_item: {
      content: 'paragraph block*',
      attrs: {
        checked: { default: null },
      },
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
  },
})

function createParagraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function createTaskItem(text: string, checked: boolean) {
  return schema.nodes.list_item.create({ checked }, [createParagraph(text)])
}

function createPlainItem(text: string, blocks: ProseNode[] = []) {
  return schema.nodes.list_item.create({ checked: null }, [createParagraph(text), ...blocks])
}

function createNestedTaskListDoc() {
  const nestedTasks = schema.nodes.bullet_list.create(null, [
    createTaskItem('快乐', true),
    createTaskItem('悲伤', false),
    createTaskItem('愤怒', false),
  ])
  const moodItem = createPlainItem('心情', [nestedTasks])
  const rootList = schema.nodes.bullet_list.create(null, [moodItem])
  return schema.nodes.doc.create(null, [rootList])
}

describe('task-list-checkbox-plugin', () => {
  it('应能收集嵌套层级中的任务项位置与勾选状态', () => {
    const doc = createNestedTaskListDoc()
    const result = collectTaskListItemPositions(doc)

    expect(result).toHaveLength(3)
    expect(result.map((item) => item.checked)).toEqual([true, false, false])
    expect(result.every((item) => item.pos >= 0)).toBe(true)
  })

  it('应只为任务项构建 checked 切换事务', () => {
    const state = EditorState.create({
      schema,
      doc: createNestedTaskListDoc(),
    })
    const [firstTask] = collectTaskListItemPositions(state.doc)

    const firstTaskToggle = createToggleTaskListItemTransaction(state, firstTask.pos)
    expect(firstTaskToggle).not.toBeNull()
    expect(firstTaskToggle?.doc.nodeAt(firstTask.pos)?.attrs.checked).toBe(false)

    let plainItemPos = -1
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && node.attrs.checked === null) {
        plainItemPos = pos
        return false
      }
      return true
    })

    expect(plainItemPos).toBeGreaterThanOrEqual(0)
    const plainItemToggle = createToggleTaskListItemTransaction(state, plainItemPos)
    expect(plainItemToggle).toBeNull()
  })

  it('应能从点击目标解析任务项位置', () => {
    const button = document.createElement('button')
    button.className = 'td-task-checkbox'
    button.setAttribute('data-task-item-pos', '42')
    const icon = document.createElement('span')
    button.appendChild(icon)

    expect(resolveTaskItemPosFromTarget(button)).toBe(42)
    expect(resolveTaskItemPosFromTarget(icon)).toBe(42)
    expect(resolveTaskItemPosFromTarget(document.createElement('div'))).toBeNull()

    button.setAttribute('data-task-item-pos', '-1')
    expect(resolveTaskItemPosFromTarget(icon)).toBeNull()
  })
})
