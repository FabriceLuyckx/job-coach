// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { cloneElement, isValidElement, useId, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOff } from 'lucide-react'
import Badge from './Badge'
import Collapsible from './Collapsible'
import { BADGE_LABELS, type SectionBadge } from '../lib/profileSections'

/** A titled, collapsible block used by the Profile and Preferences pages, with an
 * optional CV/AI/jobs badge and an optional "hide this section" affordance. */
export function Section({ title, badge, help, count, onHide, children, defaultOpen = false }: {
  title: string
  badge?: SectionBadge
  help?: string
  count?: number
  onHide?: () => void
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      headingLevel={2}
      extras={onHide && (
        <button type="button" className="btn-ghost section-hide" onClick={onHide} title={t('profile.hideSection')}>
          <EyeOff size={14} aria-hidden /> {t('profile.hide')}
        </button>
      )}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="collapsible-title">{title}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}</span>
          {badge && <Badge variant={badge}>{t(BADGE_LABELS[badge])}</Badge>}
        </span>
      }
    >
      {help && <p className="section-help">{help}</p>}
      {children}
    </Collapsible>
  )
}

/** A labelled form field.
 *
 * The label is wired to the control, not just placed above it: with a bare
 * `<label>` sibling, a screen reader reaches ~60 inputs on the Profile page with
 * no idea what any of them is. A native control (input/textarea/select) gets an
 * id and `htmlFor`; a composite child (TagInput, BulletListEditor, …) renders
 * many controls, so the wrapper becomes a labelled group instead. */
export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  const uid = useId()
  const controlId = `${uid}-control`
  const labelId = `${uid}-label`
  const helpId = help ? `${uid}-help` : undefined

  // `typeof type === 'string'` = an intrinsic DOM element, so it accepts id/aria-*.
  const native = isValidElement(children) && typeof children.type === 'string'
  // Point htmlFor at whatever id the control actually ends up with. Preserving
  // a caller's id while always labelling `controlId` would leave the label
  // pointing at nothing — a false association is worse than none.
  const ownId = native ? (children.props as { id?: string }).id : undefined
  const forId = ownId ?? controlId
  const child = native
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: forId,
        'aria-describedby': helpId,
      })
    : children

  return (
    <div className="field" {...(native ? {} : { role: 'group', 'aria-labelledby': labelId })}>
      <label {...(native ? { htmlFor: forId } : { id: labelId })}>{label}</label>
      {help && <p id={helpId} className="section-help" style={{ margin: '0 0 var(--space-2)' }}>{help}</p>}
      {child}
    </div>
  )
}
