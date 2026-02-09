import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'

interface AuthModalProps {
  auth: UseAuthResult
  open: boolean
  canClose: boolean
  onClose: () => void
}

interface AuthFormState {
  repoInput: string
  repoBranch: string
  token: string
  masterPassword: string
  refreshToken: string
  refreshMasterPassword: string
}

const initialFormState: AuthFormState = {
  repoInput: '',
  repoBranch: 'master',
  token: '',
  masterPassword: '',
  refreshToken: '',
  refreshMasterPassword: '',
}

function AuthField({
  label,
  value,
  onChange,
  placeholder,
  testId,
  type = 'text',
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  testId?: string
  type?: 'text' | 'password'
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-td-muted">
      <span>{label}</span>
      <input
        className="td-input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={testId}
      />
    </label>
  )
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
        subtitle: '输入主密码后进入日记工作台。',
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
        title: '认证与安全',
        subtitle: '你可以在这里重新锁定或更新凭据。',
        badge: 'READY',
      }
  }
}

export default function AuthModal({ auth, open, canClose, onClose }: AuthModalProps) {
  const [form, setForm] = useState<AuthFormState>(initialFormState)
  const { state, getMasterPasswordError, initializeFirstTime, unlockWithMasterPassword, updateTokenCiphertext, lockNow } =
    auth

  const stageCopy = useMemo(() => getStageTitle(state.stage), [state.stage])
  const passwordHint = useMemo(
    () => getMasterPasswordError(form.masterPassword),
    [form.masterPassword, getMasterPasswordError],
  )

  if (!open) {
    return null
  }

  const onSetupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await initializeFirstTime({
      repoInput: form.repoInput,
      giteeBranch: form.repoBranch,
      token: form.token,
      masterPassword: form.masterPassword,
    })
  }

  const onUnlockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await unlockWithMasterPassword({
      masterPassword: form.masterPassword,
    })
  }

  const onRefreshTokenSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await updateTokenCiphertext({
      token: form.refreshToken,
      masterPassword: form.refreshMasterPassword || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
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
            {canClose ? (
              <button type="button" onClick={onClose} className="td-btn px-2 py-1 text-xs" aria-label="关闭认证弹层">
                关闭
              </button>
            ) : null}
          </div>
        </header>

        <section className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="rounded-[10px] border border-td-line bg-td-surface-soft px-3 py-2 text-sm text-td-muted">
            <p>状态：{state.stage}</p>
            {state.config ? <p>仓库：{state.config.giteeOwner + '/' + state.config.giteeRepoName}</p> : null}
            {state.config ? <p>分支：{state.config.giteeBranch ?? 'master'}</p> : null}
          </div>

          <div className="min-h-[44px]">
            {state.errorMessage ? (
              <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.errorMessage}
              </p>
            ) : null}
          </div>

          {state.stage === 'checking' ? <p className="td-status td-status-muted">认证处理中，请稍候...</p> : null}

          {state.stage === 'needs-setup' ? (
            <form className="space-y-3" onSubmit={(event) => void onSetupSubmit(event)}>
              <AuthField
                label="Gitee 仓库"
                value={form.repoInput}
                onChange={(next) => setForm((prev) => ({ ...prev, repoInput: next }))}
                placeholder="owner/repo 或 https://gitee.com/owner/repo"
                autoComplete="off"
                testId="auth-setup-repo-input"
              />
              <AuthField
                label="仓库分支"
                value={form.repoBranch}
                onChange={(next) => setForm((prev) => ({ ...prev, repoBranch: next }))}
                placeholder="默认 master，可填写 main/dev 等"
                autoComplete="off"
                testId="auth-setup-branch-input"
              />
              <AuthField
                label="Gitee Token"
                value={form.token}
                onChange={(next) => setForm((prev) => ({ ...prev, token: next }))}
                placeholder="请输入可访问私有仓库的 Token"
                type="password"
                autoComplete="off"
                testId="auth-setup-token-input"
              />
              <AuthField
                label="主密码"
                value={form.masterPassword}
                onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
                placeholder="至少 8 位，且包含字母和数字"
                type="password"
                autoComplete="new-password"
                testId="auth-setup-password-input"
              />
              {form.masterPassword ? <p className="text-xs text-td-muted">{passwordHint ?? '主密码强度满足要求'}</p> : null}
              <button type="submit" className="td-btn td-btn-primary w-full sm:w-auto" data-testid="auth-setup-submit">
                初始化并保存配置
              </button>
            </form>
          ) : null}

          {state.stage === 'needs-unlock' ? (
            <form className="space-y-3" onSubmit={(event) => void onUnlockSubmit(event)}>
              <AuthField
                label="主密码"
                value={form.masterPassword}
                onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
                placeholder="请输入主密码解锁"
                type="password"
                autoComplete="current-password"
                testId="auth-unlock-password-input"
              />
              <button type="submit" className="td-btn td-btn-primary w-full sm:w-auto" data-testid="auth-unlock-submit">
                解锁
              </button>
            </form>
          ) : null}

          {state.stage === 'needs-token-refresh' ? (
            <form className="space-y-3" onSubmit={(event) => void onRefreshTokenSubmit(event)}>
              <AuthField
                label="新的 Gitee Token"
                value={form.refreshToken}
                onChange={(next) => setForm((prev) => ({ ...prev, refreshToken: next }))}
                placeholder="请输入新的 Token（覆盖本地密文）"
                type="password"
                autoComplete="off"
                testId="auth-refresh-token-input"
              />
              <AuthField
                label="主密码（可选）"
                value={form.refreshMasterPassword}
                onChange={(next) => setForm((prev) => ({ ...prev, refreshMasterPassword: next }))}
                placeholder={state.needsMasterPasswordForTokenRefresh ? '当前会话缺少主密码，需补输' : '当前会话已保留主密码，可留空'}
                type="password"
                autoComplete="current-password"
                testId="auth-refresh-password-input"
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
            <div className="flex flex-wrap items-center gap-3 text-sm text-td-muted">
              <p>主密码 7 天内免输已生效。</p>
              <button
                type="button"
                className="td-btn"
                onClick={() => {
                  lockNow()
                }}
              >
                立即锁定
              </button>
            </div>
          ) : null}
        </section>
      </article>
    </div>
  )
}
