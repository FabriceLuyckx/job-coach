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
}: {
  title: ReactNode
  extras?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** Controlled mode: pass `open` + `onToggle`. */
  open?: boolean
  onToggle?: (open: boolean) => void
  /** Flat: no card chrome of its own (parent provides it). */
  flat?: boolean
}) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  const open = controlledOpen ?? innerOpen
  const toggle = () => {
    onToggle?.(!open)
    if (controlledOpen === undefined) setInnerOpen(o => !o)
  }

  return (
    <div className={flat ? 'collapsible' : 'collapsible card'}>
      <div className="collapsible-header">
        <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={toggle}>
          <ChevronRight size={16} className={`collapsible-chevron${open ? ' open' : ''}`} aria-hidden />
          {title}
        </button>
        {extras && <div className="collapsible-extras">{extras}</div>}
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}
