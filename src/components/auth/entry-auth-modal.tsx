import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import type { UseAuthResult } from '../../hooks/use-auth'
import {
  sendEmailOtp,
  verifyEmailOtp,
} from '../../services/supabase'

interface EntryAuthModalProps {
  open: boolean
  canClose?: boolean
  auth: UseAuthResult
  session: Session | null
  cloudAuthEnabled: boolean
  onClose?: () => void
  onEnterGuest: () => void
  onChooseAuthFlow: () => void
}

export default function EntryAuthModal({
  open,
  canClose = false,
  auth,
  session,
  cloudAuthEnabled,
  onClose,
  onEnterGuest,
  onChooseAuthFlow,
}: EntryAuthModalProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [isRestoringConfig, setIsRestoringConfig] = useState(false)

  if (!open) {
    return null
  }

  const handleSendOtp = async () => {
    setError(null)
    setNotice(null)
    setIsSendingOtp(true)
    try {
      await sendEmailOtp(email)
      setNotice('验证码已发送，请检查邮箱并输入 6 位验证码。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码发送失败，请稍后重试')
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError(null)
    setNotice(null)
    setIsVerifyingOtp(true)
    try {
      await verifyEmailOtp(email, otp)
      setNotice('登录成功。你可以立即从云端恢复配置，或前往设置页继续配置。')
      setOtp('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '验证码校验失败，请重试')
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const handleRestoreCloudConfig = async () => {
    setError(null)
    setNotice(null)
    setIsRestoringConfig(true)
    try {
      await auth.restoreConfigFromCloud()
      setNotice('已从云端恢复配置，请输入主密码完成解锁。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '云端恢复失败，请稍后重试')
    } finally {
      setIsRestoringConfig(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#151311]/55 px-4 py-6 backdrop-blur-[2px] td-fade-in"
      aria-label="entry-auth-modal"
      data-testid="entry-auth-modal"
    >
      <article className="relative w-full max-w-4xl overflow-hidden rounded-[20px] border border-[#dad3c7] bg-[#fffdfa] shadow-[0_24px_72px_rgba(24,20,16,0.32)]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(203,185,156,0.22),transparent_52%)]"
          aria-hidden="true"
        />
        <div className="relative grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
            <header className="space-y-2 border-b border-[#ece5d8] pb-4">
              <span className="inline-flex rounded-full border border-[#dfd8cb] bg-[#f8f4ec] px-3 py-1 text-xs text-[#6d6457]">
                统一账号入口
              </span>
              <h2 className="text-[26px] leading-tight text-td-text sm:text-[30px]">开始使用 TraceDiary</h2>
              <p className="text-sm text-[#635d54]">
                登录后可恢复云端配置并在多设备继续写作；也可先游客体验再切换为正式账号。
              </p>
            </header>

            {!cloudAuthEnabled ? (
              <section className="rounded-[14px] border border-[#e4ddd0] bg-[#faf6ee] p-4">
                <p className="text-sm text-[#5f5b54]">当前未配置 Supabase，登录能力暂不可用。你仍可继续本地配置与使用。</p>
              </section>
            ) : session ? (
              <section className="space-y-3 rounded-[14px] border border-[#dfd8cb] bg-white p-4">
                <p className="text-xs tracking-[0.06em] text-[#7c7467]">账号状态</p>
                <p className="text-base text-[#2c2925]">
                  已登录：<span className="font-semibold">{session.user.email ?? '未知邮箱'}</span>
                </p>
                <p className="text-sm text-[#6b655a]">可前往设置页继续绑定仓库；若已有云端配置可直接恢复。</p>
                {auth.state.stage === 'needs-setup' ? (
                  <button
                    type="button"
                    className="td-btn td-btn-primary-ink"
                    onClick={() => void handleRestoreCloudConfig()}
                    disabled={isRestoringConfig}
                    data-testid="entry-auth-restore-config-btn"
                  >
                    {isRestoringConfig ? '恢复中...' : '从云端恢复配置'}
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="rounded-[14px] border border-[#dfd8cb] bg-white p-4">
                <p className="text-xs tracking-[0.06em] text-[#7c7467]">邮箱验证码登录</p>
                <div className="mt-3 grid gap-3">
                  <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                    邮箱
                    <input
                      type="email"
                      className="td-input border-[#dad3c6] bg-[#fffcf7]"
                      placeholder="name@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      data-testid="entry-auth-email-input"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-[#6a6357]">
                    验证码
                    <input
                      type="text"
                      className="td-input border-[#dad3c6] bg-[#fffcf7]"
                      placeholder="6 位验证码"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(event) => setOtp(event.target.value)}
                      data-testid="entry-auth-otp-input"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="td-btn td-btn-primary-ink h-10"
                      onClick={() => void handleSendOtp()}
                      disabled={isSendingOtp}
                      data-testid="entry-auth-send-otp-btn"
                    >
                      {isSendingOtp ? '发送中...' : '发送验证码'}
                    </button>
                    <button
                      type="button"
                      className="td-btn h-10 border-[#d2ccc0] bg-[#f9f7f2]"
                      onClick={() => void handleVerifyOtp()}
                      disabled={isVerifyingOtp}
                      data-testid="entry-auth-verify-otp-btn"
                    >
                      {isVerifyingOtp ? '校验中...' : '登录 / 注册'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {notice ? (
              <p className="rounded-[10px] border border-[#cde8d2] bg-[#f2fbf4] px-3 py-2 text-sm text-[#16643a]">{notice}</p>
            ) : null}
            {error ? (
              <p className="rounded-[10px] border border-[#f0c5c5] bg-[#fff4f4] px-3 py-2 text-sm text-[#a63f3f]">{error}</p>
            ) : null}

            <div className="grid gap-2 border-t border-[#ece5d8] pt-4 sm:grid-cols-2">
              <button
                type="button"
                className="td-btn td-btn-primary-ink h-10"
                data-testid="entry-auth-go-settings-btn"
                onClick={() => {
                  onChooseAuthFlow()
                  navigate('/settings')
                }}
              >
                去设置页登录 / 配置
              </button>
              <button
                type="button"
                className="td-btn h-10 border-[#d2ccc0] bg-[#f9f7f2]"
                data-testid="entry-auth-guest-btn"
                onClick={onEnterGuest}
              >
                以游客身份访问
              </button>
            </div>
          </section>

          <aside className="relative border-t border-[#ece5d8] bg-[#f6f2e9] px-5 py-5 md:border-l md:border-t-0 sm:px-6 sm:py-6">
            {canClose ? (
              <button
                type="button"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d9d2c7] bg-white text-[#6f665a] transition hover:bg-[#f6f1e8]"
                onClick={onClose}
                aria-label="关闭登录弹窗"
                data-testid="entry-auth-close-btn"
              >
                ×
              </button>
            ) : null}
            <div className="space-y-4">
              <div>
                <p className="text-xs tracking-[0.08em] text-[#7d7568]">推荐流程</p>
                <h3 className="mt-2 text-xl text-[#2d2924]">先验证账号，再恢复配置</h3>
              </div>

              <ol className="space-y-2 text-sm text-[#5f594f]">
                <li className="rounded-[10px] border border-[#ddd5c8] bg-white px-3 py-2">1. 输入邮箱并接收验证码</li>
                <li className="rounded-[10px] border border-[#ddd5c8] bg-white px-3 py-2">2. 登录后可从云端恢复仓库配置</li>
                <li className="rounded-[10px] border border-[#ddd5c8] bg-white px-3 py-2">3. 输入主密码完成解锁并开始写作</li>
              </ol>

              <div className="rounded-[12px] border border-dashed border-[#d8cfbf] bg-[#fbf8f2] px-3 py-3">
                <p className="text-xs text-[#6f675b]">提示</p>
                <p className="mt-1 text-sm text-[#524b42]">
                  游客模式下可先体验示例数据，稍后可随时通过右上角“登录 / 注册”切换到正式账号。
                </p>
              </div>
            </div>
          </aside>
        </div>
      </article>
    </div>
  )
}
