// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * The one collapsible-card pattern for the whole app (Profile sections, CV
 * slots, Settings advanced panel). The header is a real <button>, so it works
 * with keyboard and screen readers.
 *
 * `title` is the clickable header content; `extras` renders on the right side
 * of the header, outside the toggle button (for remove/save controls).
 */
export default function Collapsible({
  title, extras, children, defaultOpen = false, open: controlledOpen, onToggle, flat = false,
  headingLevel, id,
}: {
  title: ReactNode
  /** Anchor for deep links (`/profile#languages`). `.collapsible` already
   * carries scroll-margin-top so the sticky save band can't cover it. */
  id?: string
  extras?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** Controlled mode: pass `open` + `onToggle`. */
  open?: boolean
  onToggle?: (open: boolean) => void
  /** Flat: no card chrome of its own (parent provides it). */
  flat?: boolean
  /** Wrap the toggle in a heading so the page has a navigable outline. A heading
   * can't go *inside* the button (invalid HTML), so it wraps it instead — the
   * pattern screen readers expect for a disclosure that titles a region. */
  headingLevel?: 2 | 3
}) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const open = controlledOpen ?? innerOpen
  const toggle = () => {
    onToggle?.(!open)
    if (controlledOpen === undefined) setInnerOpen(o => !o)
  }

  const toggleBtn = (
    <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={toggle}>
      <ChevronRight size={16} className={`collapsible-chevron${open ? ' open' : ''}`} aria-hidden />
      {title}
    </button>
  )
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <div id={id} className={flat ? 'collapsible' : 'collapsible card'}>
      <div className="collapsible-header">
        {headingLevel
          ? <Heading className="collapsible-heading">{toggleBtn}</Heading>
          : toggleBtn}
        {extras && <div className="collapsible-extras">{extras}</div>}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}
