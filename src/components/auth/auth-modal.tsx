import AuthPanel from './auth-panel'
import type { UseAuthResult } from '../../hooks/use-auth'

interface AuthModalProps {
  auth: UseAuthResult
  open: boolean
  canClose: boolean
  onClose: () => void
  onEnterGuestMode?: () => void
}

export default function AuthModal({ auth, open, canClose, onClose, onEnterGuestMode }: AuthModalProps) {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#151311]/55 px-4 py-6 backdrop-blur-[2px] td-fade-in"
      data-testid="auth-modal-overlay"
    >
      <AuthPanel
        auth={auth}
        variant="modal"
        canClose={canClose}
        onClose={onClose}
        onEnterGuestMode={onEnterGuestMode}
      />
    </div>
  )
}
