import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const latestProfile = useRef<Profile | null>(null)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const queued = useRef(false)

  const runSave = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return }
    const cur = latestProfile.current
    if (!cur) return
    inFlight.current = true
    setSaveState('saving')
    try {
      await api.putProfile(cur)
      setSaveState('saved'); setSaveError('')
    } catch (e) {
      setSaveError(errMsg(e)); setSaveState('error')
    } finally {
      inFlight.current = false
      if (queued.current) { queued.current = false; runSave() }
    }
  }, [])

  const scheduleSave = useCallback(() => {
    setSaveState(s => (s === 'saving' ? s : 'pending'))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(runSave, 1500)
  }, [runSave])

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
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
