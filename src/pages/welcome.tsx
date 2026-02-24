import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/use-auth'
import {
  INITIAL_AUTH_FORM_STATE,
  createAuthSubmitModel,
  type AuthFormState,
} from '../components/auth/auth-form-model'
import {
  AuthFormField,
} from '../components/auth/auth-form-shared'

export default function WelcomePage() {
  const {
    state,
    getMasterPasswordError,
    initializeFirstTime,
    unlockWithMasterPassword,
    updateTokenCiphertext,
    updateConnectionSettings,
  } =
    useAuth()
  const [form, setForm] = useState<AuthFormState>(INITIAL_AUTH_FORM_STATE)
  const submitModel = createAuthSubmitModel(
    {
      initializeFirstTime,
      unlockWithMasterPassword,
      updateTokenCiphertext,
      updateConnectionSettings,
    },
    form,
  )

  const passwordHint = useMemo(() => getMasterPasswordError(form.masterPassword), [form.masterPassword, getMasterPasswordError])

  useEffect(() => {
    if (state.stage !== 'needs-token-refresh' || !state.config) {
      return
    }

    const nextRefreshRepoInput = `${state.config.giteeOwner}/${state.config.giteeRepoName}`
    const nextRefreshRepoBranch = state.config.giteeBranch ?? 'master'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- token-refresh 配置变化后需同步回填表单默认值
    setForm((prev) => {
      if (prev.refreshRepoInput === nextRefreshRepoInput && prev.refreshRepoBranch === nextRefreshRepoBranch) {
        return prev
      }
      return {
        ...prev,
        refreshRepoInput: nextRefreshRepoInput,
        refreshRepoBranch: nextRefreshRepoBranch,
      }
    })
  }, [state])

  return (
    <article className="space-y-4" aria-label="welcome-page">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold text-ink-900 sm:text-4xl">欢迎使用 TraceDiary</h2>
        <p className="text-slate-600">你的私密、可同步、加密日记。请先完成仓库与密钥初始化。</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
        <p>当前状态：{state.stage}</p>
        {state.config ? <p>仓库：{state.config.giteeOwner + '/' + state.config.giteeRepoName}</p> : null}
        {state.config ? <p>分支：{state.config.giteeBranch ?? 'master'}</p> : null}
        {state.stage === 'ready' ? <p className="text-emerald-700">已完成解锁，可以进入日历页。</p> : null}
      </div>

      {state.errorMessage ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.errorMessage}
        </p>
      ) : null}

      {state.stage === 'checking' ? (
        <p className="text-sm text-slate-600">正在处理认证流程，请稍候...</p>
      ) : null}

      {state.stage === 'needs-setup' ? (
        <form className="space-y-3" onSubmit={(event) => void submitModel.onSetupSubmit(event)}>
          <AuthFormField
            label="Gitee 仓库"
            value={form.repoInput}
            onChange={(next) => setForm((prev) => ({ ...prev, repoInput: next }))}
            placeholder="例如 owner/repo 或 https://gitee.com/owner/repo"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="仓库分支"
            value={form.repoBranch}
            onChange={(next) => setForm((prev) => ({ ...prev, repoBranch: next }))}
            placeholder="默认 master，可填写 main/dev 等"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="Gitee Token"
            value={form.token}
            onChange={(next) => setForm((prev) => ({ ...prev, token: next }))}
            placeholder="请输入可访问私有仓库的 Token"
            type="password"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="主密码"
            value={form.masterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
            placeholder="至少 8 位，且包含字母和数字"
            type="password"
            autoComplete="new-password"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          {form.masterPassword ? <p className="text-xs text-slate-500">{passwordHint ?? '主密码强度满足要求'}</p> : null}
          <button
            type="submit"
            className="rounded-full bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
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
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <button
            type="submit"
            className="rounded-full bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            解锁
          </button>
        </form>
      ) : null}

      {state.stage === 'needs-token-refresh' ? (
        <form className="space-y-3" onSubmit={(event) => void submitModel.onRefreshTokenSubmit(event)}>
          <AuthFormField
            label="仓库地址"
            value={form.refreshRepoInput}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshRepoInput: next }))}
            placeholder="owner/repo 或 https://gitee.com/owner/repo"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="仓库分支"
            value={form.refreshRepoBranch}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshRepoBranch: next }))}
            placeholder="默认 master，可填写 main/dev"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="新的 Gitee Token"
            value={form.refreshToken}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshToken: next }))}
            placeholder="请输入新的 Token（将覆盖本地密文）"
            type="password"
            autoComplete="off"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <AuthFormField
            label="主密码（可选）"
            value={form.refreshMasterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshMasterPassword: next }))}
            placeholder={state.needsMasterPasswordForTokenRefresh ? '当前会话缺少主密码，需补输' : '当前会话已保留主密码，可留空'}
            type="password"
            autoComplete="current-password"
            containerClassName="flex flex-col gap-1.5 text-sm text-slate-700"
            labelClassName="font-medium text-slate-800"
            inputClassName="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
          />
          <button
            type="submit"
            className="rounded-full bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            更新并恢复同步
          </button>
        </form>
      ) : null}

      {state.stage === 'ready' ? (
        <div className="text-sm text-slate-700">
          <p>主密码 7 天内免输已生效（仅保存锁态与过期时间）。</p>
        </div>
      ) : null}
    </article>
  )
}
