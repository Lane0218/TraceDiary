import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type ToastKind = 'pull' | 'push' | 'system'
export type ToastLevel = 'success' | 'info' | 'warning' | 'error'

export interface ToastInput {
  kind: ToastKind
  level: ToastLevel
  title?: string
  message: string
}

export interface ToastMessage extends ToastInput {
  id: string
  createdAt: number
  expiresAt: number
}

interface ToastContextValue {
  toasts: ToastMessage[]
  push: (input: ToastInput) => ToastMessage
  dismiss: (kind: ToastKind) => void
  clearAll: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS: Record<ToastLevel, number> = {
  success: 2200,
  info: 2200,
  warning: 3200,
  error: 3200,
}

function createToastId(kind: ToastKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeByKind = useCallback((kind: ToastKind) => {
    setToasts((previous) => previous.filter((toast) => toast.kind !== kind))
  }, [])

  const dismiss = useCallback((kind: ToastKind) => {
    removeByKind(kind)
  }, [removeByKind])

  const push = useCallback(
    (input: ToastInput): ToastMessage => {
      const createdAt = Date.now()
      const nextToast: ToastMessage = {
        ...input,
        id: createToastId(input.kind),
        createdAt,
        expiresAt: createdAt + AUTO_DISMISS_MS[input.level],
      }

      setToasts((previous) => [nextToast, ...previous.filter((toast) => toast.kind !== input.kind)])
      return nextToast
    },
    [],
  )

  const clearAll = useCallback(() => {
    setToasts([])
  }, [])

  useEffect(() => {
    const timers = toasts.map((toast) => {
      const remaining = Math.max(0, toast.expiresAt - Date.now())
      return window.setTimeout(() => {
        setToasts((previous) => previous.filter((item) => item.id !== toast.id))
      }, remaining)
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [toasts])

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      clearAll,
    }),
    [clearAll, dismiss, push, toasts],
  )

  return createElement(ToastContext.Provider, { value }, children)
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用')
  }

  return context
}
