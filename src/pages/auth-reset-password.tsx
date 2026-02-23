import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, updateSupabasePassword } from '../services/supabase'

const MIN_PASSWORD_LENGTH = 8

export default function AuthResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = useMemo(
    () => password.length >= MIN_PASSWORD_LENGTH && confirmPassword.length >= MIN_PASSWORD_LENGTH && !isSubmitting,
    [confirmPassword.length, isSubmitting, password.length],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致，请重新确认')
      return
    }

    setError(null)
    setNotice(null)
    setIsSubmitting(true)
    try {
      await updateSupabasePassword(password)
      setNotice('密码已更新，请返回登录继续。')
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '密码更新失败，请稍后重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8" aria-label="auth-reset-password-page">
      <article className="td-card w-full space-y-4">
        <header className="space-y-1 border-b border-td-border pb-3">
          <h1 className="text-2xl text-td-text">重置登录密码</h1>
          <p className="text-sm text-td-muted">设置新密码后，可使用邮箱密码直接登录。</p>
        </header>

        {!isSupabaseConfigured() ? (
          <p className="text-sm text-[#a63f3f]">当前未配置 Supabase，无法重置密码。</p>
        ) : (
          <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
            <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
              新密码
              <input
                type="password"
                className="td-input border-[#dad3c6] bg-[#fffcf7]"
                placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="auth-reset-password-input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
              确认新密码
              <input
                type="password"
                className="td-input border-[#dad3c6] bg-[#fffcf7]"
                placeholder="再次输入新密码"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                data-testid="auth-reset-password-confirm-input"
              />
            </label>
            <button
              type="submit"
              className="td-btn td-btn-primary-ink h-10 w-full"
              disabled={!canSubmit}
              data-testid="auth-reset-password-submit-btn"
            >
              {isSubmitting ? '更新中...' : '更新密码'}
            </button>
          </form>
        )}

        {notice ? <p className="text-sm text-[#16643a]">{notice}</p> : null}
        {error ? <p className="text-sm text-[#a63f3f]">{error}</p> : null}

        <div className="pt-1">
          <button
            type="button"
            className="text-sm text-[#5f594f] underline-offset-4 transition hover:text-[#2d2924] hover:underline"
            onClick={() => navigate('/diary', { replace: true })}
            data-testid="auth-reset-password-back-btn"
          >
            返回应用
          </button>
        </div>
      </article>
    </main>
  )
}
