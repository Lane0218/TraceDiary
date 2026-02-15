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
  isPulling: boolean
  isPushing: boolean
  onPull: () => void
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
  isPulling,
  isPushing,
  onPull,
  onPush,
}: SyncControlBarProps) {
  const isActionRunning = isPulling || isPushing
  const rootRef = useRef<HTMLElement | null>(null)
  const [isDetailsPinned, setIsDetailsPinned] = useState(false)
  const [isHoveringDetails, setIsHoveringDetails] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const hasSuccess = pullStatus === 'success' || pushStatus === 'success'
  const hasError = pullStatus === 'error' || pushStatus === 'error'
  const summaryLabel = isActionRunning ? '同步中' : hasSuccess ? '已同步' : '未同步'
  const summaryToneClass = isActionRunning
    ? 'td-status-warning'
    : hasSuccess
      ? 'td-status-success'
      : hasError
        ? 'td-status-warning'
        : 'td-status-muted'
  const isDetailsOpen = isDetailsPinned || isHoveringDetails || isFocusWithin

  useEffect(() => {
    if (!isDetailsPinned) {
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
        setIsDetailsPinned(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDetailsPinned(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isDetailsPinned])

  return (
    <section
      ref={rootRef}
      className="td-sync-control"
      aria-label="sync-control-bar"
      onMouseEnter={() => setIsHoveringDetails(true)}
      onMouseLeave={() => setIsHoveringDetails(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusWithin(false)
        }
      }}
    >
      <div className="td-sync-control-bar">
        <div className="td-sync-control-main">
          <span className="td-sync-control-caption">同步状态</span>
          <div className="td-sync-control-hint">{statusHint}</div>
          <button
            type="button"
            className="td-sync-summary-trigger"
            aria-label="查看同步明细"
            aria-expanded={isDetailsOpen}
            onClick={() => setIsDetailsPinned((prev) => !prev)}
          >
            <span className={`td-status-pill ${summaryToneClass}`} data-testid="sync-summary-pill">
              {summaryLabel}
            </span>
            <span className={`td-sync-summary-chevron ${isDetailsOpen ? 'is-open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>
        </div>

        <div className="td-sync-control-actions">
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
          <span className="td-sync-details-key">Pull</span>
          <span className={`td-status-pill ${pullStatusToneClass}`} data-testid="pull-status-pill">
            {pullStatusLabel}
          </span>
        </div>
        <div className="td-sync-details-row">
          <span className="td-sync-details-key">Push</span>
          <span className={`td-status-pill ${pushStatusToneClass}`} data-testid="push-status-pill">
            {pushStatusLabel}
          </span>
        </div>
      </div>
    </section>
  )
}
