// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Button from './Button'

/**
 * Confirmation dialog — the app's replacement for window.confirm(), which is
 * unstyled, untranslatable in tone, and blocks the whole browser tab.
 */
export default function ConfirmModal({ title, body, confirmLabel, danger = false, onConfirm, onCancel }: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="help-text">{body}</p>
      {/* Cancel is FIRST in the DOM so Modal's focus-the-first-focusable lands
          on the safe choice — otherwise Enter-on-open confirms a destructive
          action. row-reverse restores the visual order (confirm on the left,
          matching every other button row in the app). */}
      <div style={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
