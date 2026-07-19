// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/**
 * Roving-tabindex wiring for a single-choice group of buttons.
 *
 * `aria-pressed` toggles say "pressed / not pressed" one option at a time; a
 * radiogroup says "2 of 5" and moves with the arrow keys, which is what a
 * mutually-exclusive choice (engine, template, palette) actually is. Same
 * pattern as Preferences' Segmented, minus its fixed `.seg` markup — these
 * groups render thumbnails and swatches, not text pills.
 *
 * Spread `group` on the container and `item(i)` on each option button.
 */
export function radioGroup<T>(values: T[], value: T, onChange: (v: T) => void) {
  const sel = values.indexOf(value)
  // Nothing selected (e.g. a hand-edited custom palette) must still leave the
  // group reachable by Tab — focus the first option, but check none.
  const focusIdx = sel === -1 ? 0 : sel

  function move(el: HTMLElement, next: number) {
    onChange(values[next])
    // Query the options rather than indexing into `children`: a wrapper element
    // around any option would silently shift every index otherwise.
    const opts = el.querySelectorAll<HTMLElement>('[role="radio"]')
    opts[next]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (values.length === 0) return
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0

    if (step) {
      e.preventDefault()
      // From the unselected state, arrowing must land on the first option going
      // forward and the last going back — so start just outside the range on
      // the side the user is moving away from, not at index 0 for both.
      const base = sel === -1 ? (step > 0 ? -1 : values.length) : sel
      move(e.currentTarget, (base + step + values.length) % values.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(e.currentTarget, 0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(e.currentTarget, values.length - 1)
    }
  }

  return {
    group: { role: 'radiogroup' as const, onKeyDown },
    item: (i: number) => ({
      role: 'radio' as const,
      'aria-checked': i === sel,
      tabIndex: i === focusIdx ? 0 : -1,
    }),
  }
}
