import AuthPanel from './auth-panel'
import type { UseAuthResult } from '../../hooks/use-auth'

interface AuthModalProps {
  auth: UseAuthResult
  open: boolean
  canClose: boolean
  onClose: () => void
}

export default function AuthModal({ auth, open, canClose, onClose }: AuthModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm td-fade-in">
      <AuthPanel auth={auth} variant="modal" canClose={canClose} onClose={onClose} />
    </div>
  )
}
