import { invoke } from "@tauri-apps/api/core";

import type { AuthStatus } from "../types/auth";
import type { DiaryEntry, SaveDiaryInput } from "../types/diary";

export const getAuthStatus = async (): Promise<AuthStatus> => {
  return invoke<AuthStatus>("get_auth_status");
};

export const setPassword = async (password: string): Promise<void> => {
  await invoke("set_password", { password_input: password });
};

export const verifyPassword = async (password: string): Promise<void> => {
  await invoke("verify_password", { password_input: password });
};

export const getDiary = async (date: string): Promise<DiaryEntry | null> => {
  return invoke<DiaryEntry | null>("get_diary", { date });
};

export const saveDiary = async (input: SaveDiaryInput): Promise<DiaryEntry> => {
  return invoke<DiaryEntry>("save_diary", { input });
};
