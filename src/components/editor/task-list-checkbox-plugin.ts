import { $prose } from '@milkdown/kit/utils'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'

export interface TaskListItemPosition {
  pos: number
  checked: boolean
}

const TASK_LIST_ITEM_NODE_NAME = 'list_item'
const TASK_CHECKBOX_CLASS = 'td-task-checkbox'
const TASK_CHECKBOX_POS_ATTR = 'data-task-item-pos'

function isTaskListItem(node: ProseNode): boolean {
  return node.type.name === TASK_LIST_ITEM_NODE_NAME && node.attrs.checked !== null
}

export function collectTaskListItemPositions(doc: ProseNode): TaskListItemPosition[] {
  const result: TaskListItemPosition[] = []

  doc.descendants((node, pos) => {
    if (!isTaskListItem(node)) {
      return true
    }
    result.push({
      pos,
      checked: Boolean(node.attrs.checked),
    })
    return true
  })

  return result
}

function createTaskCheckboxWidget(pos: number, checked: boolean): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = TASK_CHECKBOX_CLASS
  button.dataset.taskItemPos = String(pos)
  button.dataset.checked = checked ? 'true' : 'false'
  button.setAttribute(TASK_CHECKBOX_POS_ATTR, String(pos))
  button.setAttribute('contenteditable', 'false')
  button.setAttribute('aria-label', checked ? '取消勾选任务' : '勾选任务')
  button.setAttribute('aria-checked', checked ? 'true' : 'false')
  return button
}

function createTaskCheckboxDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = collectTaskListItemPositions(doc).map((item) =>
    Decoration.widget(
      item.pos + 1,
      () => createTaskCheckboxWidget(item.pos, item.checked),
      {
        side: -1,
        key: `td-task-checkbox-${item.pos}-${item.checked ? '1' : '0'}`,
      },
    ),
  )
  return DecorationSet.create(doc, decorations)
}

export function resolveTaskItemPosFromTarget(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const element = target.closest(`.${TASK_CHECKBOX_CLASS}`)
  if (!(element instanceof HTMLElement)) {
    return null
  }

  const rawPos = element.getAttribute(TASK_CHECKBOX_POS_ATTR)
  if (!rawPos) {
    return null
  }
  const parsed = Number.parseInt(rawPos, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

export function createToggleTaskListItemTransaction(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (!node || !isTaskListItem(node)) {
    return null
  }

  return state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    checked: node.attrs.checked !== true,
  })
}

function isEditorEditable(view: EditorView): boolean {
  return view.props.editable ? view.props.editable(view.state) : true
}

function toggleTaskItemFromEvent(view: EditorView, event: Event): boolean {
  if (!isEditorEditable(view)) {
    return false
  }

  const pos = resolveTaskItemPosFromTarget(event.target)
  if (pos === null) {
    return false
  }

  const tr = createToggleTaskListItemTransaction(view.state, pos)
  if (!tr) {
    return false
  }

  event.preventDefault()
  view.dispatch(tr)
  return true
}

const taskListCheckboxPluginKey = new PluginKey<DecorationSet>('TRACE_DIARY_TASK_LIST_CHECKBOX')

export const taskListCheckboxPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: taskListCheckboxPluginKey,
      state: {
        init: (_config, state) => createTaskCheckboxDecorations(state.doc),
        apply: (tr, oldDecorations, _oldState, newState) => {
          if (!tr.docChanged) {
            return oldDecorations
          }
          return createTaskCheckboxDecorations(newState.doc)
        },
      },
      props: {
        decorations: (state) => taskListCheckboxPluginKey.getState(state) ?? DecorationSet.empty,
        handleDOMEvents: {
          mousedown: (view, event) => toggleTaskItemFromEvent(view, event),
          click: (view, event) => {
            // 键盘触发 button click 时 detail=0；鼠标点击已在 mousedown 处理，这里避免重复切换。
            if (event.detail !== 0) {
              return false
            }
            return toggleTaskItemFromEvent(view, event)
          },
        },
      },
    }),
)
