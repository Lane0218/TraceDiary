import React, { useEffect, useMemo, useState } from "react";

import type { AuthStatus } from "./types/auth";
import type { DiaryEntry } from "./types/diary";
import { getAuthStatus, getDiary, saveDiary, setPassword, verifyPassword } from "./services/tauriCommands";
import { getTodayYmd } from "./utils/dateUtils";
import { MonthView } from "./components/Calendar/MonthView";

import "./App.css";

type AuthMode = "none" | "set" | "verify";

const PASSWORD_PLACEHOLDER = "至少 8 位，包含字母和数字";
const AUTOSAVE_DELAY_MS = 30_000;

const formatInvokeErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return String(error);
};

function App(): React.ReactElement {
  const today = useMemo(() => getTodayYmd(), []);

  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [password, setPasswordInput] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [content, setContent] = useState<string>("");
  const [diaryMeta, setDiaryMeta] = useState<Pick<DiaryEntry, "word_count" | "modified_at"> | null>(null);
  const [lastSavedContent, setLastSavedContent] = useState<string>("");

  const loadAuthStatus = async (): Promise<void> => {
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);
      if (!status.password_set) setAuthMode("set");
      else if (status.needs_verify) setAuthMode("verify");
      else setAuthMode("none");
    } catch (error: unknown) {
      setErrorText("读取认证状态失败，请重试");
      console.error("Failed to load auth status:", error);
    }
  };

  const loadDiary = async (date: string): Promise<void> => {
    try {
      setErrorText("");
      const entry = await getDiary(date);
      if (!entry) {
        setContent("");
        setLastSavedContent("");
        setDiaryMeta(null);
        setStatusText("未找到该日期的日记");
        return;
      }

      setContent(entry.content);
      setLastSavedContent(entry.content);
      setDiaryMeta({ word_count: entry.word_count, modified_at: entry.modified_at });
      setStatusText("已加载");
    } catch (error: unknown) {
      setErrorText("加载失败，请先完成密码验证");
      console.error("Failed to load diary:", error);
    }
  };

  useEffect(() => {
    void loadAuthStatus();
  }, []);

  useEffect(() => {
    if (authMode !== "none") return;
    if (!authStatus) return;
    void loadDiary(selectedDate);
  }, [authMode, authStatus, selectedDate]);

  // 30 秒无输入自动保存（防抖）。
  useEffect(() => {
    if (authMode !== "none") return;

    // 未解锁 / 尚未加载认证状态时，不触发自动保存。
    if (!authStatus) return;

    // 内容没变就不保存。
    if (content === lastSavedContent) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setErrorText("");
          setStatusText("自动保存中...");
          const saved = await saveDiary({ date: selectedDate, content });
          setDiaryMeta({ word_count: saved.word_count, modified_at: saved.modified_at });
          setLastSavedContent(content);
          setStatusText("已自动保存");
        } catch (error: unknown) {
          setErrorText("自动保存失败，请重试");
          console.error("Failed to auto-save diary:", error);
        }
      })();
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [authMode, authStatus, content, lastSavedContent, selectedDate]);

  const handleAuthSubmit = async (): Promise<void> => {
    try {
      setErrorText("");
      setStatusText("");
      if (authMode === "set") await setPassword(password);
      if (authMode === "verify") await verifyPassword(password);

      setPasswordInput("");
      setAuthMode("none");
      await loadAuthStatus();
      await loadDiary(selectedDate);
    } catch (error: unknown) {
      const detail = formatInvokeErrorMessage(error);
      setErrorText(authMode === "set" ? `设置密码失败：${detail}` : `密码验证失败：${detail}`);
      console.error("Auth failed:", error);
    }
  };

  const handleSave = async (): Promise<void> => {
    try {
      setErrorText("");
      setStatusText("保存中...");

      const saved = await saveDiary({ date: selectedDate, content });
      setDiaryMeta({ word_count: saved.word_count, modified_at: saved.modified_at });
      setLastSavedContent(content);
      setStatusText("已保存");
    } catch (error: unknown) {
      setErrorText("保存失败，请先完成密码验证");
      console.error("Failed to save diary:", error);
    }
  };

  return (
    <main className="container">
      <h1>TraceDiary</h1>

      {authMode !== "none" ? (
        <section className="auth-panel" aria-label="密码验证">
          <h2>{authMode === "set" ? "首次设置密码" : "请输入密码解锁"}</h2>
          <div className="row">
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordInput(e.currentTarget.value)}
              placeholder={PASSWORD_PLACEHOLDER}
              aria-label="密码"
            />
            <button type="button" onClick={() => void handleAuthSubmit()}>
              {authMode === "set" ? "设置" : "解锁"}
            </button>
          </div>
          <p className="hint">{authMode === "set" ? "规则：至少 8 位，且必须同时包含字母和数字（例如：Trace2026）" : ""}</p>
          <p className="hint">
            {authMode === "verify" && authStatus?.needs_verify ? "距离上次验证超过 7 天，需要重新验证。" : ""}
          </p>
        </section>
      ) : (
        <section className="diary-panel" aria-label="日记编辑器">
          <div className="diary-layout">
            <aside className="calendar-panel">
              <MonthView selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              <button type="button" className="calendar-today" onClick={() => setSelectedDate(today)}>
                回到今天
              </button>
            </aside>

            <div className="editor-panel">
              <div className="row editor-actions">
                <div className="selected-date" aria-label="当前选择日期">
                  {selectedDate}
                </div>
                <button type="button" onClick={() => void loadDiary(selectedDate)}>
                  刷新
                </button>
                <button type="button" onClick={() => void handleSave()}>
                  保存
                </button>
              </div>

              <textarea
                className="diary-textarea"
                value={content}
                onChange={(e) => setContent(e.currentTarget.value)}
                placeholder="写点什么..."
                rows={14}
              />

              <div className="meta-row">
                <span>字数：{diaryMeta?.word_count ?? 0}</span>
                <span>修改时间：{diaryMeta?.modified_at ? diaryMeta.modified_at : "-"}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {statusText ? <p className="status">{statusText}</p> : null}
      {errorText ? <p className="error">{errorText}</p> : null}
    </main>
  );
}

export default App;
