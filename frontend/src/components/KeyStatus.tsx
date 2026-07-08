import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { api } from '../api'
import type { EngineProvider } from '../api'

/**
 * App-wide "is the AI engine ready?" state. Drives the first-run banner and lets
 * the CV Generator / Jobs / Profile pages disable their AI actions with an
 * explanation instead of failing with a raw error. Ready means: an OpenRouter key
 * is set, or the selected local model is downloaded.
 */

interface EngineState {
  /** null = still loading. Alias kept as `keySet` so existing consumers work. */
  keySet: boolean | null
  provider: EngineProvider | null
  refresh: () => void
}

const KeyStatusContext = createContext<EngineState>({ keySet: null, provider: null, refresh: () => {} })

export const useKeyStatus = () => useContext(KeyStatusContext)

export function KeyStatusProvider({ children }: { children: ReactNode }) {
  const [keySet, setKeySet] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<EngineProvider | null>(null)

  const refresh = useCallback(() => {
    api.getEngine()
      .then(e => { setKeySet(e.ready); setProvider(e.provider) })
      .catch(() => { setKeySet(null); setProvider(null) })
  }, [])

  useEffect(refresh, [refresh])

  return (
    <KeyStatusContext.Provider value={{ keySet, provider, refresh }}>
      {children}
    </KeyStatusContext.Provider>
  )
}

/** First-run banner shown app-wide until an AI engine is ready. */
export function ApiKeyBanner() {
  const { keySet } = useKeyStatus()
  if (keySet !== false) return null
  return (
    <div className="setup-banner setup-banner-info" role="status">
      <KeyRound size={15} aria-hidden />
      <span>
        Welcome! To generate CVs and scan job listings, set up an AI engine in{' '}
        <Link to="/settings">Settings</Link> — download the free local model, or add
        an OpenRouter API key.
      </span>
    </div>
  )
}
