import { useEffect, useState } from 'react'

interface StatusHintProps {
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

const SLOW_SAVE_HINT_DELAY_MS = 400

export default function StatusHint({ isLoading, isSaving, error }: StatusHintProps) {
  const [showSlowSavingHint, setShowSlowSavingHint] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowSavingHint(isSaving)
    }, isSaving ? SLOW_SAVE_HINT_DELAY_MS : 0)

    return () => {
      clearTimeout(timer)
    }
  }, [isSaving])

  if (isLoading) {
    return <span className="td-status-pill td-status-muted">加载中</span>
  }

  if (error) {
    return <span className="td-status-pill td-status-danger">本地保存异常</span>
  }

  if (isSaving && showSlowSavingHint) {
    return <span className="td-status-pill td-status-warning">保存中</span>
  }

  return null
}
