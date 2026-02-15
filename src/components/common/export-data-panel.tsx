import { useMemo, useState } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useToast } from '../../hooks/use-toast'
import { exportDiaryData, type ExportExecutionResult } from '../../services/export'

interface ExportDataPanelProps {
  auth: UseAuthResult
}

const EXPORT_CONFIRM_MESSAGE = '导出文件为明文，请妥善保管导出文件。确认立即导出吗？'

function formatExportedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

function getResultToneClass(result: ExportExecutionResult): string {
  if (result.outcome === 'success') {
    return result.failed.length > 0 ? 'is-warning' : 'is-success'
  }
  if (result.outcome === 'no_data') {
    return 'is-muted'
  }
  return 'is-danger'
}

export default function ExportDataPanel({ auth }: ExportDataPanelProps) {
  const { push: pushToast } = useToast()
  const [isExporting, setIsExporting] = useState(false)
  const [lastResult, setLastResult] = useState<ExportExecutionResult | null>(null)
  const canExport = !isExporting

  const summaryText = useMemo(() => {
    if (!lastResult) {
      return ''
    }

    if (lastResult.outcome !== 'success') {
      return lastResult.message
    }

    if (lastResult.failed.length > 0) {
      return `成功 ${lastResult.success.length} 条，失败 ${lastResult.failed.length} 条`
    }

    return `成功 ${lastResult.success.length} 条`
  }, [lastResult])

  const handleExport = async () => {
    if (auth.state.stage !== 'ready') {
      pushToast({
        kind: 'system',
        level: 'warning',
        message: '会话未解锁，请先输入主密码',
      })
      return
    }

    if (!window.confirm(EXPORT_CONFIRM_MESSAGE)) {
      return
    }

    setIsExporting(true)
    try {
      const result = await exportDiaryData()
      setLastResult(result)

      if (result.outcome === 'success') {
        pushToast({
          kind: 'system',
          level: result.failed.length > 0 ? 'warning' : 'success',
          message: result.message,
        })
        return
      }

      pushToast({
        kind: 'system',
        level: result.outcome === 'blocked' ? 'error' : 'info',
        message: result.message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败，请稍后重试'
      setLastResult({
        outcome: 'blocked',
        archiveName: '',
        exportedAt: new Date().toISOString(),
        success: [],
        failed: [],
        message: `导出失败：${message}`,
      })
      pushToast({
        kind: 'system',
        level: 'error',
        message: `导出失败：${message}`,
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <article className="td-card-primary td-panel td-export-panel" aria-label="settings-export-panel">
      <header className="space-y-2">
        <p className="td-export-eyebrow">DATA EXPORT</p>
        <h3 className="font-display text-2xl text-td-text">导出日记数据</h3>
        <p className="td-export-subtitle">
          将本地已解密日记与年度总结导出为明文 Markdown（含 <code>manifest.json</code>）。
        </p>
      </header>

      <div className="td-export-actions">
        <button
          type="button"
          className="td-btn td-export-btn"
          onClick={() => {
            void handleExport()
          }}
          disabled={!canExport}
          data-testid="settings-export-button"
        >
          {isExporting ? '正在打包导出...' : '导出明文 ZIP'}
        </button>
        <p className="td-export-warning">导出产物为明文，请仅在可信设备中存储与传输。</p>
      </div>

      {lastResult ? (
        <section
          className={`td-export-result ${getResultToneClass(lastResult)}`}
          data-testid="settings-export-result"
          aria-live="polite"
        >
          <p className="td-export-result-title">{summaryText}</p>
          {lastResult.archiveName ? (
            <p className="td-export-result-line" data-testid="settings-export-archive-name">
              文件：{lastResult.archiveName}
            </p>
          ) : null}
          <p className="td-export-result-line">时间：{formatExportedAt(lastResult.exportedAt)}</p>
          {lastResult.failed.length > 0 ? (
            <ul className="td-export-failure-list" data-testid="settings-export-failed-list">
              {lastResult.failed.map((item) => (
                <li key={`${item.entryId}-${item.reason}`} data-testid="settings-export-failed-item">
                  {item.entryId}：{item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}
