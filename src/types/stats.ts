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

export interface MonthlyTrendPoint {
  label: string
  totalWordCount: number
  entryCount: number
  momWordDelta: number | null
  momWordDeltaRatio: number | null
}

export interface YearlyTrendPoint {
  year: number
  totalWordCount: number
  activeDayCount: number
  entryCount: number
}

export interface StatsChartModel {
  monthly: MonthlyTrendPoint[]
  yearly: YearlyTrendPoint[]
  monthlyWordMax: number
  monthlyEntryMax: number
  yearlyWordMax: number
  yearlyActiveDayMax: number
}
