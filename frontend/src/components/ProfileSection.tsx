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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}
