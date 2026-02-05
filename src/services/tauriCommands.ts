import { invoke } from '@tauri-apps/api/core';

import type { AuthStatus } from '../types/auth';
import type { DiaryEntry, SaveDiaryInput } from '../types/diary';
import type { HistoricalDiary } from '../types/history';

export const getAuthStatus = async (): Promise<AuthStatus> => {
  return invoke<AuthStatus>('get_auth_status');
};

export const setPassword = async (password: string): Promise<void> => {
  // Tauri 会将 Rust 的 snake_case 参数名映射为 JS 侧 camelCase（password_input -> passwordInput）
  await invoke('set_password', { passwordInput: password });
};

export const verifyPassword = async (password: string): Promise<void> => {
  await invoke('verify_password', { passwordInput: password });
};

export const getDiary = async (date: string): Promise<DiaryEntry | null> => {
  return invoke<DiaryEntry | null>('get_diary', { date });
};

export const saveDiary = async (input: SaveDiaryInput): Promise<DiaryEntry> => {
  return invoke<DiaryEntry>('save_diary', { input });
};

export const listDiaryDaysInMonth = async (
  year: number,
  month: number,
): Promise<number[]> => {
  return invoke<number[]>('list_diary_days_in_month', { year, month });
};

export const listHistoricalDiaries = async (
  month: number,
  day: number,
  currentYear: number,
): Promise<HistoricalDiary[]> => {
  return invoke<HistoricalDiary[]>('list_historical_diaries', {
    month,
    day,
    currentYear,
  });
};
