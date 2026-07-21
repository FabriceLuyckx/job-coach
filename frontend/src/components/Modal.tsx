// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Accessible modal dialog: backdrop click + Escape close it, focus moves into
 * the dialog on open, Tab is trapped inside, and focus returns to the opener
 * on close.
 *
 * `dismissable={false}` keeps the trap/focus/role wiring but suppresses Escape
 * and backdrop close and the visible title (the caller owns its heading and
 * labels the dialog via `labelledBy`) — for a dialog the user must complete,
 * like first-run onboarding.
 */
export default function Modal({ title, labelledBy, onClose, dismissable = true, children }: {
  title?: string
  /** id of the caller's own heading — used as aria-labelledby instead of the
   *  built-in visible title, for dialogs that render their own heading. */
  labelledBy?: string
  onClose: () => void
  dismissable?: boolean
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = boxRef.current
    const focusables = () =>
      Array.from(box?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter(el => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!dismissable) return
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab') {
        const els = focusables()
        if (els.length === 0) return
        const first = els[0], last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [onClose, dismissable])

  return (
    <div className="modal-overlay" onClick={dismissable ? onClose : undefined}>
      <div
        ref={boxRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        aria-labelledby={labelledBy}
        onClick={e => e.stopPropagation()}
      >
        {title && !labelledBy && <div className="modal-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
