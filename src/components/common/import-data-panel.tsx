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
  variant?: 'card' | 'row'
}

interface ImportExecutionState {
  importResult: ImportResult
  uploadResult: ImportAutoUploadResult | null
  uploadSkippedReason: string | null
}

function uniqueEntryIds(entryIds: string[]): string[] {
  return [...new Set(entryIds)]
}

export default function ImportDataPanel({ auth, variant = 'card' }: ImportDataPanelProps) {
  const { push: pushToast } = useToast()
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)
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
  const isRow = variant === 'row'

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
      pushToast({
        kind: 'push',
        level: 'info',
        message: '导入处理中...',
        autoDismiss: false,
      })
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
            kind: 'push',
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
          kind: 'push',
          level: 'error',
          message: `导入失败：${reason}`,
        })
      } finally {
        resetImportSession()
        setIsImporting(false)
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
      pushToast({
        kind: 'push',
        level: 'info',
        message: '导入处理中...',
        autoDismiss: false,
      })

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
          setIsImporting(false)
          pushToast({
            kind: 'push',
            level: 'warning',
            message: '未找到可导入内容',
          })
          return
        }

        if (preview.conflicts.length > 0) {
          setIsImporting(false)
          pushToast({
            kind: 'push',
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
        setIsImporting(false)
        pushToast({
          kind: 'push',
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
      <article
        className={isRow ? 'td-settings-data-row' : 'td-card-primary td-panel td-export-panel'}
        aria-label="settings-import-panel"
      >
        <div className={isRow ? 'td-settings-data-row-top' : ''}>
          <header className={isRow ? 'td-settings-data-row-header' : ''}>
            <h3 className={isRow ? 'td-settings-data-row-title' : 'font-display text-2xl text-td-text'}>导入</h3>
            {isRow ? (
              <p className="td-settings-data-row-desc">支持 .md/.txt 文件，自动预检冲突并可逐条覆盖。</p>
            ) : null}
          </header>

          <div className={isRow ? 'td-settings-data-row-actions' : 'td-export-actions mt-3'}>
            <button
              type="button"
              className={isRow ? 'td-btn td-settings-data-action-btn' : 'td-btn td-export-btn'}
              onClick={handleOpenImportPicker}
              disabled={isImporting}
              data-testid="settings-import-button"
            >
              <span className={`td-sync-control-btn-label ${isImporting ? 'is-running' : ''}`}>
                {isImporting ? <span className="td-sync-control-running-dot" aria-hidden="true" /> : null}
                <span>导入</span>
              </span>
            </button>
          </div>
        </div>

        {isRow ? (
          <p className="td-settings-data-row-note">导入结果会在弹窗展示，并自动尝试上传本次导入条目。</p>
        ) : null}

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
