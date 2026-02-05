use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone)]
pub struct DiaryMeta {
    pub word_count: i64,
    pub modified_at: String,
}

pub fn find_by_date(conn: &Connection, date: &str) -> Result<Option<DiaryMeta>, rusqlite::Error> {
    conn.query_row(
        "SELECT word_count, modified_at
         FROM diaries
         WHERE date = ?1",
        params![date],
        |row| {
            Ok(DiaryMeta {
                word_count: row.get(0)?,
                modified_at: row.get(1)?,
            })
        },
    )
    .optional()
}

pub struct UpsertDailyInput<'a> {
    pub date: &'a str,
    pub year: i32,
    pub month: i32,
    pub day: i32,
    pub filename: &'a str,
    pub word_count: i64,
    pub now_ts: &'a str,
}

pub fn upsert_daily(conn: &Connection, input: UpsertDailyInput<'_>) -> Result<(), rusqlite::Error> {
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
        params![
            input.date,
            input.year,
            input.month,
            input.day,
            input.filename,
            input.word_count,
            input.now_ts
        ],
    )?;
    Ok(())
}
