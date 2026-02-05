import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AuthStatus } from './types/auth';
import type { DiaryEntry } from './types/diary';
import type { HistoricalDiary } from './types/history';
import {
  getAuthStatus,
  getDiary,
  listDiaryDaysInMonth,
  listHistoricalDiaries,
  saveDiary,
  setPassword,
  verifyPassword,
} from './services/tauriCommands';
import { formatDateTimeLocal, getTodayYmd } from './utils/dateUtils';
import { MonthView } from './components/Calendar/MonthView';

import './App.css';

type AuthMode = 'none' | 'set' | 'verify';

const PASSWORD_PLACEHOLDER = '至少 8 位，包含字母和数字';
const AUTOSAVE_DELAY_MS = 30_000;

const formatInvokeErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim())
    return error.message;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
  }
  return String(error);
};

const formatModifiedAt = (modifiedAt: string | null | undefined): string => {
  if (!modifiedAt) return '-';
  const s = modifiedAt.trim();
  if (!s) return '-';

  // Early versions store unix seconds; accept seconds or ms.
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = s.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return formatDateTimeLocal(d);
  }

  // Fallback: try parsing ISO/RFC strings.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return formatDateTimeLocal(d);
  return s;
};

const ymdToYearMonthDay = (
  ymd: string,
): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day))
    return null;
  return { year, month, day };
};

function App(): React.ReactElement {
  const today = useMemo(() => getTodayYmd(), []);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [password, setPasswordInput] = useState<string>('');
  const [statusText, setStatusText] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [content, setContent] = useState<string>('');
  const [diaryMeta, setDiaryMeta] = useState<Pick<
    DiaryEntry,
    'word_count' | 'modified_at'
  > | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState<string>('');
  const [monthEntryDays, setMonthEntryDays] = useState<ReadonlySet<number> | null>(null);
  const monthKeyRef = useRef<string>('');
  const [historyItems, setHistoryItems] = useState<HistoricalDiary[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const markSavedDayInCalendar = useCallback((dateYmd: string): void => {
    const parts = ymdToYearMonthDay(dateYmd);
    if (!parts) return;
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    if (key !== monthKeyRef.current) return;

    setMonthEntryDays((prev) => {
      const next = new Set(prev ?? []);
      next.add(parts.day);
      return next;
    });
  }, []);

  const loadAuthStatus = async (): Promise<void> => {
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);
      if (!status.password_set) setAuthMode('set');
      else if (status.needs_verify) setAuthMode('verify');
      else setAuthMode('none');
    } catch (error: unknown) {
      setErrorText('读取认证状态失败，请重试');
      console.error('Failed to load auth status:', error);
    }
  };

  const loadDiary = async (date: string): Promise<void> => {
    try {
      setErrorText('');
      const entry = await getDiary(date);
      if (!entry) {
        setContent('');
        setLastSavedContent('');
        setDiaryMeta(null);
        setStatusText('未找到该日期的日记');
        return;
      }

      setContent(entry.content);
      setLastSavedContent(entry.content);
      setDiaryMeta({ word_count: entry.word_count, modified_at: entry.modified_at });
      setStatusText('已加载');
    } catch (error: unknown) {
      setErrorText('加载失败，请先完成密码验证');
      console.error('Failed to load diary:', error);
    }
  };

  useEffect(() => {
    void loadAuthStatus();
  }, []);

  useEffect(() => {
    if (authMode !== 'none') return;
    if (!authStatus) return;
    void loadDiary(selectedDate);
  }, [authMode, authStatus, selectedDate]);

  useEffect(() => {
    if (authMode !== 'none') return;
    if (!authStatus) return;

    const parts = ymdToYearMonthDay(selectedDate);
    if (!parts) return;

    setHistoryLoading(true);
    void (async () => {
      try {
        const items = await listHistoricalDiaries(parts.month, parts.day, currentYear);
        setHistoryItems(Array.isArray(items) ? items : []);
      } catch (error: unknown) {
        // Non-blocking: history panel should not break the editor.
        console.error('Failed to load historical diaries:', error);
        setHistoryItems([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [authMode, authStatus, currentYear, selectedDate]);

  // 30 秒无输入自动保存（防抖）。
  useEffect(() => {
    if (authMode !== 'none') return;

    // 未解锁 / 尚未加载认证状态时，不触发自动保存。
    if (!authStatus) return;

    // 内容没变就不保存。
    if (content === lastSavedContent) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setErrorText('');
          setStatusText('自动保存中...');
          const saved = await saveDiary({ date: selectedDate, content });
          setDiaryMeta({ word_count: saved.word_count, modified_at: saved.modified_at });
          setLastSavedContent(content);
          markSavedDayInCalendar(saved.date);
          setStatusText('已自动保存');
        } catch (error: unknown) {
          setErrorText('自动保存失败，请重试');
          console.error('Failed to auto-save diary:', error);
        }
      })();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    authMode,
    authStatus,
    content,
    lastSavedContent,
    markSavedDayInCalendar,
    selectedDate,
  ]);

  const handleAuthSubmit = async (): Promise<void> => {
    try {
      setErrorText('');
      setStatusText('');
      if (authMode === 'set') await setPassword(password);
      if (authMode === 'verify') await verifyPassword(password);

      setPasswordInput('');
      setAuthMode('none');
      await loadAuthStatus();
      await loadDiary(selectedDate);
    } catch (error: unknown) {
      const detail = formatInvokeErrorMessage(error);
      setErrorText(
        authMode === 'set' ? `设置密码失败：${detail}` : `密码验证失败：${detail}`,
      );
      console.error('Auth failed:', error);
    }
  };

  const handleSave = async (): Promise<void> => {
    try {
      setErrorText('');
      setStatusText('保存中...');

      const saved = await saveDiary({ date: selectedDate, content });
      setDiaryMeta({ word_count: saved.word_count, modified_at: saved.modified_at });
      setLastSavedContent(content);
      markSavedDayInCalendar(saved.date);
      setStatusText('已保存');
    } catch (error: unknown) {
      setErrorText('保存失败，请先完成密码验证');
      console.error('Failed to save diary:', error);
    }
  };

  const handleMonthChange = useCallback((year: number, month: number): void => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key === monthKeyRef.current) return;
    monthKeyRef.current = key;

    void (async () => {
      try {
        const days = await listDiaryDaysInMonth(year, month);
        setMonthEntryDays(new Set(days));
      } catch (error: unknown) {
        // Non-blocking: calendar dots are just a hint.
        console.error('Failed to load diary days in month:', error);
        setMonthEntryDays(null);
      }
    })();
  }, []);

  return (
    <div className="td-app">
      <header className="td-topbar" aria-label="应用标题栏">
        <div className="td-brand" aria-label="TraceDiary">
          <span className="td-brand__mark" aria-hidden="true" />
          <div className="td-brand__text">
            <h1 className="td-brand__name">TraceDiary</h1>
            <div className="td-brand__tag">本地加密 · 往年今日</div>
          </div>
        </div>

        <div className="td-topbar__right" aria-label="状态">
          {authMode !== 'none' ? (
            <span className="td-chip td-chip--warn">未解锁</span>
          ) : (
            <span className="td-chip td-chip--ok">已解锁</span>
          )}
          {statusText ? (
            <span className="td-chip td-chip--info">{statusText}</span>
          ) : null}
          {errorText ? (
            <span className="td-chip td-chip--danger">{errorText}</span>
          ) : null}
        </div>
      </header>

      <main className="td-main" aria-label="主界面">
        <aside className="td-panel td-panel--left" aria-label="日历面板">
          <div className="td-panel__title">日历</div>
          <MonthView
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            entryDays={monthEntryDays}
            onMonthChange={handleMonthChange}
          />
          <button
            type="button"
            className="td-btn td-btn--soft td-btn--block"
            onClick={() => setSelectedDate(today)}
          >
            回到今天
          </button>
        </aside>

        <section className="td-panel td-panel--center" aria-label="编辑器面板">
          <div className="td-panel__title td-panel__title--split">
            <span>日记</span>
            <span className="td-mono">{selectedDate}</span>
          </div>

          <div className="td-actions" aria-label="编辑器操作">
            <button
              type="button"
              className="td-btn td-btn--ghost"
              onClick={() => void loadDiary(selectedDate)}
            >
              刷新
            </button>
            <button
              type="button"
              className="td-btn td-btn--primary"
              onClick={() => void handleSave()}
            >
              保存
            </button>
          </div>

          <textarea
            className="td-editor"
            value={content}
            onChange={(e) => setContent(e.currentTarget.value)}
            placeholder="写点什么..."
            rows={18}
            aria-label="日记内容"
          />

          <div className="td-meta" aria-label="元信息">
            <span>字数：{diaryMeta?.word_count ?? 0}</span>
            <span>修改时间：{formatModifiedAt(diaryMeta?.modified_at)}</span>
          </div>
        </section>

        <aside className="td-panel td-panel--right" aria-label="往年今日">
          <div className="td-panel__title">往年今日</div>
          {historyLoading ? (
            <div className="td-empty">
              <div className="td-empty__kicker">加载中</div>
              <div className="td-empty__text">正在查询往年今日…</div>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="td-empty">
              <div className="td-empty__kicker">暂无记录</div>
              <div className="td-empty__text">还没有“往年今日”的历史日记。</div>
            </div>
          ) : (
            <div className="td-historyList" aria-label="历史列表">
              {historyItems.map((item) => (
                <button
                  key={item.date}
                  type="button"
                  className="td-historyCard"
                  onClick={() => setSelectedDate(item.date)}
                >
                  <div className="td-historyCard__top">
                    <span className="td-historyCard__year">{item.year}年</span>
                    <span className="td-historyCard__ago">
                      {Math.max(1, currentYear - item.year)}年前
                    </span>
                  </div>
                  <div className="td-historyCard__preview">
                    {item.preview || '（无内容）'}
                  </div>
                  <div className="td-historyCard__meta">字数：{item.word_count}</div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </main>

      {authMode !== 'none' ? (
        <div className="td-overlay" role="dialog" aria-modal="true" aria-label="密码验证">
          <section className="td-authCard">
            <h2 className="td-authCard__title">
              {authMode === 'set' ? '首次设置密码' : '请输入密码解锁'}
            </h2>
            <div className="td-authCard__subtitle">
              {authMode === 'set'
                ? '规则：至少 8 位，且必须同时包含字母和数字（例如：Trace2026）'
                : '为保护本地加密内容，需要定期重新验证。'}
            </div>

            <div className="td-authCard__row">
              <input
                className="td-input"
                type="password"
                value={password}
                onChange={(e) => setPasswordInput(e.currentTarget.value)}
                placeholder={PASSWORD_PLACEHOLDER}
                aria-label="密码"
              />
              <button
                type="button"
                className="td-btn td-btn--primary"
                onClick={() => void handleAuthSubmit()}
              >
                {authMode === 'set' ? '设置' : '解锁'}
              </button>
            </div>

            {authMode === 'verify' && authStatus?.needs_verify ? (
              <div className="td-authCard__hint">
                距离上次验证超过 7 天，需要重新验证。
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
