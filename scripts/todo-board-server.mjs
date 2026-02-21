#!/usr/bin/env node

import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const boardPath = resolve(repoRoot, 'todo/board.html')
const tasksDir = resolve(repoRoot, 'todo/tasks')

const host = process.env.TODO_BOARD_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.TODO_BOARD_PORT || '4310', 10)

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function byOrderThenId(a, b) {
  const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER
  const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) {
    return aOrder - bOrder
  }

  const aId = String(a.display_id || '')
  const bId = String(b.display_id || '')
  return aId.localeCompare(bId, 'zh-CN')
}

async function loadTasksPayload() {
  const entries = await readdir(tasksDir, { withFileTypes: true })
  const tasks = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const absolutePath = resolve(tasksDir, entry.name)
    try {
      const raw = await readFile(absolutePath, 'utf8')
      const parsed = JSON.parse(raw)
      tasks.push(parsed)
    } catch (error) {
      // 忽略损坏文件，保证看板服务可用。
    }
  }

  tasks.sort(byOrderThenId)

  return {
    generatedAt: new Date().toISOString(),
    taskCount: tasks.length,
    tasks,
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)
  const pathname = requestUrl.pathname

  if (pathname === '/healthz') {
    sendText(res, 200, 'ok')
    return
  }

  if (pathname === '/api/tasks') {
    try {
      const payload = await loadTasksPayload()
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 500, {
        error: 'failed_to_load_tasks',
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (pathname === '/' || pathname === '/board' || pathname === '/todo/board.html') {
    try {
      const html = await readFile(boardPath, 'utf8')
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(html)
    } catch (error) {
      sendText(res, 500, `failed_to_read_board_html: ${error instanceof Error ? error.message : String(error)}`)
    }
    return
  }

  sendText(res, 404, 'not found')
})

server.listen(port, host, () => {
  process.stdout.write(`todo board server listening at http://${host}:${port}\n`)
})
