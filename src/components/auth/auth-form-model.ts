import type { FormEvent } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'

export interface AuthFormState {
  repoInput: string
  repoBranch: string
  token: string
  masterPassword: string
  refreshToken: string
  refreshMasterPassword: string
  readyRepoInput: string
  readyRepoBranch: string
  readyToken: string
  readyMasterPassword: string
}

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  repoInput: '',
  repoBranch: 'master',
  token: '',
  masterPassword: '',
  refreshToken: '',
  refreshMasterPassword: '',
  readyRepoInput: '',
  readyRepoBranch: 'master',
  readyToken: '',
  readyMasterPassword: '',
}

interface AuthSubmitActions {
  initializeFirstTime: UseAuthResult['initializeFirstTime']
  unlockWithMasterPassword: UseAuthResult['unlockWithMasterPassword']
  updateTokenCiphertext: UseAuthResult['updateTokenCiphertext']
  updateConnectionSettings: UseAuthResult['updateConnectionSettings']
}

export interface AuthSubmitModel {
  onSetupSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUnlockSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onRefreshTokenSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onReadyUpdateSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function createAuthSubmitModel(actions: AuthSubmitActions, form: AuthFormState): AuthSubmitModel {
  return {
    onSetupSubmit: async (event) => {
      event.preventDefault()
      await actions.initializeFirstTime({
        repoInput: form.repoInput,
        giteeBranch: form.repoBranch,
        token: form.token,
        masterPassword: form.masterPassword,
      })
    },
    onUnlockSubmit: async (event) => {
      event.preventDefault()
      await actions.unlockWithMasterPassword({
        masterPassword: form.masterPassword,
      })
    },
    onRefreshTokenSubmit: async (event) => {
      event.preventDefault()
      await actions.updateTokenCiphertext({
        token: form.refreshToken,
        masterPassword: form.refreshMasterPassword || undefined,
      })
    },
    onReadyUpdateSubmit: async (event) => {
      event.preventDefault()
      await actions.updateConnectionSettings({
        repoInput: form.readyRepoInput,
        giteeBranch: form.readyRepoBranch,
        token: form.readyToken || undefined,
        masterPassword: form.readyMasterPassword || undefined,
      })
    },
  }
}
