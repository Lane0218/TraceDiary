use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::crypto::{encryption, keyring_store};
use crate::database::{diary_repo, open_connection};
use crate::state::AppState;

const MIN_HISTORY_YEAR: i32 = 2022;

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoricalDiary {
    pub date: String,
    pub year: i32,
    pub preview: String,
    pub word_count: i64,
}

fn resolve_diary_path(state: &AppState, date: &str) -> Result<PathBuf, String> {
    let diaries_dir = state.diaries_dir();
    Ok(diaries_dir.join(format!("{date}.md")))
}

fn preview_first_non_empty_lines(content: &str, max_lines: usize) -> String {
    let mut out = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(trimmed.to_string());
        if out.len() >= max_lines {
            break;
        }
    }
    out.join("\n")
}

#[tauri::command]
pub fn list_historical_diaries(
    state: State<'_, AppState>,
    month: i32,
    day: i32,
    current_year: i32,
) -> Result<Vec<HistoricalDiary>, String> {
    if current_year < MIN_HISTORY_YEAR {
        return Ok(vec![]);
    }
    if !(1..=12).contains(&month) {
        return Err("月份必须在 1-12".to_string());
    }
    if !(1..=31).contains(&day) {
        return Err("日期必须在 1-31".to_string());
    }

    let master_key = keyring_store::load_master_key()
        .map_err(|e| format!("load master key failed: {e}"))?
        .ok_or_else(|| "未解锁：请先输入密码".to_string())?;

    let conn = open_connection(&state.db_path).map_err(|e| format!("open db failed: {e}"))?;
    let metas = diary_repo::list_historical_meta_by_month_day(
        &conn,
        month,
        day,
        MIN_HISTORY_YEAR,
        current_year,
    )
    .map_err(|e| format!("list historical meta failed: {e}"))?;

    let mut items = Vec::with_capacity(metas.len());
    for meta in metas {
        let path = resolve_diary_path(&state, &meta.date)?;
        let preview = if path.exists() {
            let encrypted_text =
                fs::read_to_string(&path).map_err(|e| format!("read diary failed: {e}"))?;
            let content = encryption::decrypt_text(&master_key, &encrypted_text)
                .map_err(|e| format!("decrypt diary failed: {e}"))?;
            preview_first_non_empty_lines(&content, 3)
        } else {
            String::new()
        };

        items.push(HistoricalDiary {
            date: meta.date,
            year: meta.year,
            preview,
            word_count: meta.word_count,
        });
    }

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_picks_first_non_empty_lines() {
        let s = "\n\nline1\n\n line2 \n\nline3\nline4\n";
        assert_eq!(preview_first_non_empty_lines(s, 3), "line1\nline2\nline3");
    }
}
