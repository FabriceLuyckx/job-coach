// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, REMOTE_PROVIDERS } from '../api'
import type { ProviderSettings, RemoteProvider } from '../api'
import SaveButton from './SaveButton'

/**
 * The API-key engine's settings: which provider, its key, its model (and, for a
 * custom server, its address). One component for both Settings → AI Engine and
 * the onboarding wizard, so the two can't drift into offering different fields.
 *
 * Keys and models are stored per provider server-side, so switching provider
 * shows that provider's own saved values and never overwrites the previous one's.
 */
export default function ProviderFields({ provider, providers, customBaseUrl, onProviderChange, onSaved }: {
  provider: RemoteProvider
  providers: Record<RemoteProvider, ProviderSettings>
  customBaseUrl: string
  /** Persisting the choice is the parent's call — it also drives readiness. */
  onProviderChange: (p: RemoteProvider) => void
  /** Reload settings + engine status after a successful save. */
  onSaved: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const providerId = useId()
  const keyId = useId()
  const modelId = useId()
  const listId = useId()
  const urlId = useId()

  const current = providers[provider]
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(current.model)
  const [baseUrl, setBaseUrl] = useState(customBaseUrl)
  // Suggestions come from the provider itself, so there is no catalog here to go
  // stale. Empty is a normal state (no key yet, or a server without /models) —
  // the field is plain free text then, exactly as before.
  const [known, setKnown] = useState<string[]>([])
  const [unknownModel, setUnknownModel] = useState(false)

  // Re-seed on a provider switch (and after a save): the fields describe one
  // provider, so leaving the previous one's model in the box would offer to save
  // an OpenAI model name against an Anthropic key.
  useEffect(() => { setApiKey(''); setModel(providers[provider].model) }, [provider, providers])
  useEffect(() => { setBaseUrl(customBaseUrl) }, [customBaseUrl])

  // What the app will actually send: the typed name, or the preset default that
  // a blank field resolves to server-side. Both can be wrong — a stored model
  // can outlive the provider's catalog, and so can a default we ship.
  const effectiveModel = model.trim() || current.default_model
  const checkModel = (list: string[], value: string) =>
    setUnknownModel(!!value && list.length > 0 && !list.includes(value))

  // Re-fetch when the key lands too: most providers only list models to an
  // authenticated caller, so the first useful list arrives right after a save.
  useEffect(() => {
    let active = true
    setKnown([]); setUnknownModel(false)
    api.getRemoteModels(provider)
      .then(r => {
        if (!active) return
        setKnown(r.models)
        // Check on arrival, not only when the field is edited. The value most
        // likely to be dead is the one already sitting there — a model stored
        // before the provider retired it, which nobody would think to re-type.
        checkModel(r.models, model.trim() || providers[provider].default_model)
      })
      .catch(() => { /* suggestions are a nicety, never a blocker */ })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, current.key_set, customBaseUrl])

  const dirty = !!apiKey.trim()
    || model.trim() !== current.model
    || (provider === 'custom' && baseUrl.trim() !== customBaseUrl)

  async function save() {
    const data: Parameters<typeof api.putSettings>[0] = { llm_provider: provider }
    if (apiKey.trim()) data[`${provider}_api_key`] = apiKey.trim()
    data[`${provider}_model`] = model.trim()
    if (provider === 'custom') data.custom_base_url = baseUrl.trim()
    await api.putSettings(data)
    setApiKey('')
    await onSaved()
  }

  return (
    <div className="field" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
      <div className="field">
        <label htmlFor={providerId}>{t('settings.provider.label')}</label>
        <select
          id={providerId}
          value={provider}
          onChange={e => onProviderChange(e.target.value as RemoteProvider)}
        >
          {REMOTE_PROVIDERS.map(p => (
            <option key={p} value={p}>{t(`settings.provider.names.${p}`)}</option>
          ))}
        </select>
        <p className="field-hint">{t('settings.provider.help')}</p>
      </div>

      {provider === 'custom' && (
        <div className="field">
          <label htmlFor={urlId}>{t('settings.provider.baseUrl')}</label>
          <input
            id={urlId}
            type="url"
            spellCheck={false}
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder={t('settings.provider.baseUrlPlaceholder')}
          />
          <p className="field-hint">{t('settings.provider.baseUrlHelp')}</p>
        </div>
      )}

      <div className="field">
        <label htmlFor={keyId}>{t('settings.provider.apiKey')}</label>
        {current.key_set && (
          <p className="muted-sm" style={{ marginBottom: 6 }}>
            {t('settings.provider.currentlySet', { preview: current.key_preview })}
          </p>
        )}
        <input
          id={keyId}
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={current.key_set
            ? t('settings.provider.newKeyPlaceholder')
            : t('settings.provider.keyPlaceholder')}
        />
        {/* The provider's own pages, together: where to get a key, and where to
            see what you've spent. Only OpenRouter will tell us a balance through
            the key we hold (the others need a separate admin credential), so for
            every provider the dashboard link is the one honest cost signal. */}
        <p className="field-hint">
          {current.key_url
            ? <a href={current.key_url} target="_blank" rel="noreferrer">{t('settings.provider.getKey')}</a>
            : t('settings.provider.keyOptional')}
          {current.billing_url && (
            <>
              {current.key_url && ' · '}
              <a href={current.billing_url} target="_blank" rel="noreferrer">{t('settings.provider.billing')}</a>
            </>
          )}
        </p>
      </div>

      <div className="field">
        <label htmlFor={modelId}>{t('settings.provider.model')}</label>
        {/* A datalist, not a select: the list is a shortcut, not the whole truth.
            A model released today (or one a self-hosted server doesn't advertise)
            must still be typeable, and 300+ options don't belong in a dropdown. */}
        <input
          id={modelId}
          type="text"
          spellCheck={false}
          list={known.length ? listId : undefined}
          value={model}
          onChange={e => { setModel(e.target.value); setUnknownModel(false) }}
          // Checked on blur, not per keystroke: half-typed names are not mistakes.
          onBlur={() => checkModel(known, effectiveModel)}
          placeholder={current.default_model || t('settings.provider.modelPlaceholder')}
        />
        {known.length > 0 && (
          <datalist id={listId}>
            {known.map(m => <option key={m} value={m} />)}
          </datalist>
        )}
        {unknownModel
          // Mustard, the app's nudge colour — a hint-grey warning reads as the
          // hint it replaced and gets skipped. Still a warning, never a block:
          // not every server lists every model it will actually serve.
          ? <p className="field-hint" role="status"
               style={{ color: 'var(--highlight)', fontWeight: 500 }}>
              {/* Name the model when the field is empty: the value at fault is
                  then our default, which the user never typed and can't see. */}
              {model.trim()
                ? t('settings.provider.modelUnknown')
                : t('settings.provider.modelDefaultGone', { model: current.default_model })}
            </p>
          : current.default_model && (
            <p className="field-hint">{t('settings.provider.modelHint', { model: current.default_model })}</p>
          )}
      </div>

      <SaveButton dirty={dirty} onSave={save} idleLabel={t('settings.provider.save')} />
    </div>
  )
}
