import { useTranslation } from 'react-i18next'
import { Check, CloudUpload } from 'lucide-react'
import Button from '../components/Button'
import TagInput from '../components/TagInput'
import { Section, Field } from '../components/ProfileSection'
import { useProfileAutosave } from '../lib/useProfileAutosave'

// ── Main page ────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { t } = useTranslation()
  const { profile, error, saveState, saveError, runSave, set } = useProfileAutosave()

  if (!profile) return <div style={{ padding: 32, color: 'var(--muted)' }}>{error || t('profile.loading')}</div>

  const pf = profile

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t('preferences.title')}</h1>
        <span className="muted-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} role="status">
          {(saveState === 'pending' || saveState === 'saving') && <><span className="spinner" style={{ width: 13, height: 13 }} />{t('profile.saving')}</>}
          {saveState === 'saved' && <><Check size={14} color="var(--success)" aria-hidden />{t('profile.allSaved')}</>}
          {saveState === 'error' && (
            <>
              <span style={{ color: 'var(--danger)' }}>{t('profile.cantSave', { error: saveError })}</span>
              <Button variant="secondary" onClick={runSave} style={{ padding: '3px 10px', fontSize: 'var(--fs-sm)' }}>
                <CloudUpload size={13} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden />{t('common.retry')}
              </Button>
            </>
          )}
        </span>
      </div>
      <p className="help-text" style={{ marginTop: 'calc(-1 * var(--space-4))' }}>
        {t('preferences.help')}
      </p>

      <Section title={t('preferences.lookingFor.title')} help={t('preferences.lookingFor.help')} defaultOpen>
        <Field label={t('preferences.fields.lookingFor')}>
          <textarea value={pf.preferences.looking_for} placeholder={t('preferences.fields.lookingForPlaceholder')}
            onChange={e => set('preferences.looking_for', e.target.value)} style={{ minHeight: 100 }} />
        </Field>
        <Field label={t('preferences.fields.avoid')}>
          <textarea value={pf.preferences.avoid} placeholder={t('preferences.fields.avoidPlaceholder')}
            onChange={e => set('preferences.avoid', e.target.value)} />
        </Field>
      </Section>

      <Section title={t('preferences.practical.title')} help={t('preferences.practical.help')} defaultOpen>
        <Field label={t('preferences.fields.locations')}><TagInput value={pf.preferences.locations} onChange={v => set('preferences.locations', v)} /></Field>
        <div className="row">
          <Field label={t('profile.work.remoteHybrid')}>
            <select value={pf.preferences.remote} onChange={e => set('preferences.remote', e.target.value)}>
              <option value="Remote">{t('profile.work.remote')}</option><option value="Hybrid">{t('profile.work.hybrid')}</option><option value="On-site">{t('profile.work.onSite')}</option><option value="No preference">{t('profile.work.noPreference')}</option>
            </select>
          </Field>
          <Field label={t('preferences.fields.languages')}><TagInput value={pf.preferences.languages} onChange={v => set('preferences.languages', v)} /></Field>
        </div>
        <Field label={t('preferences.fields.notes')}>
          <textarea value={pf.preferences.notes} placeholder={t('preferences.fields.notesPlaceholder')}
            onChange={e => set('preferences.notes', e.target.value)} style={{ minHeight: 100 }} />
        </Field>
      </Section>

      {error && <p className="error-msg" style={{ marginBottom: 'var(--space-2)' }}>{error}</p>}
    </div>
  )
}
