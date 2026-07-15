// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import Button from './Button'
import RemoveButton from './RemoveButton'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  reorder?: boolean   // drag-and-drop to move a line up/down
  format?: boolean    // Cmd/Ctrl+B / Cmd/Ctrl+I wrap the selection in **bold**/*italic*
  max?: number        // cap the list length: the + Add button hides once reached
}

export default function BulletListEditor({ value, onChange, placeholder = 'Add item…', reorder = false, format = false, max }: Props) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)  // insertion index 0..length

  function update(idx: number, text: string) {
    const next = [...value]
    next[idx] = text
    onChange(next)
  }
  function remove(idx: number) { onChange(value.filter((_, i) => i !== idx)) }
  function add() { onChange([...value, '']) }

  // `to` is an insertion index in the original array (0..length).
  function moveTo(from: number, to: number) {
    const insert = from < to ? to - 1 : to
    if (insert === from) return
    const next = [...value]
    const [item] = next.splice(from, 1)
    next.splice(insert, 0, item)
    onChange(next)
  }

  function dragOver(i: number, e: React.DragEvent) {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientY > r.top + r.height / 2 ? i + 1 : i)  // lower half → after
  }
  function drop() {
    if (dragIdx !== null && dropAt !== null) moveTo(dragIdx, dropAt)
    setDragIdx(null); setDropAt(null)
  }

  function wrap(idx: number, marker: string) {
    const el = inputs.current[idx]
    if (!el) return
    const s = el.selectionStart ?? 0
    const e = el.selectionEnd ?? 0
    const v = value[idx]
    update(idx, v.slice(0, s) + marker + v.slice(s, e) + marker + v.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + marker.length, e + marker.length) })
  }

  function onKeyDown(idx: number, e: React.KeyboardEvent) {
    if (!format || !(e.metaKey || e.ctrlKey)) return
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); wrap(idx, '**') }
    else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); wrap(idx, '*') }
  }

  const line = '2px solid var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.map((item, i) => (
        <div
          key={i}
          onDragOver={reorder ? (e => dragOver(i, e)) : undefined}
          onDrop={reorder ? drop : undefined}
          style={{
            display: 'flex', gap: 6, alignItems: 'center',
            borderTop: reorder && dragIdx !== null && dropAt === i ? line : '2px solid transparent',
            borderBottom: reorder && dragIdx !== null && dropAt === value.length && i === value.length - 1 ? line : '2px solid transparent',
            opacity: dragIdx === i ? 0.4 : 1,
          }}
        >
          {reorder && (
            <span
              draggable
              onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => { setDragIdx(null); setDropAt(null) }}
              title="Drag to reorder"
              aria-label="Drag to reorder"
              style={{ cursor: 'grab', color: 'var(--muted)', flexShrink: 0, padding: '0 2px', userSelect: 'none', display: 'inline-flex' }}
            ><GripVertical size={15} aria-hidden /></span>
          )}
          <input
            ref={el => { inputs.current[i] = el }}
            type="text"
            value={item}
            onChange={e => update(i, e.target.value)}
            onKeyDown={e => onKeyDown(i, e)}
            placeholder={placeholder}
          />
          <RemoveButton onClick={() => remove(i)} />
        </div>
      ))}
      {(max === undefined || value.length < max) && (
        <Button variant="secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>+ Add</Button>
      )}
    </div>
  )
}
