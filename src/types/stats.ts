export type StreakStatus = 'none' | 'active' | 'broken'

export interface YearlyStatsItem {
  year: number
  dailyCount: number
  yearlySummaryCount: number
  totalWordCount: number
  activeDayCount: number
}

export interface MonthlyStatsItem {
  year: number
  month: number
  label: string
  dailyCount: number
  yearlySummaryCount: number
  totalWordCount: number
}

export interface StatsSummary {
  totalDailyCount: number
  totalYearlySummaryCount: number
  totalWordCount: number
  currentStreakDays: number
  longestStreakDays: number
  currentYearWordCount: number
  currentYearDailyCount: number
  currentYearSummaryCount: number
  streakStatus: StreakStatus
  streakLastDate: string | null
  streakGapDays: number | null
  yearlyItems: YearlyStatsItem[]
  recentMonthItems: MonthlyStatsItem[]
}
