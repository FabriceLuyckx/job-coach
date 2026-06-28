import { useEffect, useRef, useState } from 'react'
import Button from './Button'

type State = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  onSave: () => Promise<void>
  /** Enabled only when there are real unsaved changes, so "Saved" only ever
      shows after a genuine save. */
  dirty: boolean
  idleLabel?: string
  savedLabel?: string
  className?: string
}

/** Shared save control: idle → saving (spinner) → ✓ Saved → idle, with inline
    error. Disabled unless `dirty`. */
export default function SaveButton({ onSave, dirty, idleLabel = 'Save', savedLabel = 'Saved', className }: Props) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // New edits during the "Saved" window → return to active immediately.
  useEffect(() => { if (dirty && state === 'saved') setState('idle') }, [dirty, state])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function handle() {
    setState('saving'); setError('')
    try {
      await onSave()
      setState('saved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2200)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('error')
    }
  }

  const saving = state === 'saving'
  const saved = state === 'saved'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {state === 'error' && <span className="error-msg" style={{ marginTop: 0 }}>{error}</span>}
      <Button
        variant="primary"
        busy={saving}
        disabled={!dirty}
        onClick={handle}
        className={(saved ? 'btn-saved' : '') + (className ? ' ' + className : '')}
      >
        {saved ? `✓ ${savedLabel}` : saving ? 'Saving…' : idleLabel}
      </Button>
    </span>
  )
}
