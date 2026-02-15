import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'
import { useToast } from '../../hooks/use-toast'
import { getDiary, getSyncBaseline, saveDiary, saveSyncBaseline } from '../../services/indexeddb'
import {
  applyImportCandidates,
  buildImportResult,
  buildImportSourceFile,
  prepareImportPreview,
  type ImportCandidateEntry,
  type ImportConflictItem,
  type ImportResult,
} from '../../services/import'
import { autoUploadImportedEntries, type ImportAutoUploadResult } from '../../services/import-sync'
import { createDiaryUploadExecutor } from '../../services/sync'
import { getSyncAvailability } from '../../utils/sync-availability'
import ImportConflictDialog from './import-conflict-dialog'
import ImportResultDialog from './import-result-dialog'

interface ImportDataPanelProps {
  auth: UseAuthResult
}

interface ImportExecutionState {
  importResult: ImportResult
  uploadResult: ImportAutoUploadResult | null
  uploadSkippedReason: string | null
}

const IMPORT_IDLE_HINT = '支持批量导入 .md/.txt，导入后自动上传本次条目'

function uniqueEntryIds(entryIds: string[]): string[] {
  return [...new Set(entryIds)]
}

export default function ImportDataPanel({ auth }: ImportDataPanelProps) {
  const { push: pushToast } = useToast()
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgressLabel, setImportProgressLabel] = useState<string | null>(null)
  const [importReadyCandidates, setImportReadyCandidates] = useState<ImportCandidateEntry[]>([])
  const [importConflictQueue, setImportConflictQueue] = useState<ImportConflictItem[]>([])
  const [importConflictIndex, setImportConflictIndex] = useState(0)
  const [importOverwriteEntryIds, setImportOverwriteEntryIds] = useState<string[]>([])
  const [importSkippedEntryIds, setImportSkippedEntryIds] = useState<string[]>([])
  const [importInvalidItems, setImportInvalidItems] = useState<Array<{ name: string; reason: string }>>([])
  const [importFailedItems, setImportFailedItems] = useState<Array<{ name: string; reason: string }>>([])
  const [importExecutionState, setImportExecutionState] = useState<ImportExecutionState | null>(null)

  const giteeBranch = auth.state.config?.giteeBranch?.trim() || 'master'
  const dataEncryptionKey = auth.state.dataEncryptionKey
  const syncAvailability = useMemo(
    () =>
      getSyncAvailability({
        stage: auth.state.stage,
        giteeOwner: auth.state.config?.giteeOwner,
        giteeRepoName: auth.state.config?.giteeRepoName,
        tokenInMemory: auth.state.tokenInMemory,
        dataEncryptionKey,
      }),
    [
      auth.state.config?.giteeOwner,
      auth.state.config?.giteeRepoName,
      auth.state.stage,
      auth.state.tokenInMemory,
      dataEncryptionKey,
    ],
  )
  const canSyncToRemote = syncAvailability.canSyncToRemote
  const syncDisabledMessage = syncAvailability.disabledMessage
  const uploadMetadata = canSyncToRemote
    ? createDiaryUploadExecutor({
        token: auth.state.tokenInMemory as string,
        owner: auth.state.config?.giteeOwner as string,
        repo: auth.state.config?.giteeRepoName as string,
        branch: giteeBranch,
        dataEncryptionKey: dataEncryptionKey as CryptoKey,
        syncMetadata: true,
      })
    : undefined

  const activeImportConflict = importConflictQueue[importConflictIndex] ?? null

  const resetImportSession = useCallback(() => {
    setImportReadyCandidates([])
    setImportConflictQueue([])
    setImportConflictIndex(0)
    setImportOverwriteEntryIds([])
    setImportSkippedEntryIds([])
    setImportInvalidItems([])
    setImportFailedItems([])
  }, [])

  const executeImportPlan = useCallback(
    async (input: {
      readyCandidates: ImportCandidateEntry[]
      conflicts: ImportConflictItem[]
      overwriteEntryIds: string[]
      skippedEntryIds: string[]
      invalid: Array<{ name: string; reason: string }>
      failed: Array<{ name: string; reason: string }>
    }) => {
      const overwriteSet = new Set(input.overwriteEntryIds)
      const overwriteCandidates: ImportCandidateEntry[] = input.conflicts
        .filter((item) => overwriteSet.has(item.entryId))
        .map((item) => ({
          sourceName: item.sourceName,
          entry: item.incoming,
        }))
      const candidatesToPersist = [...input.readyCandidates, ...overwriteCandidates]

      setIsImporting(true)
      setImportProgressLabel('正在写入本地数据...')
      try {
        const applyResult = await applyImportCandidates(candidatesToPersist, {
          loadExistingDiary: getDiary,
          saveDiary,
        })
        const importResult = buildImportResult({
          persisted: applyResult.persisted,
          skippedEntryIds: input.skippedEntryIds,
          overwrittenEntryIds: input.overwriteEntryIds,
          invalid: input.invalid,
          failed: input.failed,
          persistFailed: applyResult.failed.map((item) => ({
            name: item.name,
            reason: item.reason,
          })),
        })

        let uploadResult: ImportAutoUploadResult | null = null
        let uploadSkippedReason: string | null = null

        if (applyResult.persisted.length === 0) {
          uploadSkippedReason = '未执行自动上传：没有可上传的导入条目。'
        } else if (!canSyncToRemote) {
          uploadSkippedReason = `未执行自动上传：${syncDisabledMessage}`
          pushToast({
            kind: 'push',
            level: 'warning',
            message: uploadSkippedReason,
          })
        } else if (!uploadMetadata) {
          uploadSkippedReason = '未执行自动上传：上传执行器不可用。'
          pushToast({
            kind: 'push',
            level: 'warning',
            message: uploadSkippedReason,
          })
        } else {
          pushToast({
            kind: 'push',
            level: 'info',
            message: `导入完成，开始自动上传（${applyResult.persisted.length} 条）...`,
            autoDismiss: false,
          })

          uploadResult = await autoUploadImportedEntries(applyResult.persisted, {
            uploadDiary: uploadMetadata,
            loadBaseline: (entryId) => getSyncBaseline(entryId),
            saveBaseline: (baseline) => saveSyncBaseline(baseline),
            onProgress: ({ current, total }) => {
              setImportProgressLabel(`正在自动上传 ${current}/${total}`)
            },
          })

          if (uploadResult.failed.length > 0) {
            pushToast({
              kind: 'push',
              level: 'warning',
              message: `自动上传完成：成功 ${uploadResult.success.length}，失败 ${uploadResult.failed.length}`,
            })
          } else {
            pushToast({
              kind: 'push',
              level: 'success',
              message: `导入并自动上传完成（${uploadResult.success.length} 条）`,
            })
          }
        }

        setImportExecutionState({
          importResult,
          uploadResult,
          uploadSkippedReason,
        })

        if (importResult.success.length === 0) {
          pushToast({
            kind: 'system',
            level: 'warning',
            message: '本次未导入任何有效条目',
          })
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误'
        const importResult = buildImportResult({
          persisted: [],
          skippedEntryIds: input.skippedEntryIds,
          overwrittenEntryIds: input.overwriteEntryIds,
          invalid: input.invalid,
          failed: [...input.failed, { name: '导入批次', reason: `执行失败：${reason}` }],
        })
        setImportExecutionState({
          importResult,
          uploadResult: null,
          uploadSkippedReason: '未执行自动上传：导入流程异常终止。',
        })
        pushToast({
          kind: 'system',
          level: 'error',
          message: `导入失败：${reason}`,
        })
      } finally {
        resetImportSession()
        setIsImporting(false)
        setImportProgressLabel(null)
      }
    },
    [canSyncToRemote, pushToast, resetImportSession, syncDisabledMessage, uploadMetadata],
  )

  const runImportWithPendingSelections = useCallback(
    (overwriteEntryIds: string[], skippedEntryIds: string[]) => {
      void executeImportPlan({
        readyCandidates: importReadyCandidates,
        conflicts: importConflictQueue,
        overwriteEntryIds: uniqueEntryIds(overwriteEntryIds),
        skippedEntryIds: uniqueEntryIds(skippedEntryIds),
        invalid: importInvalidItems,
        failed: importFailedItems,
      })
    },
    [executeImportPlan, importConflictQueue, importFailedItems, importInvalidItems, importReadyCandidates],
  )

  const handleImportFileSelection = useCallback(
    async (files: File[]) => {
      setImportExecutionState(null)
      setIsImporting(true)
      setImportProgressLabel('正在读取导入文件...')

      try {
        const sourceResults = await Promise.all(
          files.map(async (file) => {
            try {
              const source = await buildImportSourceFile(file)
              return {
                ok: true as const,
                source,
              }
            } catch (error) {
              return {
                ok: false as const,
                name: file.name,
                reason: `读取文件失败：${error instanceof Error ? error.message : '未知错误'}`,
              }
            }
          }),
        )

        const sources = sourceResults.filter((item) => item.ok).map((item) => item.source)
        const readFailedItems = sourceResults
          .filter((item) => !item.ok)
          .map((item) => ({ name: item.name, reason: item.reason }))
        const preview = await prepareImportPreview(sources, {
          loadExistingDiary: getDiary,
        })
        const previewFailed = [...preview.failed, ...readFailedItems]

        setImportReadyCandidates(preview.ready)
        setImportConflictQueue(preview.conflicts)
        setImportConflictIndex(0)
        setImportOverwriteEntryIds([])
        setImportSkippedEntryIds([])
        setImportInvalidItems(preview.invalid)
        setImportFailedItems(previewFailed)

        if (preview.ready.length === 0 && preview.conflicts.length === 0) {
          const importResult = buildImportResult({
            persisted: [],
            skippedEntryIds: [],
            overwrittenEntryIds: [],
            invalid: preview.invalid,
            failed: previewFailed,
          })
          setImportExecutionState({
            importResult,
            uploadResult: null,
            uploadSkippedReason: '未执行自动上传：没有可导入的有效条目。',
          })
          setImportProgressLabel(null)
          setIsImporting(false)
          return
        }

        if (preview.conflicts.length > 0) {
          setImportProgressLabel(null)
          setIsImporting(false)
          pushToast({
            kind: 'system',
            level: 'info',
            message: `检测到 ${preview.conflicts.length} 条冲突，请逐条确认。`,
          })
          return
        }

        void executeImportPlan({
          readyCandidates: preview.ready,
          conflicts: preview.conflicts,
          overwriteEntryIds: [],
          skippedEntryIds: [],
          invalid: preview.invalid,
          failed: previewFailed,
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误'
        resetImportSession()
        setImportProgressLabel(null)
        setIsImporting(false)
        pushToast({
          kind: 'system',
          level: 'error',
          message: `读取导入文件失败：${reason}`,
        })
      }
    },
    [executeImportPlan, pushToast, resetImportSession],
  )

  const handleOpenImportPicker = useCallback(() => {
    if (isImporting) {
      return
    }
    importFileInputRef.current?.click()
  }, [isImporting])

  const handleImportInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files
      const files = fileList ? Array.from(fileList) : []
      event.target.value = ''
      if (files.length === 0) {
        return
      }
      void handleImportFileSelection(files)
    },
    [handleImportFileSelection],
  )

  const handleImportConflictOverwrite = useCallback(() => {
    if (!activeImportConflict) {
      return
    }
    const nextOverwriteIds = uniqueEntryIds([...importOverwriteEntryIds, activeImportConflict.entryId])
    if (importConflictIndex >= importConflictQueue.length - 1) {
      runImportWithPendingSelections(nextOverwriteIds, importSkippedEntryIds)
      return
    }
    setImportOverwriteEntryIds(nextOverwriteIds)
    setImportConflictIndex((prev) => prev + 1)
  }, [
    activeImportConflict,
    importConflictIndex,
    importConflictQueue.length,
    importOverwriteEntryIds,
    importSkippedEntryIds,
    runImportWithPendingSelections,
  ])

  const handleImportConflictSkip = useCallback(() => {
    if (!activeImportConflict) {
      return
    }
    const nextSkippedIds = uniqueEntryIds([...importSkippedEntryIds, activeImportConflict.entryId])
    if (importConflictIndex >= importConflictQueue.length - 1) {
      runImportWithPendingSelections(importOverwriteEntryIds, nextSkippedIds)
      return
    }
    setImportSkippedEntryIds(nextSkippedIds)
    setImportConflictIndex((prev) => prev + 1)
  }, [
    activeImportConflict,
    importConflictIndex,
    importConflictQueue.length,
    importOverwriteEntryIds,
    importSkippedEntryIds,
    runImportWithPendingSelections,
  ])

  const handleImportConflictClose = useCallback(() => {
    const remainingEntryIds = importConflictQueue.slice(importConflictIndex).map((item) => item.entryId)
    const nextSkippedIds = uniqueEntryIds([...importSkippedEntryIds, ...remainingEntryIds])
    runImportWithPendingSelections(importOverwriteEntryIds, nextSkippedIds)
  }, [importConflictIndex, importConflictQueue, importOverwriteEntryIds, importSkippedEntryIds, runImportWithPendingSelections])

  return (
    <>
      <article className="td-card-primary td-panel td-export-panel" aria-label="settings-import-panel">
        <header className="space-y-2">
          <p className="td-export-eyebrow">DATA IMPORT</p>
          <h3 className="font-display text-2xl text-td-text">导入日记数据</h3>
          <p className="td-export-subtitle">支持批量导入 `.md/.txt`，导入后会自动尝试上传本次条目。</p>
        </header>

        <div className="td-export-actions">
          <button
            type="button"
            className="td-btn td-export-btn"
            onClick={handleOpenImportPicker}
            disabled={isImporting}
            data-testid="settings-import-button"
          >
            {isImporting ? '正在处理导入...' : '导入 .md/.txt'}
          </button>
          <p className="td-export-warning">如遇同键冲突将逐条确认覆盖/跳过，不会直接覆盖本地内容。</p>
        </div>

        <p className="td-import-progress" data-testid="import-progress-label">
          {importProgressLabel ?? (isImporting ? '处理中...' : IMPORT_IDLE_HINT)}
        </p>

        <input
          ref={importFileInputRef}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          multiple
          className="sr-only"
          onChange={handleImportInputChange}
          data-testid="import-file-input"
        />
      </article>

      <ImportConflictDialog
        open={Boolean(activeImportConflict)}
        item={activeImportConflict}
        currentIndex={activeImportConflict ? importConflictIndex + 1 : 0}
        total={importConflictQueue.length}
        onOverwrite={handleImportConflictOverwrite}
        onSkip={handleImportConflictSkip}
        onClose={handleImportConflictClose}
      />

      <ImportResultDialog
        open={Boolean(importExecutionState)}
        importResult={importExecutionState?.importResult ?? null}
        uploadResult={importExecutionState?.uploadResult ?? null}
        uploadSkippedReason={importExecutionState?.uploadSkippedReason ?? null}
        onClose={() => setImportExecutionState(null)}
      />
    </>
  )
}
