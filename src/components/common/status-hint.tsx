interface StatusHintProps {
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

export default function StatusHint({ isLoading, isSaving, error }: StatusHintProps) {
  if (isLoading) {
    return <span className="td-status-pill td-status-muted">加载中</span>
  }

  if (error) {
    return <span className="td-status-pill td-status-danger">本地保存异常</span>
  }

  if (isSaving) {
    return <span className="td-status-pill td-status-warning">保存中</span>
  }

  return <span className="td-status-pill td-status-success">本地已保存</span>
}
