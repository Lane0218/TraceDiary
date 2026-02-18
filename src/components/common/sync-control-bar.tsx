import { useEffect, useRef, useState, type ReactNode } from 'react'

type SyncActionStatus = 'idle' | 'running' | 'success' | 'error'

interface SyncControlBarProps {
  statusHint: ReactNode
  pullStatusLabel: string
  pushStatusLabel: string
  pullStatusToneClass: string
  pushStatusToneClass: string
  pullStatus: SyncActionStatus
  pushStatus: SyncActionStatus
  pullFailureReason: string | null
  pushFailureReason: string | null
  isPulling: boolean
  isPushing: boolean
  onPull: () => void
  onPullCurrent?: () => void
  onPush: () => void
}

export default function SyncControlBar({
  statusHint,
  pullStatusLabel,
  pushStatusLabel,
  pullStatusToneClass,
  pushStatusToneClass,
  pullStatus,
  pushStatus,
  pullFailureReason,
  pushFailureReason,
  isPulling,
  isPushing,
  onPull,
  onPullCurrent,
  onPush,
}: SyncControlBarProps) {
  const isActionRunning = isPulling || isPushing
  const rootRef = useRef<HTMLElement | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isPullMenuOpen, setIsPullMenuOpen] = useState(false)
  const hasSuccess = pullStatus === 'success' || pushStatus === 'success'
  const hasError = pullStatus === 'error' || pushStatus === 'error'
  const summaryStatus: SyncActionStatus = isActionRunning ? 'running' : hasError ? 'error' : hasSuccess ? 'success' : 'idle'
  const isPullMenuVisible = isPullMenuOpen && !isActionRunning
  const summaryLabel = summaryStatus === 'running' ? '同步中' : summaryStatus === 'success' ? '已同步' : '未同步'
  const summaryToneClass =
    summaryStatus === 'running'
      ? 'td-status-warning'
      : summaryStatus === 'success'
        ? 'td-status-success'
        : summaryStatus === 'error'
          ? 'td-status-danger'
          : 'td-status-muted'

  useEffect(() => {
    if (!isDetailsOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (!rootRef.current.contains(target)) {
        setIsDetailsOpen(false)
        setIsPullMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDetailsOpen(false)
        setIsPullMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isDetailsOpen])

  return (
    <section ref={rootRef} className="td-sync-control" aria-label="sync-control-bar">
      <div className="td-sync-control-bar">
        <div className="td-sync-control-main">
          <div className="td-sync-control-hint">{statusHint}</div>
          <button
            type="button"
            className="td-sync-summary-trigger"
            aria-label="查看同步明细"
            aria-expanded={isDetailsOpen}
            onClick={() => setIsDetailsOpen((prev) => !prev)}
          >
            <span
              className={`td-status-pill ${summaryToneClass}`}
              data-status={summaryStatus}
              data-testid="sync-summary-pill"
            >
              {summaryLabel}
            </span>
            <span className={`td-sync-summary-chevron ${isDetailsOpen ? 'is-open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>
        </div>

        <div className="td-sync-control-actions">
          {onPullCurrent ? (
            <div className="td-sync-pull-split">
              <button
                type="button"
                className="td-btn td-sync-control-btn-secondary td-sync-pull-main-btn"
                onClick={onPull}
                disabled={isActionRunning}
                aria-busy={isPulling}
                data-testid="manual-pull-button"
              >
                <span className={`td-sync-control-btn-label ${isPulling ? 'is-running' : ''}`}>
                  {isPulling ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
                  <span>pull 全部</span>
                </span>
              </button>
              <button
                type="button"
                className="td-btn td-sync-control-btn-secondary td-sync-pull-menu-btn"
                aria-label="拉取动作菜单"
                aria-expanded={isPullMenuVisible}
                onClick={() => setIsPullMenuOpen((prev) => !prev)}
                disabled={isActionRunning}
                data-testid="manual-pull-menu-trigger"
              >
                ▾
              </button>
              <div
                className={`td-sync-pull-menu ${isPullMenuVisible ? 'is-open' : ''}`}
                aria-hidden={!isPullMenuVisible}
                data-testid="manual-pull-menu"
              >
                <button
                  type="button"
                  className="td-sync-pull-menu-item"
                  onClick={() => {
                    setIsPullMenuOpen(false)
                    onPullCurrent()
                  }}
                  disabled={isActionRunning}
                  data-testid="manual-pull-current-button"
                >
                  pull 当前条目
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="td-btn td-sync-control-btn-secondary"
              onClick={onPull}
              disabled={isActionRunning}
              aria-busy={isPulling}
              data-testid="manual-pull-button"
            >
              <span className={`td-sync-control-btn-label ${isPulling ? 'is-running' : ''}`}>
                {isPulling ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
                <span>pull</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className="td-btn td-sync-control-btn-primary"
            onClick={onPush}
            disabled={isActionRunning}
            aria-busy={isPushing}
            data-testid="manual-sync-button"
          >
            <span className={`td-sync-control-btn-label ${isPushing ? 'is-running' : ''}`}>
              {isPushing ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
              <span>push</span>
            </span>
          </button>
        </div>
      </div>

      <div
        className={`td-sync-details-popover ${isDetailsOpen ? 'is-open' : ''}`}
        aria-hidden={!isDetailsOpen}
        data-testid="sync-details-popover"
      >
        <div className="td-sync-details-row">
          <span className={`td-status-pill ${pullStatusToneClass}`} data-status={pullStatus} data-testid="pull-status-pill">
            {pullStatusLabel}
          </span>
          {pullStatus === 'error' && pullFailureReason ? (
            <p className="td-sync-details-reason" data-testid="pull-status-reason">
              {pullFailureReason}
            </p>
          ) : null}
        </div>
        <div className="td-sync-details-row">
          <span className={`td-status-pill ${pushStatusToneClass}`} data-status={pushStatus} data-testid="push-status-pill">
            {pushStatusLabel}
          </span>
          {pushStatus === 'error' && pushFailureReason ? (
            <p className="td-sync-details-reason" data-testid="push-status-reason">
              {pushFailureReason}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
