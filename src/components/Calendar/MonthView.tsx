import React, { useEffect, useMemo, useState } from 'react';

import {
  addMonths,
  dateToYmd,
  daysInMonth,
  getTodayYmd,
  startOfMonth,
  weekdayIndexMondayStart,
  ymdToDateLocal,
} from '../../utils/dateUtils';

export interface MonthViewProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (ymd: string) => void;
  entryDays?: ReadonlySet<number> | null;
  onMonthChange?: (year: number, month: number) => void; // month: 1-12
}

const WEEKDAY_LABELS_ZH = ['一', '二', '三', '四', '五', '六', '日'] as const;

const formatMonthLabel = (viewMonth: Date): string => {
  // Example: 2026年2月
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(
    viewMonth,
  );
};

export function MonthView({
  selectedDate,
  onSelectDate,
  entryDays,
  onMonthChange,
}: MonthViewProps): React.ReactElement {
  const todayYmd = useMemo(() => getTodayYmd(), []);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = ymdToDateLocal(selectedDate);
    return startOfMonth(d ?? new Date());
  });

  useEffect(() => {
    const d = ymdToDateLocal(selectedDate);
    if (!d) return;
    const next = startOfMonth(d);
    setViewMonth((prev) => {
      if (
        prev.getFullYear() === next.getFullYear() &&
        prev.getMonth() === next.getMonth()
      )
        return prev;
      return next;
    });
  }, [selectedDate]);

  const { year, monthIndex0 } = useMemo(
    () => ({ year: viewMonth.getFullYear(), monthIndex0: viewMonth.getMonth() }),
    [viewMonth],
  );

  useEffect(() => {
    onMonthChange?.(year, monthIndex0 + 1);
  }, [monthIndex0, onMonthChange, year]);

  const gridCells = useMemo(() => {
    const firstDay = new Date(year, monthIndex0, 1);
    const leading = weekdayIndexMondayStart(firstDay);
    const days = daysInMonth(year, monthIndex0);
    const totalCells = 6 * 7;

    return Array.from({ length: totalCells }, (_, cellIndex) => {
      const dayNumber = cellIndex - leading + 1;
      if (dayNumber < 1 || dayNumber > days) return null;

      const date = new Date(year, monthIndex0, dayNumber);
      const ymd = dateToYmd(date);

      return {
        dayNumber,
        ymd,
        isToday: ymd === todayYmd,
        isSelected: ymd === selectedDate,
        hasEntry: entryDays ? entryDays.has(dayNumber) : false,
      };
    });
  }, [entryDays, monthIndex0, selectedDate, todayYmd, year]);

  return (
    <section className="td-cal" aria-label="日历">
      <div className="td-cal__header">
        <button
          type="button"
          className="td-cal__nav"
          onClick={() => setViewMonth((d) => addMonths(d, -1))}
          aria-label="上个月"
        >
          ←
        </button>
        <div className="td-cal__title" aria-label="当前月份">
          {formatMonthLabel(viewMonth)}
        </div>
        <button
          type="button"
          className="td-cal__nav"
          onClick={() => setViewMonth((d) => addMonths(d, 1))}
          aria-label="下个月"
        >
          →
        </button>
      </div>

      <div className="td-cal__weekdays" aria-hidden="true">
        {WEEKDAY_LABELS_ZH.map((w) => (
          <div key={w} className="td-cal__weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="td-cal__grid" role="grid" aria-label="月份日期">
        {gridCells.map((cell, idx) => {
          if (!cell)
            return <div key={`e-${idx}`} className="td-cal__cell td-cal__cell--empty" />;

          const className = [
            'td-cal__cell',
            cell.hasEntry ? 'has-entry' : '',
            cell.isToday ? 'is-today' : '',
            cell.isSelected ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={cell.ymd}
              type="button"
              className={className}
              onClick={() => onSelectDate(cell.ymd)}
              aria-label={cell.ymd}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-pressed={cell.isSelected}
            >
              {cell.dayNumber}
            </button>
          );
        })}
      </div>
    </section>
  );
}
