import { useToast, type ToastLevel } from '../../hooks/use-toast'

const LEVEL_CLASS_BY_LEVEL: Record<ToastLevel, string> = {
  success: 'td-toast-success',
  info: 'td-toast-info',
  warning: 'td-toast-warning',
  error: 'td-toast-error',
}

export default function ToastCenter() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) {
    return null
  }

  return (
    <section className="td-toast-center" aria-live="polite" aria-atomic="true" data-testid="toast-center">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          role="status"
          data-testid={`toast-${toast.kind}`}
          className={`td-toast-card ${LEVEL_CLASS_BY_LEVEL[toast.level]}`}
        >
          <header className="td-toast-header">
            <strong className="td-toast-kind">{toast.kind}</strong>
            <button
              type="button"
              onClick={() => dismiss(toast.kind)}
              aria-label="关闭提示"
              className="td-toast-dismiss"
            >
              ×
            </button>
          </header>
          {toast.title ? <p className="td-toast-title">{toast.title}</p> : null}
          <p className={`td-toast-message ${toast.title ? 'td-toast-message-with-title' : ''}`}>{toast.message}</p>
        </article>
      ))}
    </section>
  )
}
