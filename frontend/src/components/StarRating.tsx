// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  value: number
  onChange: (n: number) => void
  max?: number
  /** Accessible name for the group (e.g. "Proficiency in Dutch"). */
  groupLabel?: string
  /** What level N means, for the accessible name — "B2/C1 Advanced" tells a
   * screen-reader user far more than "4 of 5". */
  labelFor?: (n: number) => string
}

// Clickable 0–max star rating. Clicking the Nth star fills 1..N; clicking the
// star that is already the highest filled one clears the rating back to 0.
//
// Implemented as a real radiogroup: one tab stop (roving tabindex) rather than
// `max` of them, and arrow keys move between levels — otherwise a keyboard user
// tabs through five buttons per language row and a screen reader announces each
// as a bare number with no unit.
export default function StarRating({ value, onChange, max = 5, groupLabel, labelFor }: Props) {
  const { t } = useTranslation()
  const [hover, setHover] = useState(0)
  const stars = useRef<(HTMLButtonElement | null)[]>([])
  const shown = hover || value
  const nameFor = (n: number) => labelFor?.(n) ?? t('common.nOfM', { n, max })

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    // Floor at 0, not 1, so the keyboard can clear a rating the same way
    // clicking the selected star does — otherwise mouse and keyboard have
    // different capability.
    const next = Math.min(max, Math.max(0, (value || 0) + delta))
    onChange(next)
    // Roving tabindex only decides who is *reachable*; focus has to actually
    // move, or the ring stays on a star that is now tabIndex={-1} and the
    // screen reader announces nothing for every press after the first.
    requestAnimationFrame(() => stars.current[Math.max(1, next) - 1]?.focus())
  }

  // The focusable star is the selected one (or the first, when unset), so the
  // group is a single tab stop.
  const focusIdx = value > 0 ? value : 1

  return (
    <div className="star-rating" onMouseLeave={() => setHover(0)}
      role="radiogroup" aria-label={groupLabel ?? t('common.proficiency')}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1
        const filled = n <= shown
        return (
          <button
            key={n}
            ref={el => { stars.current[n - 1] = el }}
            type="button"
            className={`star${filled ? ' on' : ''}`}
            role="radio"
            aria-checked={n === value}
            aria-label={nameFor(n)}
            title={nameFor(n)}
            tabIndex={n === focusIdx ? 0 : -1}
            onKeyDown={onKeyDown}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === value ? 0 : n)}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}
