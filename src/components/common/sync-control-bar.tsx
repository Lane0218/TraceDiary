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
            data-testid="manual-pull-button"
          >
            {isPulling ? 'pulling...' : 'pull'}
          </button>
          <button
            type="button"
            className="td-btn td-sync-control-btn-primary"
            onClick={onPush}
            disabled={isActionRunning}
            data-testid="manual-sync-button"
          >
            {isPushing ? 'pushing...' : 'push'}
          </button>
        </div>
      </div>
    </section>
  )
}
