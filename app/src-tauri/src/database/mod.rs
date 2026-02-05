use std::error::Error;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

fn apply_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(include_str!("schema.sql"))
}

fn ensure_parent_dir_exists(path: &Path) -> Result<(), Box<dyn Error>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, Box<dyn Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir.join("database").join("trace.db"))
}

pub fn init_database(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let db_path = resolve_db_path(app)?;
    ensure_parent_dir_exists(&db_path)?;

    let conn = Connection::open(db_path)?;
    apply_schema(&conn)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_creates_expected_tables() {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();

        let diaries_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='diaries'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(diaries_count, 1);

        let settings_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='settings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(settings_count, 1);
    }
}
