use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone)]
pub struct DiaryMeta {
    pub date: String,
    pub year: i32,
    pub month: i32,
    pub day: i32,
    pub entry_type: String,
    pub filename: String,
    pub word_count: i64,
    pub created_at: String,
    pub modified_at: String,
}

pub fn find_by_date(conn: &Connection, date: &str) -> Result<Option<DiaryMeta>, rusqlite::Error> {
    conn.query_row(
        "SELECT date, year, month, day, entry_type, filename, word_count, created_at, modified_at
         FROM diaries
         WHERE date = ?1",
        params![date],
        |row| {
            Ok(DiaryMeta {
                date: row.get(0)?,
                year: row.get(1)?,
                month: row.get(2)?,
                day: row.get(3)?,
                entry_type: row.get(4)?,
                filename: row.get(5)?,
                word_count: row.get(6)?,
                created_at: row.get(7)?,
                modified_at: row.get(8)?,
            })
        },
    )
    .optional()
}

pub fn upsert_daily(
    conn: &Connection,
    date: &str,
    year: i32,
    month: i32,
    day: i32,
    filename: &str,
    word_count: i64,
    now_ts: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO diaries
           (date, year, month, day, entry_type, filename, word_count, created_at, modified_at)
         VALUES
           (?1,   ?2,   ?3,    ?4,  'daily',    ?5,       ?6,         ?7,        ?7)
         ON CONFLICT(date) DO UPDATE SET
           year        = excluded.year,
           month       = excluded.month,
           day         = excluded.day,
           entry_type  = excluded.entry_type,
           filename    = excluded.filename,
           word_count  = excluded.word_count,
           modified_at = excluded.modified_at",
        params![date, year, month, day, filename, word_count, now_ts],
    )?;
    Ok(())
}

