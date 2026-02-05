use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::crypto::{encryption, keyring_store};
use crate::database::{diary_repo, open_connection};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub date: String,
    pub content: String,
    pub word_count: i64,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDiaryInput {
    pub date: String,
    pub content: String,
}

fn now_unix_seconds_string() -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("failed to get system time: {e}"))?;
    Ok(now.as_secs().to_string())
}

fn count_non_whitespace_chars(content: &str) -> i64 {
    content.chars().filter(|c| !c.is_whitespace()).count() as i64
}

fn parse_ymd(date: &str) -> Result<(i32, i32, i32), String> {
    // YYYY-MM-DD
    if date.len() != 10 {
        return Err("日期格式错误，应为 YYYY-MM-DD".to_string());
    }
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err("日期格式错误，应为 YYYY-MM-DD".to_string());
    }

    let year: i32 = parts[0]
        .parse()
        .map_err(|_| "年份格式错误".to_string())?;
    let month: i32 = parts[1]
        .parse()
        .map_err(|_| "月份格式错误".to_string())?;
    let day: i32 = parts[2]
        .parse()
        .map_err(|_| "日期格式错误".to_string())?;

    if year < 2022 {
        return Err("仅支持 2022 年及之后的日期".to_string());
    }
    if !(1..=12).contains(&month) {
        return Err("月份必须在 1-12".to_string());
    }
    if !(1..=31).contains(&day) {
        return Err("日期必须在 1-31".to_string());
    }

    Ok((year, month, day))
}

fn resolve_diary_path(state: &AppState, date: &str) -> Result<PathBuf, String> {
    let diaries_dir = state.diaries_dir();
    fs::create_dir_all(&diaries_dir).map_err(|e| format!("create diaries dir failed: {e}"))?;
    Ok(diaries_dir.join(format!("{date}.md")))
}

#[tauri::command]
pub fn get_diary(state: State<'_, AppState>, date: String) -> Result<Option<DiaryEntry>, String> {
    let _ = parse_ymd(&date)?;

    let master_key = keyring_store::load_master_key()
        .map_err(|e| format!("load master key failed: {e}"))?
        .ok_or_else(|| "未解锁：请先输入密码".to_string())?;

    let diary_path = resolve_diary_path(&state, &date)?;
    if !diary_path.exists() {
        return Ok(None);
    }

    let encrypted_text =
        fs::read_to_string(&diary_path).map_err(|e| format!("read diary failed: {e}"))?;
    let content = encryption::decrypt_text(&master_key, &encrypted_text)
        .map_err(|e| format!("decrypt diary failed: {e}"))?;

    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;
    let meta = diary_repo::find_by_date(&conn, &date).map_err(|e| format!("read meta failed: {e}"))?;

    let (word_count, modified_at) = match meta {
        None => (count_non_whitespace_chars(&content), "".to_string()),
        Some(m) => (m.word_count, m.modified_at),
    };

    Ok(Some(DiaryEntry {
        date,
        content,
        word_count,
        modified_at,
    }))
}

#[tauri::command]
pub fn save_diary(state: State<'_, AppState>, input: SaveDiaryInput) -> Result<DiaryEntry, String> {
    let (year, month, day) = parse_ymd(&input.date)?;

    let master_key = keyring_store::load_master_key()
        .map_err(|e| format!("load master key failed: {e}"))?
        .ok_or_else(|| "未解锁：请先输入密码".to_string())?;

    let now_ts = now_unix_seconds_string()?;
    let word_count = count_non_whitespace_chars(&input.content);

    let diary_path = resolve_diary_path(&state, &input.date)?;
    let encrypted_text = encryption::encrypt_text(&master_key, &input.content)
        .map_err(|e| format!("encrypt diary failed: {e}"))?;
    fs::write(&diary_path, encrypted_text).map_err(|e| format!("write diary failed: {e}"))?;

    let rel_filename = format!("diaries/{}.md", input.date);
    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;
    diary_repo::upsert_daily(
        &conn,
        &input.date,
        year,
        month,
        day,
        &rel_filename,
        word_count,
        &now_ts,
    )
    .map_err(|e| format!("save meta failed: {e}"))?;

    Ok(DiaryEntry {
        date: input.date,
        content: input.content,
        word_count,
        modified_at: now_ts,
    })
}

