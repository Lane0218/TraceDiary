import React, { useEffect, useMemo, useState } from "react";

import type { AuthStatus } from "./types/auth";
import type { DiaryEntry } from "./types/diary";
import { getAuthStatus, getDiary, saveDiary, setPassword, verifyPassword } from "./services/tauriCommands";
import { getTodayYmd } from "./utils/dateUtils";

import "./App.css";

type AuthMode = "none" | "set" | "verify";

const PASSWORD_PLACEHOLDER = "至少 8 位，包含字母和数字";

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
        setDiaryMeta(null);
        setStatusText("未找到该日期的日记");
        return;
      }

      setContent(entry.content);
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
      setErrorText(authMode === "set" ? "设置密码失败，请检查规则后重试" : "密码错误，请重试");
      console.error("Auth failed:", error);
    }
  };

  const handleSave = async (): Promise<void> => {
    try {
      setErrorText("");
      setStatusText("保存中...");

      const saved = await saveDiary({ date: selectedDate, content });
      setDiaryMeta({ word_count: saved.word_count, modified_at: saved.modified_at });
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
          <p className="hint">
            {authMode === "verify" && authStatus?.needs_verify ? "距离上次验证超过 7 天，需要重新验证。" : ""}
          </p>
        </section>
      ) : (
        <section className="diary-panel" aria-label="日记编辑器">
          <div className="row">
            <label htmlFor="date-input">日期</label>
            <input
              id="date-input"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.currentTarget.value)}
            />
            <button type="button" onClick={() => void loadDiary(selectedDate)}>
              加载
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
        </section>
      )}

      {statusText ? <p className="status">{statusText}</p> : null}
      {errorText ? <p className="error">{errorText}</p> : null}
    </main>
  );
}

export default App;
