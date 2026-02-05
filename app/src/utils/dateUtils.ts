export const getTodayYmd = (): string => {
  // YYYY-MM-DD in local time (avoid UTC day-shift).
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
