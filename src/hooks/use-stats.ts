import { useEffect, useMemo, useState } from 'react'
import { DIARY_INDEX_TYPE, listDiariesByIndex, type DiaryRecord } from '../services/indexeddb'
import type { StatsSummary } from '../types/stats'
import { buildStatsSummary } from '../utils/stats'

interface UseStatsDependencies {
  loadRecords: () => Promise<DiaryRecord[]>
  now: () => Date
}

interface UseStatsOptions {
  reloadSignal?: number
}

export interface UseStatsResult {
  records: DiaryRecord[]
  summary: StatsSummary
  isLoading: boolean
  error: string | null
}

const defaultDependencies: UseStatsDependencies = {
  loadRecords: async () => {
    const [dailyRecords, yearlySummaryRecords] = await Promise.all([
      listDiariesByIndex(DIARY_INDEX_TYPE, 'daily'),
      listDiariesByIndex(DIARY_INDEX_TYPE, 'yearly_summary'),
    ])
    return [...dailyRecords, ...yearlySummaryRecords]
  },
  now: () => new Date(),
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '未知错误'
}

export function useStats(
  options: UseStatsOptions = {},
  dependencies: UseStatsDependencies = defaultDependencies,
): UseStatsResult {
  const [records, setRecords] = useState<DiaryRecord[]>([])
  const [loadedSignal, setLoadedSignal] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reloadSignal = options.reloadSignal ?? 0
  const isLoading = loadedSignal !== reloadSignal

  useEffect(() => {
    let mounted = true

    void dependencies
      .loadRecords()
      .then((loaded) => {
        if (!mounted) {
          return
        }
        setRecords(loaded)
        setError(null)
        setLoadedSignal(reloadSignal)
      })
      .catch((loadError: unknown) => {
        if (!mounted) {
          return
        }
        setError(getErrorMessage(loadError))
        setLoadedSignal(reloadSignal)
      })

    return () => {
      mounted = false
    }
  }, [dependencies, reloadSignal])

  const summary = useMemo(() => buildStatsSummary(records, dependencies.now()), [dependencies, records])

  return {
    records,
    summary,
    isLoading,
    error,
  }
}
