import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { Save, AlertCircle } from 'lucide-react'
import type { FailedRow } from '../../types'

interface ManualEditModalProps {
  isOpen: boolean
  onClose: () => void
  row: FailedRow | null
  onSave: (rowId: string, updatedData: Record<string, unknown>) => void
}

export default function ManualEditModal({
  isOpen,
  onClose,
  row,
  onSave,
}: ManualEditModalProps) {
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Sync jsonText when row changes
  if (row && !jsonText && isOpen) {
    setJsonText(JSON.stringify(row.originalData, null, 2))
  }

  function handleClose() {
    setJsonText('')
    setError(null)
    setSaved(false)
    onClose()
  }

  function handleSave() {
    if (!row) return
    setError(null)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>
    } catch {
      setError('Invalid JSON — please fix the syntax before saving.')
      return
    }

    onSave(row.id, parsed)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      handleClose()
    }, 800)
  }

  if (!row) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit Row #${row.rowIndex}`}
      subtitle="Fix the JSON data manually, then save to re-submit."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Error message context */}
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
              {row.errorMessage}
            </p>
          </div>
        </div>

        {/* JSON textarea */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-slate-400 mb-2">
            Row Data (JSON)
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setError(null)
            }}
            rows={12}
            spellCheck={false}
            className="themed-input w-full rounded-xl px-4 py-3 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 resize-none leading-relaxed"
          />
          {error && (
            <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSave}
            loading={saved}
          >
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
