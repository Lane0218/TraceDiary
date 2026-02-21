#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const nowIso = new Date().toISOString()
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const todoPath = resolve(repoRoot, 'TODO.md')
const tasksDir = resolve(repoRoot, 'todo/tasks')
const boardPath = resolve(repoRoot, 'todo/board.html')

function splitTableRow(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null
  }

  const cells = []
  let current = ''
  let inCode = false

  for (let i = 1; i < trimmed.length - 1; i += 1) {
    const ch = trimmed[i]
    if (ch === '`') {
      inCode = !inCode
      current += ch
      continue
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }

  cells.push(current.trim())
  return cells
}

function unwrapCode(raw) {
  const value = raw.trim()
  if (value.startsWith('`') && value.endsWith('`') && value.length >= 2) {
    return value.slice(1, -1)
  }
  return value
}

function parseModuleHeading(rawHeading) {
  const heading = rawHeading.trim()
  const matched = heading.match(/^([0-9]+(?:\.[0-9]+)*)\s+(.+)$/)
  if (!matched) {
    return {
      module_key: 'unknown',
      module_name: heading,
    }
  }
  return {
    module_key: matched[1],
    module_name: matched[2].trim(),
  }
}

function extractRelatedFiles(filesCell) {
  const files = []
  const regex = /`([^`]+)`/g
  let matched = regex.exec(filesCell)
  while (matched) {
    files.push(matched[1].trim())
    matched = regex.exec(filesCell)
  }
  return files
}

function createTaskUid(displayId, title, moduleKey) {
  const digest = createHash('sha1')
    .update(`${displayId}|${title}|${moduleKey}`)
    .digest('hex')
    .slice(0, 20)
  return `td_${digest}`
}

function buildBoardHtml(tasks, generatedAt) {
  const payloadJson = JSON.stringify(
    {
      generatedAt,
      taskCount: tasks.length,
      tasks,
    },
    null,
    2
  )
  const payloadBase64 = Buffer.from(payloadJson, 'utf8').toString('base64')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TraceDiary Agent 任务看板</title>
    <style>
      :root {
        --bg: #f6f4ee;
        --panel: rgba(255, 255, 255, 0.88);
        --ink: #1e2329;
        --muted: #5c6672;
        --line: rgba(30, 35, 41, 0.16);
        --accent: #0f766e;
        --done: #1d4ed8;
        --doing: #b45309;
        --todo: #475569;
        --blocked: #be123c;
        --shadow: 0 16px 40px rgba(30, 35, 41, 0.12);
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 8% 10%, rgba(15, 118, 110, 0.16), transparent 36%),
          radial-gradient(circle at 92% 84%, rgba(29, 78, 216, 0.14), transparent 35%),
          var(--bg);
      }
      .wrap {
        max-width: 1320px;
        margin: 0 auto;
        padding: 24px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: var(--shadow);
        padding: 20px 24px;
      }
      .hero h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0.02em;
      }
      .meta {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
      }
      .toolbar {
        margin-top: 18px;
        display: grid;
        grid-template-columns: 1.6fr 0.9fr;
        gap: 12px;
      }
      .toolbar input,
      .toolbar select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.92);
        color: var(--ink);
        padding: 10px 12px;
        font-size: 14px;
      }
      .stats {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      .card {
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.85);
        border-radius: 12px;
        padding: 10px 12px;
      }
      .card .label {
        display: block;
        color: var(--muted);
        font-size: 12px;
      }
      .card .value {
        margin-top: 4px;
        font-size: 24px;
        font-weight: 700;
      }
      .panel {
        margin-top: 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.9);
        overflow: hidden;
        box-shadow: var(--shadow);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th,
      td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
        text-align: left;
      }
      thead th {
        position: sticky;
        top: 0;
        background: rgba(244, 241, 233, 0.95);
        z-index: 2;
        font-size: 12px;
        color: var(--muted);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      tbody tr:hover {
        background: rgba(15, 118, 110, 0.06);
      }
      .status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        letter-spacing: 0.03em;
      }
      .status-DONE {
        background: rgba(29, 78, 216, 0.12);
        color: var(--done);
      }
      .status-DOING {
        background: rgba(180, 83, 9, 0.14);
        color: var(--doing);
      }
      .status-TODO {
        background: rgba(71, 85, 105, 0.14);
        color: var(--todo);
      }
      .status-BLOCKED {
        background: rgba(190, 18, 60, 0.14);
        color: var(--blocked);
      }
      .tiny {
        font-size: 12px;
        color: var(--muted);
      }
      .mono {
        font-family: "JetBrains Mono", "SFMono-Regular", Menlo, monospace;
        font-size: 12px;
      }
      .scroll {
        max-height: 78vh;
        overflow: auto;
      }
      @media (max-width: 960px) {
        .toolbar {
          grid-template-columns: 1fr;
        }
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="hero">
        <h1>TraceDiary Agent 任务看板</h1>
        <p class="meta" id="meta"></p>
        <div class="toolbar">
          <input id="searchInput" placeholder="搜索：ID / 任务 / 状态" />
          <select id="statusSelect"></select>
        </div>
        <div class="stats">
          <div class="card"><span class="label">总任务</span><span class="value" id="statTotal">0</span></div>
          <div class="card"><span class="label">DONE</span><span class="value" id="statDone">0</span></div>
          <div class="card"><span class="label">DOING</span><span class="value" id="statDoing">0</span></div>
          <div class="card"><span class="label">TODO</span><span class="value" id="statTodo">0</span></div>
          <div class="card"><span class="label">BLOCKED</span><span class="value" id="statBlocked">0</span></div>
        </div>
      </section>
      <section class="panel">
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th style="width: 14%">ID</th>
                <th style="width: 12%">状态</th>
                <th style="width: 54%">任务</th>
                <th style="width: 20%">完成记录</th>
              </tr>
            </thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      const payloadBytes = Uint8Array.from(atob('${payloadBase64}'), (ch) => ch.charCodeAt(0))
      const payload = JSON.parse(new TextDecoder('utf-8').decode(payloadBytes))
      const allTasks = payload.tasks.slice().sort((a, b) => a.order - b.order)

      const searchInput = document.getElementById('searchInput')
      const statusSelect = document.getElementById('statusSelect')
      const tableBody = document.getElementById('tableBody')
      const meta = document.getElementById('meta')

      const statTotal = document.getElementById('statTotal')
      const statDone = document.getElementById('statDone')
      const statDoing = document.getElementById('statDoing')
      const statTodo = document.getElementById('statTodo')
      const statBlocked = document.getElementById('statBlocked')

      function formatBeijingTime(raw) {
        const parsed = new Date(raw)
        if (Number.isNaN(parsed.getTime())) {
          return raw
        }
        return parsed
          .toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
          .replaceAll('/', '-')
      }

      meta.textContent = '生成时间（北京时间）：' + formatBeijingTime(payload.generatedAt)

      function escapeHtml(raw) {
        return raw
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;')
      }

      function fillFilters() {
        const statuses = ['ALL', 'DONE', 'DOING', 'TODO', 'BLOCKED']

        statusSelect.innerHTML = statuses
          .map((status) => '<option value="' + status + '">' + (status === 'ALL' ? '全部状态' : status) + '</option>')
          .join('')
      }

      function updateStats(tasks) {
        const counts = { DONE: 0, DOING: 0, TODO: 0, BLOCKED: 0 }
        for (const task of tasks) {
          if (counts[task.status] !== undefined) {
            counts[task.status] += 1
          }
        }
        statTotal.textContent = String(tasks.length)
        statDone.textContent = String(counts.DONE)
        statDoing.textContent = String(counts.DOING)
        statTodo.textContent = String(counts.TODO)
        statBlocked.textContent = String(counts.BLOCKED)
      }

      function renderTable(tasks) {
        tableBody.innerHTML = tasks
          .map((task) => {
            const doneRecord = task.done_record || '-'
            return [
              '<tr>',
              '<td class="mono">' + escapeHtml(task.display_id) + '</td>',
              '<td><span class="status status-' + escapeHtml(task.status) + '">' + escapeHtml(task.status) + '</span></td>',
              '<td>' + escapeHtml(task.title) + '</td>',
              '<td class="mono">' + escapeHtml(doneRecord) + '</td>',
              '</tr>',
            ].join('')
          })
          .join('')
      }

      function applyFilters() {
        const q = searchInput.value.trim().toLowerCase()
        const selectedStatus = statusSelect.value

        const filtered = allTasks.filter((task) => {
          if (selectedStatus !== 'ALL' && task.status !== selectedStatus) {
            return false
          }
          if (!q) {
            return true
          }
          const haystack = [
            task.display_id,
            task.title,
            task.status,
            task.done_record,
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })

        updateStats(filtered)
        renderTable(filtered)
      }

      fillFilters()
      applyFilters()

      searchInput.addEventListener('input', applyFilters)
      statusSelect.addEventListener('change', applyFilters)
    </script>
  </body>
</html>
`
}

function main() {
  const boardOnly = process.argv.includes('--board-only')
  const raw = readFileSync(todoPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const tasks = []
  let order = 1
  let currentModule = {
    module_key: 'unknown',
    module_name: '未分类',
  }

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]
    const headingMatched = line.match(/^###\s+(.+)$/)
    if (headingMatched) {
      currentModule = parseModuleHeading(headingMatched[1])
      continue
    }

    if (!line.trim().startsWith('| `TD-')) {
      continue
    }

    const cells = splitTableRow(line)
    if (!cells || cells.length < 7) {
      continue
    }

    const displayId = unwrapCode(cells[0])
    const status = unwrapCode(cells[1]).toUpperCase()
    const title = cells[2].trim()
    const acceptance = cells[3].trim()
    const relatedFilesRaw = cells[4].trim()
    const testRecord = cells[5].trim()
    const doneRecord = unwrapCode(cells[6]).trim()
    const idParts = displayId.split('-')
    const idPrefix = idParts.length > 1 ? idParts[1] : 'UNSET'
    const taskUid = createTaskUid(displayId, title, currentModule.module_key)
    const moduleLabel = `${currentModule.module_key} ${currentModule.module_name}`

    const task = {
      task_uid: taskUid,
      display_id: displayId,
      id_prefix: idPrefix,
      module_key: currentModule.module_key,
      module_name: currentModule.module_name,
      module_label: moduleLabel,
      order,
      status,
      title,
      acceptance,
      related_files: extractRelatedFiles(relatedFilesRaw),
      test_record: testRecord,
      done_record: doneRecord,
      source: {
        file: 'TODO.md',
        line: idx + 1,
      },
      version: 1,
      updated_at: nowIso,
    }

    tasks.push(task)
    order += 1
  }

  if (!boardOnly) {
    mkdirSync(tasksDir, { recursive: true })
    for (const task of tasks) {
      const path = resolve(tasksDir, `${task.task_uid}.json`)
      writeFileSync(path, `${JSON.stringify(task, null, 2)}\n`, 'utf8')
    }
  }

  const boardHtml = buildBoardHtml(tasks, nowIso)
  mkdirSync(resolve(repoRoot, 'todo'), { recursive: true })
  writeFileSync(boardPath, boardHtml, 'utf8')

  const output = boardOnly
    ? `看板重建完成：${tasks.length} 条任务（未改写 tasks 目录）\n看板文件：${boardPath}\n`
    : `迁移完成：${tasks.length} 条任务\n输出目录：${tasksDir}\n看板文件：${boardPath}\n`
  process.stdout.write(output)
}

main()
