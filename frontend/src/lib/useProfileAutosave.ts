// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useToast } from '../components/Toast'
import type { Profile } from '../types'
import { errMsg } from './errors'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPath(obj: any, parts: string[], value: unknown): any {
  if (parts.length === 0) return value
  const [head, ...tail] = parts
  return { ...obj, [head]: applyPath(obj[head] ?? {}, tail, value) }
}

/** Debounced, single-flight, latest-wins autosave for the whole profile object.
 * Shared by Profile and Preferences — both edit the same profile.json and save
 * the full document, so only one can be "in flight" meaningfully at a time
 * (they're separate pages/mounts, never rendered together). */
export function useProfileAutosave() {
  const { t } = useTranslation()
  const toast = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const latestProfile = useRef<Profile | null>(null)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)
  // Is there work the server hasn't accepted yet? Every safety net below keys
  // off THIS, not off the debounce timer: on a failed save the timer is null
  // and nothing is in flight, so a timer-based guard goes quiet in exactly the
  // state where the user's data exists only in memory.
  const dirty = useRef(false)

  const runSave = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    const cur = latestProfile.current
    if (!cur) return
    inFlight.current = true
    setSaveState('saving')
    try {
      await api.putProfile(cur)
      dirty.current = false  // only a round-trip clears it
      setSaveState('saved'); setSaveError('')
    } catch (e) {
      setSaveError(errMsg(e)); setSaveState('error')
      // There is no Save button, so a silent failure means the user keeps typing
      // into a void. The status text alone lives in a header they've scrolled
      // past — route it through the channel every other async outcome uses.
      toast.error(t('profile.saveFailedToast', { error: errMsg(e) }), {
        action: { label: t('common.retry'), onClick: () => { void runSave() } },
      })
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; runSave() }
    }
    // `t` and `toast` are closed over for the failure toast — without them here
    // a language switch would leave runSave holding a stale translator.
  }, [t, toast])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveState(s => (s === 'saving' ? s : 'pending'))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void runSave() }, 1500)
  }, [runSave])

  // In-app navigation is covered by the unmount flush below; closing or
  // reloading the tab is not. Warn whenever a save is still owed — including
  // after a failed one, which is the case that actually loses work.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // Same condition as the unload guard: flush whatever the server hasn't
    // taken, not merely whatever the timer happened to be holding.
    if (dirty.current) {
      const cur = latestProfile.current
      if (cur) api.putProfile(cur).catch(() => {})
    }
  }, [])

  useEffect(() => {
    api.getProfile().then(p => {
      setProfile(p); latestProfile.current = p
    }).catch(e => setError(errMsg(e)))
  }, [])

  const set = useCallback((path: string, value: unknown) => {
    const parts = path.split('.')
    setProfile(prev => {
      if (!prev) return prev
      const next = applyPath(prev, parts, value) as Profile
      latestProfile.current = next
      return next
    })
    if (latestProfile.current) {
      latestProfile.current = applyPath(latestProfile.current, parts, value) as Profile
    }
    scheduleSave()
  }, [scheduleSave])

  return {
    profile, setProfile, latestProfile, error, setError,
    saveState, saveError, runSave, scheduleSave, set,
  }
}
