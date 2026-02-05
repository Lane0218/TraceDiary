export const getTodayYmd = (): string => {
  // YYYY-MM-DD, use UTC for deterministic format in the UI input.
  return new Date().toISOString().slice(0, 10);
};

