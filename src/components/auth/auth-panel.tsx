import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useToast } from '../../hooks/use-toast'
import {
  INITIAL_AUTH_FORM_STATE,
  createAuthSubmitModel,
  type AuthFormState,
} from './auth-form-model'
import { AuthFormField } from './auth-form-shared'

export type AuthPanelVariant = 'modal' | 'embedded'

interface AuthPanelProps {
  auth: UseAuthResult
  variant: AuthPanelVariant
  canClose?: boolean
  onClose?: () => void
}

type SyncCheckStatus = 'unconfigured' | 'checking' | 'success' | 'warning' | 'error'

interface SyncCheckSnapshot {
  status: SyncCheckStatus
  title: string
  message: string
  updatedAt: string | null
}

function getStageTitle(stage: string): { title: string; subtitle: string; badge: string } {
  switch (stage) {
    case 'needs-setup':
      return {
        title: '首次配置',
        subtitle: '首次使用请配置 Gitee 仓库、Token 与主密码。',
        badge: 'SETUP',
      }
    case 'needs-unlock':
      return {
        title: '解锁会话',
        subtitle: '输入主密码后进入日记。',
        badge: 'UNLOCK',
      }
    case 'needs-token-refresh':
      return {
        title: '更新 Token',
        subtitle: '当前 Token 不可用，请输入新 Token 覆盖本地密文。',
        badge: 'TOKEN',
      }
    case 'checking':
      return {
        title: '处理中',
        subtitle: '正在执行认证流程，请稍候。',
        badge: 'CHECKING',
      }
    default:
      return {
        title: '设置',
        subtitle: '更新仓库连接与凭证，保存后会立即校验。',
        badge: 'READY',
      }
  }
}

function buildRepoInput(state: UseAuthResult['state']): string {
  if (!state.config) {
    return ''
  }
  return `${state.config.giteeOwner}/${state.config.giteeRepoName}`
}

function formatStatusTime(value: string | null): string | null {
  if (!value) {
    return null
  }

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }
  return timestamp.toLocaleString('zh-CN', { hour12: false })
}

function createDefaultSyncCheckSnapshot(state: UseAuthResult['state']): SyncCheckSnapshot {
  switch (state.stage) {
    case 'needs-setup':
      return {
        status: 'unconfigured',
        title: '未完成配置',
        message: '请先填写仓库、Token 与主密码后初始化。',
        updatedAt: null,
      }
    case 'needs-unlock':
      return {
        status: 'warning',
        title: '会话未解锁',
        message: '请先输入主密码解锁后再执行配置校验。',
        updatedAt: null,
      }
    case 'needs-token-refresh':
      return {
        status: 'error',
        title: 'Token 不可用',
        message: state.errorMessage ?? '请更新 Token 后再执行配置校验。',
        updatedAt: null,
      }
    case 'checking':
      return {
        status: 'checking',
        title: '校验中',
        message: '正在处理认证或配置校验，请稍候。',
        updatedAt: null,
      }
    default:
      if (state.errorMessage) {
        return {
          status: 'error',
          title: '校验失败',
          message: state.errorMessage,
          updatedAt: null,
        }
      }
      return {
        status: 'success',
        title: '配置就绪',
        message: '当前同步配置可用，修改后会立即进行校验。',
        updatedAt: null,
      }
  }
}

function buildSyncCheckSnapshotFromSubmitResult(
  result: Awaited<ReturnType<UseAuthResult['updateConnectionSettings']>>,
): SyncCheckSnapshot {
  if (!result.ok) {
    return {
      status: 'error',
      title: '校验失败',
      message: result.message,
      updatedAt: result.checkedAt,
    }
  }

  if (result.cloudSaveStatus === 'error') {
    return {
      status: 'warning',
      title: '校验成功（云端失败）',
      message: result.cloudSaveMessage ?? '本地已保存，但云端回写失败，请稍后重试。',
      updatedAt: result.checkedAt,
    }
  }

  if (result.cloudSaveStatus === 'not_applicable') {
    return {
      status: 'success',
      title: '校验成功（仅本地）',
      message: result.cloudSaveMessage ?? '已完成本地保存，当前未执行云端回写。',
      updatedAt: result.checkedAt,
    }
  }

  return {
    status: 'success',
    title: '校验成功',
    message: result.cloudSaveMessage ?? '同步配置校验通过，已保存并同步到云端。',
    updatedAt: result.checkedAt,
  }
}

export default function AuthPanel({ auth, variant, canClose = false, onClose }: AuthPanelProps) {
  const { push: pushToast } = useToast()
  const [form, setForm] = useState<AuthFormState>(INITIAL_AUTH_FORM_STATE)
  const [lastSyncCheckSnapshot, setLastSyncCheckSnapshot] = useState<SyncCheckSnapshot | null>(null)
  const {
    state,
    getMasterPasswordError,
    initializeFirstTime,
    unlockWithMasterPassword,
    updateTokenCiphertext,
    updateConnectionSettings,
  } = auth
  const submitModel = createAuthSubmitModel(
    {
      initializeFirstTime,
      unlockWithMasterPassword,
      updateTokenCiphertext,
      updateConnectionSettings,
    },
    form,
  )

  const stageCopy = useMemo(() => getStageTitle(state.stage), [state.stage])
  const syncCheckSnapshot = useMemo(
    () => (state.stage === 'ready' ? lastSyncCheckSnapshot ?? createDefaultSyncCheckSnapshot(state) : createDefaultSyncCheckSnapshot(state)),
    [lastSyncCheckSnapshot, state],
  )
  const syncCheckSnapshotTimeLabel = useMemo(
    () => formatStatusTime(syncCheckSnapshot.updatedAt),
    [syncCheckSnapshot.updatedAt],
  )
  const passwordHint = useMemo(
    () => getMasterPasswordError(form.masterPassword),
    [form.masterPassword, getMasterPasswordError],
  )
  const isModal = variant === 'modal'
  const showReadyPasswordInput = form.readyToken.trim().length > 0
  const primaryActionButtonClass = `td-btn ${isModal ? 'td-btn-primary' : 'td-btn-primary-ink'} w-full sm:w-auto`
  const syncCheckToneClass = useMemo(() => {
    switch (syncCheckSnapshot.status) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
      case 'warning':
        return 'border-amber-200 bg-amber-50/70 text-amber-700'
      case 'error':
        return 'border-red-200 bg-red-50 text-red-700'
      case 'checking':
        return 'border-slate-300 bg-slate-100 text-slate-700'
      default:
        return 'border-td-line bg-td-surface-soft text-td-muted'
    }
  }, [syncCheckSnapshot.status])

  useEffect(() => {
    if (state.stage !== 'ready' || !state.config) {
      return
    }
    const nextReadyRepoInput = buildRepoInput(state)
    const nextReadyRepoBranch = state.config.giteeBranch ?? 'master'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ready 配置变化后需同步回填表单默认值
    setForm((prev) => ({
      ...prev,
      readyRepoInput: nextReadyRepoInput,
      readyRepoBranch: nextReadyRepoBranch,
      readyToken: '',
      readyMasterPassword: '',
    }))
  }, [state])

  const handleReadyUpdateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const pendingMessage = '正在校验同步配置，请稍候...'
    setLastSyncCheckSnapshot({
      status: 'checking',
      title: '校验中',
      message: pendingMessage,
      updatedAt: new Date().toISOString(),
    })

    if (!isModal) {
      pushToast({
        kind: 'system',
        level: 'info',
        message: pendingMessage,
        autoDismiss: false,
      })
    }

    const result = await updateConnectionSettings({
      repoInput: form.readyRepoInput,
      giteeBranch: form.readyRepoBranch,
      token: form.readyToken || undefined,
      masterPassword: form.readyMasterPassword || undefined,
    })
    const nextSnapshot = buildSyncCheckSnapshotFromSubmitResult(result)
    setLastSyncCheckSnapshot(nextSnapshot)

    if (isModal) {
      return
    }

    if (!result.ok) {
      pushToast({
        kind: 'system',
        level: 'error',
        message: `同步配置校验失败：${result.message}`,
      })
      return
    }

    if (result.cloudSaveStatus === 'error') {
      pushToast({
        kind: 'system',
        level: 'warning',
        message: `同步配置校验通过；本地已保存，但云端回写失败：${result.cloudSaveMessage ?? '请稍后重试'}`,
      })
      return
    }

    if (result.cloudSaveStatus === 'not_applicable') {
      pushToast({
        kind: 'system',
        level: 'info',
        message: '同步配置校验通过，当前仅保存到本地（未登录云端账号）。',
      })
      return
    }

    pushToast({
      kind: 'system',
      level: 'success',
      message: '同步配置校验通过，已保存并同步到云端。',
    })
  }

  const body = (
    <section className={isModal ? 'space-y-4 px-4 py-4 sm:px-5 sm:py-5' : 'space-y-4'}>
      {isModal ? (
        <div className="rounded-[10px] border border-td-line bg-td-surface-soft px-3 py-2 text-sm text-td-muted">
          <p>状态：{state.stage}</p>
          {state.config ? <p>仓库：{state.config.giteeOwner + '/' + state.config.giteeRepoName}</p> : null}
          {state.config ? <p>分支：{state.config.giteeBranch ?? 'master'}</p> : null}
        </div>
      ) : null}

      {!isModal ? (
        <section
          className={`rounded-[10px] border px-3 py-2 text-sm ${syncCheckToneClass}`}
          data-testid="settings-sync-check-status"
          data-status={syncCheckSnapshot.status}
          aria-live="polite"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.04em]">配置检测状态</p>
          <p className="mt-1 text-sm font-medium">{syncCheckSnapshot.title}</p>
          <p className="mt-1 text-xs leading-5">{syncCheckSnapshot.message}</p>
          {syncCheckSnapshotTimeLabel ? <p className="mt-1 text-[11px]">更新时间：{syncCheckSnapshotTimeLabel}</p> : null}
        </section>
      ) : null}

      {state.errorMessage ? (
        <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.errorMessage}
        </p>
      ) : null}

      {state.stage === 'checking' ? <p className="td-status td-status-muted">认证处理中，请稍候...</p> : null}

      {state.stage === 'needs-setup' ? (
        <form className="space-y-3" onSubmit={(event) => void submitModel.onSetupSubmit(event)}>
          <AuthFormField
            label="Gitee 仓库"
            value={form.repoInput}
            onChange={(next) => setForm((prev) => ({ ...prev, repoInput: next }))}
            placeholder="owner/repo 或 https://gitee.com/owner/repo"
            autoComplete="off"
            testId="auth-setup-repo-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <AuthFormField
            label="仓库分支"
            value={form.repoBranch}
            onChange={(next) => setForm((prev) => ({ ...prev, repoBranch: next }))}
            placeholder="默认 master，可填写 main/dev 等"
            autoComplete="off"
            testId="auth-setup-branch-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <AuthFormField
            label="Gitee Token"
            value={form.token}
            onChange={(next) => setForm((prev) => ({ ...prev, token: next }))}
            placeholder="请输入可访问私有仓库的 Token"
            type="password"
            autoComplete="off"
            testId="auth-setup-token-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <AuthFormField
            label="主密码"
            value={form.masterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
            placeholder="至少 8 位，且包含字母和数字"
            type="password"
            autoComplete="new-password"
            testId="auth-setup-password-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          {form.masterPassword ? <p className="text-xs text-td-muted">{passwordHint ?? '主密码强度满足要求'}</p> : null}
          <button type="submit" className={primaryActionButtonClass} data-testid="auth-setup-submit">
            初始化并保存配置
          </button>
        </form>
      ) : null}

      {state.stage === 'needs-unlock' ? (
        <form className="space-y-3" onSubmit={(event) => void submitModel.onUnlockSubmit(event)}>
          <AuthFormField
            label="主密码"
            value={form.masterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
            placeholder="请输入主密码解锁"
            type="password"
            autoComplete="current-password"
            testId="auth-unlock-password-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <button type="submit" className={primaryActionButtonClass} data-testid="auth-unlock-submit">
            解锁
          </button>
        </form>
      ) : null}

      {state.stage === 'needs-token-refresh' ? (
        <form className="space-y-3" onSubmit={(event) => void submitModel.onRefreshTokenSubmit(event)}>
          <AuthFormField
            label="新的 Gitee Token"
            value={form.refreshToken}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshToken: next }))}
            placeholder="请输入新的 Token（覆盖本地密文）"
            type="password"
            autoComplete="off"
            testId="auth-refresh-token-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <AuthFormField
            label="主密码"
            value={form.refreshMasterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshMasterPassword: next }))}
            placeholder={state.needsMasterPasswordForTokenRefresh ? '当前会话缺少主密码，需补输' : '当前会话已保留主密码，可留空'}
            type="password"
            autoComplete="current-password"
            testId="auth-refresh-password-input"
            containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
            inputClassName="td-input"
          />
          <button
            type="submit"
            className={primaryActionButtonClass}
            data-testid="auth-refresh-submit"
          >
            覆盖本地 Token 密文
          </button>
        </form>
      ) : null}

      {state.stage === 'ready' ? (
        <form className="space-y-4" onSubmit={(event) => void handleReadyUpdateSubmit(event)}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
            <div className="space-y-1">
              <AuthFormField
                label="仓库地址"
                value={form.readyRepoInput}
                onChange={(next) => setForm((prev) => ({ ...prev, readyRepoInput: next }))}
                placeholder="owner/repo 或仓库 URL"
                autoComplete="off"
                testId="auth-ready-repo-input"
                containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
                inputClassName="td-input"
              />
              <p className="text-xs text-td-muted">格式 owner/repo，仅支持 gitee.com。</p>
            </div>
            <div className="space-y-1">
              <AuthFormField
                label="分支"
                value={form.readyRepoBranch}
                onChange={(next) => setForm((prev) => ({ ...prev, readyRepoBranch: next }))}
                placeholder="默认 master，可填写 main/dev"
                autoComplete="off"
                testId="auth-ready-branch-input"
                containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
                inputClassName="td-input"
              />
              <p className="text-xs text-td-muted">默认 master，请填写已存在分支。</p>
            </div>
            <div className={`space-y-1${showReadyPasswordInput ? '' : ' lg:col-span-2'}`}>
              <AuthFormField
                label="新 Token"
                value={form.readyToken}
                onChange={(next) => setForm((prev) => ({ ...prev, readyToken: next }))}
                placeholder="留空则不更新 Token"
                type="password"
                autoComplete="off"
                testId="auth-ready-token-input"
                containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
                inputClassName="td-input"
              />
              <p className="text-xs text-td-muted">留空则不更新 Token。</p>
            </div>
            {showReadyPasswordInput ? (
              <div className="space-y-1">
                <AuthFormField
                  label="主密码"
                  value={form.readyMasterPassword}
                  onChange={(next) => setForm((prev) => ({ ...prev, readyMasterPassword: next }))}
                  placeholder="请输入主密码以更新 Token"
                  type="password"
                  autoComplete="current-password"
                  testId="auth-ready-password-input"
                  containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
                  inputClassName="td-input"
                />
                <p className="text-xs text-td-muted">仅更新 Token 时需要，用于重新加密保存。</p>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <button type="submit" className={primaryActionButtonClass} data-testid="auth-ready-submit">
              保存设置
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )

  if (!isModal) {
    return (
      <section className="space-y-3" aria-label="settings-auth-panel">
        {body}
      </section>
    )
  }

  return (
    <article className="td-card w-full max-w-xl bg-td-bg shadow-card" aria-label="auth-modal">
      <header className="border-b border-td-line px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 inline-flex items-center rounded-full border border-td-line bg-td-soft px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] text-td-muted">
              {stageCopy.badge}
            </div>
            <h2 className="text-xl text-td-text">{stageCopy.title}</h2>
            <p className="mt-1 text-sm text-td-muted">{stageCopy.subtitle}</p>
          </div>
          {canClose && onClose ? (
            <button type="button" onClick={onClose} className="td-btn px-2 py-1 text-xs" aria-label="关闭认证弹层">
              关闭
            </button>
          ) : null}
        </div>
      </header>
      {body}
    </article>
  )
}
