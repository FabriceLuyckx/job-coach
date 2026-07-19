// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'

/**
 * Generic drag-to-reorder list for entry cards (Experience, Education, …).
 * The caller renders each item; we provide a drag handle and the drop mechanics.
 * Mirrors the reorder behaviour already used in BulletListEditor.
 */
export default function ReorderableList<T>({
  items, onReorder, keyOf, renderItem,
}: {
  items: T[]
  onReorder: (next: T[]) => void
  keyOf: (item: T, index: number) => string | number
  /** Render the item; place `handle` wherever the drag grip should appear. */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode
}) {
  const { t } = useTranslation()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null) // insertion index 0..length

  function moveTo(from: number, to: number) {
    const insert = from < to ? to - 1 : to
    if (insert === from) return
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(insert, 0, it)
    onReorder(next)
  }
  function dragOver(i: number, e: React.DragEvent) {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientY > r.top + r.height / 2 ? i + 1 : i)
  }
  function drop() {
    if (dragIdx !== null && dropAt !== null) moveTo(dragIdx, dropAt)
    setDragIdx(null); setDropAt(null)
  }

  const line = '2px solid var(--accent)'

  return (
    <div data-reorder-root>
      {items.map((item, i) => {
        // A real <button>, not a draggable <span>: dragging is mouse-only, and
        // this list orders CV content (roles, bullets, education), so a keyboard
        // user could otherwise never change it. Arrow keys move the item and
        // focus follows it.
        const handle = (
          <button
            type="button"
            draggable
            onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => { setDragIdx(null); setDropAt(null) }}
            onKeyDown={e => {
              const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
              if (!dir) return
              e.preventDefault()
              const to = i + dir
              if (to < 0 || to >= items.length) return
              moveTo(i, dir < 0 ? to : to + 1)
              // Keep focus on the handle of the item we just moved.
              const el = e.currentTarget
              requestAnimationFrame(() => {
                // `:scope >` — a plain descendant query would also match the
                // handles of any nested list (a BulletListEditor inside an
                // ExperienceCard inside this list) and focus the wrong item.
                const all = el.closest('[data-reorder-root]')?.querySelectorAll<HTMLButtonElement>(':scope > div [data-reorder-handle]')
                all?.[to]?.focus()
              })
            }}
            data-reorder-handle
            title={t('common.reorderHint')}
            aria-label={t('common.reorderItem', { n: i + 1, total: items.length })}
            style={{ cursor: 'grab', color: 'var(--muted)', flexShrink: 0, display: 'inline-flex',
              userSelect: 'none', background: 'none', border: 'none', padding: 2 }}
          ><GripVertical size={15} aria-hidden /></button>
        )
        return (
          <div
            key={keyOf(item, i)}
            onDragOver={e => dragOver(i, e)}
            onDrop={drop}
            style={{
              borderTop: dragIdx !== null && dropAt === i ? line : '2px solid transparent',
              borderBottom: dragIdx !== null && dropAt === items.length && i === items.length - 1 ? line : '2px solid transparent',
              opacity: dragIdx === i ? 0.4 : 1,
            }}
          >
            {renderItem(item, i, handle)}
          </div>
        )
      })}
    </div>
  )
}
