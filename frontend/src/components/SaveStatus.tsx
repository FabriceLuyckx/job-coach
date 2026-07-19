// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useTranslation } from 'react-i18next'
import { Check, CloudUpload } from 'lucide-react'
import Button from './Button'
import type { SaveState } from '../lib/useProfileAutosave'

/** Autosave status for the sticky page head. Shared by Profile and Preferences,
 * which drive the same hook — this was copy-pasted between them.
 *
 * Deliberately NOT a live region for the transient states: `pending` → `saving`
 * → `saved` cycles on every burst of typing, so announcing them turns writing a
 * sentence into a stream of "Saving… / All changes saved". A plain span with no
 * `aria-live` is silent while typing yet still readable on demand — which is
 * the whole goal. It must NOT be `aria-hidden`: that removes it from the
 * accessibility tree entirely, and on a page with no Save button this indicator
 * is the only evidence the answers ever left the browser.
 *
 * Only the failure is announced, and the retry button sits outside the
 * announced text so a screen reader doesn't read a control as part of it.
 */
export default function SaveStatus({ state, error, onRetry }: {
  state: SaveState
  error: string
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <span className="muted-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {(state === 'pending' || state === 'saving') && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {/* Decorative: the state is carried by the text beside it, which is
              what keeps this readable when reduced-motion stops the spin. */}
          <span className="spinner" style={{ width: 13, height: 13 }} aria-hidden />
          {t('profile.saving')}
        </span>
      )}
      {state === 'saved' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Check size={14} color="var(--success)" aria-hidden />{t('profile.allSaved')}
        </span>
      )}
      {state === 'error' && (
        <>
          <span role="alert" style={{ color: 'var(--danger)' }}>{t('profile.cantSave', { error })}</span>
          <Button variant="secondary" onClick={onRetry} style={{ padding: '3px 10px', fontSize: 'var(--fs-sm)' }}>
            <CloudUpload size={13} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden />{t('common.retry')}
          </Button>
        </>
      )}
    </span>
  )
}
