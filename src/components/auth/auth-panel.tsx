import { useEffect, useMemo, useState } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'
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
        subtitle: '更新仓库、分支与 Token。',
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

export default function AuthPanel({ auth, variant, canClose = false, onClose }: AuthPanelProps) {
  const [form, setForm] = useState<AuthFormState>(INITIAL_AUTH_FORM_STATE)
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
  const passwordHint = useMemo(
    () => getMasterPasswordError(form.masterPassword),
    [form.masterPassword, getMasterPasswordError],
  )
  const isModal = variant === 'modal'
  const showReadyPasswordInput = form.readyToken.trim().length > 0

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

  const body = (
    <section className={isModal ? 'space-y-4 px-4 py-4 sm:px-5 sm:py-5' : 'space-y-4'}>
      {isModal ? (
        <div className="rounded-[10px] border border-td-line bg-td-surface-soft px-3 py-2 text-sm text-td-muted">
          <p>状态：{state.stage}</p>
          {state.config ? <p>仓库：{state.config.giteeOwner + '/' + state.config.giteeRepoName}</p> : null}
          {state.config ? <p>分支：{state.config.giteeBranch ?? 'master'}</p> : null}
        </div>
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
          <button type="submit" className="td-btn td-btn-primary w-full sm:w-auto" data-testid="auth-setup-submit">
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
          <button type="submit" className="td-btn td-btn-primary w-full sm:w-auto" data-testid="auth-unlock-submit">
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
            label="主密码（可选）"
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
            className="td-btn td-btn-primary w-full sm:w-auto"
            data-testid="auth-refresh-submit"
          >
            覆盖本地 Token 密文
          </button>
        </form>
      ) : null}

      {state.stage === 'ready' ? (
        <form className="space-y-4" onSubmit={(event) => void submitModel.onReadyUpdateSubmit(event)}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
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
            <AuthFormField
              label="新 Token（可选）"
              value={form.readyToken}
              onChange={(next) => setForm((prev) => ({ ...prev, readyToken: next }))}
              placeholder="留空则不更新 Token"
              type="password"
              autoComplete="off"
              testId="auth-ready-token-input"
              containerClassName={`flex flex-col gap-1.5 text-sm text-td-muted${showReadyPasswordInput ? '' : ' lg:col-span-2'}`}
              inputClassName="td-input"
            />
            {showReadyPasswordInput ? (
              <AuthFormField
                label="主密码（仅更新 Token 时需要）"
                value={form.readyMasterPassword}
                onChange={(next) => setForm((prev) => ({ ...prev, readyMasterPassword: next }))}
                placeholder="请输入主密码以更新 Token"
                type="password"
                autoComplete="current-password"
                testId="auth-ready-password-input"
                containerClassName="flex flex-col gap-1.5 text-sm text-td-muted"
                inputClassName="td-input"
              />
            ) : null}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="td-btn td-btn-primary w-full sm:w-auto" data-testid="auth-ready-submit">
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
