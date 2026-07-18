// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * App-wide toast system — the single feedback channel for async outcomes.
 * Successes auto-dismiss; errors stay until dismissed; any toast can carry an
 * action button (used for Undo on destructive operations).
 */

export interface ToastOptions {
  /** Auto-dismiss after ms; defaults per kind (errors never auto-dismiss). */
  duration?: number
  action?: { label: string; onClick: () => void }
}

interface ToastItem extends ToastOptions {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void
  error: (message: string, opts?: ToastOptions) => void
  info: (message: string, opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback((kind: ToastItem['kind'], message: string, opts?: ToastOptions) => {
    const id = nextId++
    setToasts(t => [...t.slice(-3), { id, kind, message, ...opts }])
    const duration = opts?.duration ?? (kind === 'error' ? 0 : kind === 'info' ? 6000 : 3500)
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration))
    }
  }, [dismiss])

  // Clear all pending timers on unmount.
  useEffect(() => {
    const map = timers.current
    return () => map.forEach(clearTimeout)
  }, [])

  const apiRef = useRef<ToastApi>({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  })

  return (
    <ToastContext.Provider value={apiRef.current}>
      {children}
      {/* The live region is this persistent wrapper, not the individual toasts:
          a live region that is inserted *along with* its content is announced
          unreliably, while one that already exists and then changes is not. One
          region for all kinds, so an error isn't announced twice by a nested
          role="alert" inside a live parent. */}
      <div className="toast-stack" role="region" aria-label="Notifications"
        aria-live="polite" aria-relevant="additions text">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
