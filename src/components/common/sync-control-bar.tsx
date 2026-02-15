import type { ReactNode } from 'react'

interface SyncControlBarProps {
  statusHint: ReactNode
  pullStatusLabel: string
  pushStatusLabel: string
  pullStatusToneClass: string
  pushStatusToneClass: string
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
  isPulling,
  isPushing,
  onPull,
  onPush,
}: SyncControlBarProps) {
  const isActionRunning = isPulling || isPushing

  return (
    <section className="td-sync-control" aria-label="sync-control-bar">
      <div className="td-sync-control-bar">
        <div className="td-sync-control-main">
          <span className="td-sync-control-caption">同步状态</span>
          <div className="td-sync-control-hint">{statusHint}</div>
          <span className={`td-status-pill ${pullStatusToneClass}`} data-testid="pull-status-pill">
            {pullStatusLabel}
          </span>
          <span className={`td-status-pill ${pushStatusToneClass}`} data-testid="push-status-pill">
            {pushStatusLabel}
          </span>
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
    </section>
  )
}
