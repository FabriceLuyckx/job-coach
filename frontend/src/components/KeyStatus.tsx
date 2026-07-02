import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { api } from '../api'

/**
 * App-wide "is the OpenRouter key configured?" state. Drives the first-run
 * banner and lets the CV Generator / Jobs pages disable their AI actions with
 * an explanation instead of failing with a raw error.
 */

interface KeyStatus {
  /** null = still loading */
  keySet: boolean | null
  refresh: () => void
}

const KeyStatusContext = createContext<KeyStatus>({ keySet: null, refresh: () => {} })

export const useKeyStatus = () => useContext(KeyStatusContext)

export function KeyStatusProvider({ children }: { children: ReactNode }) {
  const [keySet, setKeySet] = useState<boolean | null>(null)

  const refresh = useCallback(() => {
    api.getSettings()
      .then(s => setKeySet(s.openrouter_api_key_set))
      .catch(() => setKeySet(null))
  }, [])

  useEffect(refresh, [refresh])

  return (
    <KeyStatusContext.Provider value={{ keySet, refresh }}>
      {children}
    </KeyStatusContext.Provider>
  )
}

/** First-run banner shown app-wide until an API key is configured. */
export function ApiKeyBanner() {
  const { keySet } = useKeyStatus()
  if (keySet !== false) return null
  return (
    <div className="setup-banner setup-banner-info" role="status">
      <KeyRound size={15} aria-hidden />
      <span>
        Welcome! To generate CVs and scan job listings, add your OpenRouter API key
        in <Link to="/settings">Settings</Link> — it takes a minute and costs a few cents per CV.
      </span>
    </div>
  )
}
