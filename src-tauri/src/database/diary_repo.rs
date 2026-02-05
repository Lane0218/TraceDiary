use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone)]
pub struct DiaryMeta {
    pub word_count: i64,
    pub modified_at: String,
}

#[derive(Debug, Clone)]
pub struct HistoricalMeta {
    pub date: String,
    pub year: i32,
    pub word_count: i64,
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

pub fn list_daily_days_in_month(
    conn: &Connection,
    year: i32,
    month: i32,
) -> Result<Vec<i32>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT day
         FROM diaries
         WHERE year = ?1
           AND month = ?2
           AND entry_type = 'daily'
         ORDER BY day ASC",
    )?;

    let rows = stmt.query_map(params![year, month], |row| row.get::<_, i32>(0))?;
    let mut days = Vec::new();
    for day in rows {
        days.push(day?);
    }
    Ok(days)
}

pub fn list_historical_meta_by_month_day(
    conn: &Connection,
    month: i32,
    day: i32,
    min_year: i32,
    max_year_exclusive: i32,
) -> Result<Vec<HistoricalMeta>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT date, year, word_count
         FROM diaries
         WHERE month = ?1
           AND day = ?2
           AND year >= ?3
           AND year < ?4
           AND entry_type = 'daily'
         ORDER BY year DESC",
    )?;

    let rows = stmt.query_map(params![month, day, min_year, max_year_exclusive], |row| {
        Ok(HistoricalMeta {
            date: row.get(0)?,
            year: row.get(1)?,
            word_count: row.get(2)?,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_daily_days_in_month_returns_sorted_unique_days() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("schema.sql")).unwrap();

        // Two entries in Feb, one in March.
        upsert_daily(
            &conn,
            UpsertDailyInput {
                date: "2026-02-05",
                year: 2026,
                month: 2,
                day: 5,
                filename: "diaries/2026-02-05.md",
                word_count: 1,
                now_ts: "1",
            },
        )
        .unwrap();

        upsert_daily(
            &conn,
            UpsertDailyInput {
                date: "2026-02-20",
                year: 2026,
                month: 2,
                day: 20,
                filename: "diaries/2026-02-20.md",
                word_count: 1,
                now_ts: "2",
            },
        )
        .unwrap();

        upsert_daily(
            &conn,
            UpsertDailyInput {
                date: "2026-03-01",
                year: 2026,
                month: 3,
                day: 1,
                filename: "diaries/2026-03-01.md",
                word_count: 1,
                now_ts: "3",
            },
        )
        .unwrap();

        let days = list_daily_days_in_month(&conn, 2026, 2).unwrap();
        assert_eq!(days, vec![5, 20]);
    }

    #[test]
    fn list_historical_meta_excludes_current_year_and_sorts_desc() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("schema.sql")).unwrap();

        for year in 2022..=2026 {
            let date = format!("{year}-02-05");
            upsert_daily(
                &conn,
                UpsertDailyInput {
                    date: &date,
                    year,
                    month: 2,
                    day: 5,
                    filename: "x",
                    word_count: year as i64,
                    now_ts: "1",
                },
            )
            .unwrap();
        }

        let items = list_historical_meta_by_month_day(&conn, 2, 5, 2022, 2026).unwrap();
        assert_eq!(items.len(), 4);
        assert_eq!(items[0].year, 2025);
        assert_eq!(items[3].year, 2022);
    }
}
