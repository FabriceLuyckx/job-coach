import { useState } from 'react'
import type { ReactNode } from 'react'
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
    <>
      {items.map((item, i) => {
        const handle = (
          <span
            draggable
            onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => { setDragIdx(null); setDropAt(null) }}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            style={{ cursor: 'grab', color: 'var(--muted)', flexShrink: 0, display: 'inline-flex', userSelect: 'none' }}
          ><GripVertical size={15} aria-hidden /></span>
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
    </>
  )
}
