import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
const OTP_LENGTH = 6
const MIN_ACCOUNT_PASSWORD_LENGTH = 8
const OTP_TEMPLATE_HINT = '若邮件里只有登录链接、没有 6 位验证码，请在 Supabase 邮件模板中加入 {{ .Token }}。'

let cachedClient: SupabaseClient | null = null

function containsServiceRoleMarker(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized.includes('service_role') || normalized.includes('supabase_service_role')
}

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}

function assertSupabaseClientAllowed(): void {
  if (!isSupabaseConfigured()) {
    throw new Error('未配置 Supabase，请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY')
  }

  if (containsServiceRoleMarker(SUPABASE_ANON_KEY)) {
    throw new Error('前端环境变量中检测到 service_role 风险，请改用 anon key')
  }
}

function mapOtpErrorMessage(rawMessage: string, phase: 'send' | 'verify'): string {
  const message = rawMessage.trim()
  if (!message) {
    return phase === 'send' ? '验证码发送失败，请稍后重试' : '验证码校验失败，请重试'
  }

  const normalized = message.toLowerCase()
  if (phase === 'send' && (normalized.includes('rate limit') || normalized.includes('too many requests'))) {
    return '验证码发送过于频繁，请稍后再试'
  }

  if (
    phase === 'verify' &&
    (normalized.includes('invalid')
      || normalized.includes('expired')
      || normalized.includes('token')
      || normalized.includes('otp'))
  ) {
    return `验证码无效或已过期，请重新获取后再试。${OTP_TEMPLATE_HINT}`
  }

  return message
}

function mapPasswordAuthErrorMessage(rawMessage: string, phase: 'signup' | 'signin'): string {
  const message = rawMessage.trim()
  if (!message) {
    return phase === 'signup' ? '注册失败，请稍后重试' : '登录失败，请稍后重试'
  }

  const normalized = message.toLowerCase()
  if (normalized.includes('user already registered')) {
    return '该邮箱已注册，请直接登录'
  }
  if (normalized.includes('invalid login credentials')) {
    return '邮箱或密码错误，请重试'
  }
  if (normalized.includes('email not confirmed')) {
    return '邮箱尚未验证，请先完成邮箱验证后再登录'
  }
  if (
    normalized.includes('password should be')
    || normalized.includes('weak password')
    || normalized.includes('password is too weak')
  ) {
    return `密码强度不足，请至少使用 ${MIN_ACCOUNT_PASSWORD_LENGTH} 位并包含字母与数字`
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return '操作过于频繁，请稍后再试'
  }
  return message
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient
  }

  assertSupabaseClientAllowed()
  cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // GitHub OAuth 回跳后需要自动从 URL 中恢复会话。
      detectSessionInUrl: true,
    },
  })

  return cachedClient
}

export async function getSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const client = getSupabaseClient()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }
  return data.session
}

export async function sendEmailOtp(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('请填写邮箱地址')
  }

  const client = getSupabaseClient()
  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    throw new Error(mapOtpErrorMessage(error.message, 'send'))
  }
}

export interface SignUpWithEmailPasswordResult {
  needsEmailConfirmation: boolean
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
): Promise<SignUpWithEmailPasswordResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('请填写邮箱地址')
  }
  if (!password) {
    throw new Error('请填写密码')
  }
  if (password.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    throw new Error(`密码至少需要 ${MIN_ACCOUNT_PASSWORD_LENGTH} 位`)
  }

  const client = getSupabaseClient()
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
  })

  if (error) {
    throw new Error(mapPasswordAuthErrorMessage(error.message, 'signup'))
  }

  return {
    needsEmailConfirmation: !data.session,
  }
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('请填写邮箱地址')
  }
  if (!password) {
    throw new Error('请填写密码')
  }

  const client = getSupabaseClient()
  const { error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    throw new Error(mapPasswordAuthErrorMessage(error.message, 'signin'))
  }
}

export async function signInWithGitHub(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持 GitHub 登录')
  }

  const client = getSupabaseClient()
  const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`
  const { error } = await client.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo,
    },
  })

  if (error) {
    throw new Error('GitHub 登录发起失败，请稍后重试')
  }
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedToken = token.trim().replace(/\s+/g, '')
  if (!normalizedEmail) {
    throw new Error('请填写邮箱地址')
  }
  if (!normalizedToken) {
    throw new Error(`请填写 ${OTP_LENGTH} 位验证码。${OTP_TEMPLATE_HINT}`)
  }
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(normalizedToken)) {
    throw new Error(`请输入 ${OTP_LENGTH} 位数字验证码。${OTP_TEMPLATE_HINT}`)
  }

  const client = getSupabaseClient()
  const { error } = await client.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'email',
  })

  if (error) {
    throw new Error(mapOtpErrorMessage(error.message, 'verify'))
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return
  }

  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export function onSupabaseAuthStateChange(
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): (() => void) | null {
  if (!isSupabaseConfigured()) {
    return null
  }

  const client = getSupabaseClient()
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(listener)

  return () => {
    subscription.unsubscribe()
  }
}

export async function getSupabaseUserId(): Promise<string | null> {
  const session = await getSupabaseSession()
  return session?.user?.id ?? null
}
