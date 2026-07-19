// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
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
export default function SaveButton({ onSave, dirty, idleLabel, savedLabel, className }: Props) {
  const { t } = useTranslation()
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
        // Vermilion only while this button IS the next action. A disabled
        // primary still reads as accent, and a settings page full of dormant
        // save buttons was spending the rationed colour on nothing.
        variant={dirty ? 'primary' : 'secondary'}
        busy={saving}
        disabled={!dirty}
        onClick={handle}
        className={(saved ? 'btn-saved' : '') + (className ? ' ' + className : '')}
      >
        {saved
          ? <><Check size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />{savedLabel ?? t('common.saved')}</>
          : saving ? t('common.saving') : idleLabel ?? t('common.save')}
      </Button>
    </span>
  )
}
