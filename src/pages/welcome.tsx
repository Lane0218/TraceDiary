import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/use-auth'

type AuthFormState = {
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
  type?: 'text' | 'password'
  autoComplete?: string
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-slate-700">
      <span className="font-medium text-slate-800">{label}</span>
      <input
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring-2"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  )
}

export default function WelcomePage() {
  const { state, getMasterPasswordError, initializeFirstTime, unlockWithMasterPassword, updateTokenCiphertext, lockNow } =
    useAuth()
  const [form, setForm] = useState<AuthFormState>(initialFormState)

  const passwordHint = useMemo(() => getMasterPasswordError(form.masterPassword), [form.masterPassword, getMasterPasswordError])

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
        <form className="space-y-3" onSubmit={(event) => void onSetupSubmit(event)}>
          <Field
            label="Gitee 仓库"
            value={form.repoInput}
            onChange={(next) => setForm((prev) => ({ ...prev, repoInput: next }))}
            placeholder="例如 owner/repo 或 https://gitee.com/owner/repo"
            autoComplete="off"
          />
          <Field
            label="仓库分支"
            value={form.repoBranch}
            onChange={(next) => setForm((prev) => ({ ...prev, repoBranch: next }))}
            placeholder="默认 master，可填写 main/dev 等"
            autoComplete="off"
          />
          <Field
            label="Gitee Token"
            value={form.token}
            onChange={(next) => setForm((prev) => ({ ...prev, token: next }))}
            placeholder="请输入可访问私有仓库的 Token"
            type="password"
            autoComplete="off"
          />
          <Field
            label="主密码"
            value={form.masterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
            placeholder="至少 8 位，且包含字母和数字"
            type="password"
            autoComplete="new-password"
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
        <form className="space-y-3" onSubmit={(event) => void onUnlockSubmit(event)}>
          <Field
            label="主密码"
            value={form.masterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, masterPassword: next }))}
            placeholder="请输入主密码解锁"
            type="password"
            autoComplete="current-password"
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
        <form className="space-y-3" onSubmit={(event) => void onRefreshTokenSubmit(event)}>
          <Field
            label="新的 Gitee Token"
            value={form.refreshToken}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshToken: next }))}
            placeholder="请输入新的 Token（将覆盖本地密文）"
            type="password"
            autoComplete="off"
          />
          <Field
            label="主密码（可选）"
            value={form.refreshMasterPassword}
            onChange={(next) => setForm((prev) => ({ ...prev, refreshMasterPassword: next }))}
            placeholder={state.needsMasterPasswordForTokenRefresh ? '当前会话缺少主密码，需补输' : '当前会话已保留主密码，可留空'}
            type="password"
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="rounded-full bg-brand-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
          >
            覆盖本地 Token 密文
          </button>
        </form>
      ) : null}

      {state.stage === 'ready' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <p>主密码 7 天内免输已生效（仅保存锁态与过期时间）。</p>
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:bg-slate-100"
            onClick={lockNow}
          >
            立即锁定
          </button>
        </div>
      ) : null}
    </article>
  )
}
