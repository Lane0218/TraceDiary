import type { FormEvent } from 'react'
import type { UseAuthResult } from '../../hooks/use-auth'

export interface AuthFormState {
  repoInput: string
  repoBranch: string
  token: string
  masterPassword: string
  refreshToken: string
  refreshMasterPassword: string
}

export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  repoInput: '',
  repoBranch: 'master',
  token: '',
  masterPassword: '',
  refreshToken: '',
  refreshMasterPassword: '',
}

interface AuthSubmitActions {
  initializeFirstTime: UseAuthResult['initializeFirstTime']
  unlockWithMasterPassword: UseAuthResult['unlockWithMasterPassword']
  updateTokenCiphertext: UseAuthResult['updateTokenCiphertext']
}

export interface AuthSubmitModel {
  onSetupSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUnlockSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onRefreshTokenSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
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
  }
}
