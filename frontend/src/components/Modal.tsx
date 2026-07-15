// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Accessible modal dialog: backdrop click + Escape close it, focus moves into
 * the dialog on open, Tab is trapped inside, and focus returns to the opener
 * on close.
 */
export default function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
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
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={boxRef}
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
