// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState } from 'react'

interface Props {
  value: number
  onChange: (n: number) => void
  max?: number
}

// Clickable 0–max star rating. Clicking the Nth star fills 1..N; clicking the
// star that is already the highest filled one clears the rating back to 0.
export default function StarRating({ value, onChange, max = 5 }: Props) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  return (
    <div className="star-rating" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Proficiency">
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1
        const filled = n <= shown
        return (
          <button
            key={n}
            type="button"
            className={`star${filled ? ' on' : ''}`}
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} of ${max}`}
            title={`${n} of ${max}`}
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
