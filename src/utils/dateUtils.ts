export const getTodayYmd = (): string => {
  // YYYY-MM-DD in local time (avoid UTC day-shift).
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export interface YmdParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export const parseYmd = (ymd: string): YmdParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Validate by round-tripping through Date in local time.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;

  return { year, month, day };
};

export const dateToYmd = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const ymdToDateLocal = (ymd: string): Date | null => {
  const parts = parseYmd(ymd);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
};

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date: Date, deltaMonths: number): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setMonth(d.getMonth() + deltaMonths);
  return d;
};

export const daysInMonth = (year: number, monthIndex0: number): number =>
  new Date(year, monthIndex0 + 1, 0).getDate();

export const weekdayIndexMondayStart = (date: Date): number => (date.getDay() + 6) % 7;
