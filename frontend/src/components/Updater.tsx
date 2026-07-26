// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ArrowUpCircle, X } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { api, type UpdateCheck, type UpdateStatus } from '../api'
import { errMsg } from '../lib/errors'

const RELEASES_URL = 'https://github.com/FabriceLuyckx/job-coach/releases/latest'

// Dismissal is session-scoped (module memory, like the Jobs page's scan id):
// route changes keep it hidden, a reload brings it back.
let dismissedForSession = false

/** Shell banner announcing an available update. Checks on mount only when the
 *  automatic check is enabled; "Update now" opens the shared dialog. */
export function UpdateBanner({ enabled, onUpdate }: { enabled: boolean; onUpdate: () => void }) {
  const { t } = useTranslation()
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [dismissed, setDismissed] = useState(dismissedForSession)

  useEffect(() => {
    if (!enabled || dismissedForSession) return
    // A failed automatic check stays silent — the manual path reports errors.
    api.checkUpdate().then(c => { if (c.available) setCheck(c) }).catch(() => {})
  }, [enabled])

  if (!check || dismissed) return null
  return (
    <div role="status" className="setup-banner setup-banner-info">
      <ArrowUpCircle size={15} aria-hidden />
      <span style={{ flex: 1 }}>
        {t('updates.banner.available', { version: check.latest })}{' '}
        {check.notes_url && (
          <a href={check.notes_url} target="_blank" rel="noreferrer">{t('updates.banner.notes')}</a>
        )}
      </span>
      <Button variant="secondary" onClick={onUpdate}>{t('updates.banner.updateNow')}</Button>
      <Button
        variant="ghost" icon
        aria-label={t('updates.banner.dismiss')}
        onClick={() => { dismissedForSession = true; setDismissed(true) }}
      >
        <X size={15} aria-hidden />
      </Button>
    </div>
  )
}

const mb = (n: number) => Math.max(1, Math.round(n / 1048576))

/** The update dialog: checks on open, then walks checking → up-to-date /
 *  available → downloading (progress + Cancel) → restarting, with refusals and
 *  errors always offering the release page as the manual fallback. */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [checkErr, setCheckErr] = useState('')
  const [refusal, setRefusal] = useState('')
  const [st, setSt] = useState<UpdateStatus | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    api.checkUpdate()
      .then(c => { if (alive.current) setCheck(c) })
      .catch(e => { if (alive.current) setCheckErr(errMsg(e)) })
    return () => { alive.current = false }
  }, [])

  async function poll() {
    while (alive.current) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const s = await api.getUpdateStatus()
        if (!alive.current) return
        setSt(s)
        if (s.state === 'error' || s.state === 'cancelled' || s.state === 'idle') return
      } catch {
        // The server dies mid-restart — keep the last (restarting) state on screen.
        return
      }
    }
  }

  async function install() {
    setRefusal('')
    try {
      await api.startUpdate()
      setSt({ state: 'downloading', bytes_done: 0, bytes_total: 0, error: null })
      void poll()
    } catch (e) {
      setRefusal(errMsg(e))
    }
  }

  const releaseLink = (
    <p className="help-text" style={{ marginBottom: 0 }}>
      <Trans
        i18nKey="updates.dialog.manualFallback"
        components={{ a: <a href={check?.notes_url || RELEASES_URL} target="_blank" rel="noreferrer" /> }}
      />
    </p>
  )

  let body: React.ReactNode
  if (st && st.state !== 'cancelled' && st.state !== 'idle') {
    if (st.state === 'downloading') {
      body = (
        <>
          <p className="help-text">
            {t('updates.dialog.downloading', { done: mb(st.bytes_done), total: st.bytes_total ? mb(st.bytes_total) : '?' })}
          </p>
          <progress value={st.bytes_done} max={st.bytes_total || undefined} style={{ width: '100%' }} />
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => { void api.cancelUpdate().catch(() => {}) }}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )
    } else if (st.state === 'staging') {
      body = <p className="help-text">{t('updates.dialog.staging')}</p>
    } else if (st.state === 'restarting') {
      body = <p className="help-text">{t('updates.dialog.restarting')}</p>
    } else {
      body = (
        <>
          <p className="error-msg">{t('updates.dialog.error', { error: st.error ?? '' })}</p>
          {releaseLink}
        </>
      )
    }
  } else if (refusal) {
    body = (
      <>
        <p className="error-msg">{t('updates.dialog.refused', { reason: refusal })}</p>
        {releaseLink}
      </>
    )
  } else if (checkErr) {
    body = <p className="error-msg">{t('updates.dialog.checkFailed', { reason: checkErr })}</p>
  } else if (!check) {
    body = <p className="help-text">{t('updates.dialog.checking')}</p>
  } else if (!check.available) {
    body = check.reason
      ? <p className="error-msg">{t('updates.dialog.checkFailed', { reason: check.reason })}</p>
      : <p className="help-text">{t('updates.dialog.upToDate', { version: check.current })}</p>
  } else {
    body = (
      <>
        <p className="help-text">
          {t('updates.dialog.available', { latest: check.latest, current: check.current })}{' '}
          {check.notes_url && (
            <a href={check.notes_url} target="_blank" rel="noreferrer">{t('updates.dialog.notesLink')}</a>
          )}
        </p>
        {check.installable ? (
          <>
            <p className="help-text">{t('updates.dialog.installHint')}</p>
            <Button onClick={() => { void install() }}>{t('updates.dialog.install')}</Button>
          </>
        ) : (
          <p className="help-text">{check.reason || t('updates.dialog.notInstallable')}</p>
        )}
      </>
    )
  }

  return (
    <Modal title={t('updates.dialog.title')} onClose={onClose}>
      {body}
    </Modal>
  )
}
