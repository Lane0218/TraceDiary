export const REMOTE_PULL_COMPLETED_EVENT = 'trace-diary:remote-pull-completed'

export function emitRemotePullCompletedEvent(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(REMOTE_PULL_COMPLETED_EVENT))
}
