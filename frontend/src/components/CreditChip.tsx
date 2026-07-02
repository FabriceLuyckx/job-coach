import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { api } from '../api'
import { useKeyStatus } from './KeyStatus'

/**
 * Small OpenRouter balance indicator, shown next to the buttons that actually
 * spend credits (Generate CV, Find new listings) so cost is visible where it
 * happens, not only in Settings.
 */
export default function CreditChip() {
  const { keySet } = useKeyStatus()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!keySet) return
    let active = true
    api.getOpenrouterUsage()
      .then(u => { if (active) setBalance(u.balance ?? u.remaining) })
      .catch(() => {})
    return () => { active = false }
  }, [keySet])

  if (!keySet || balance == null) return null
  return (
    <span className={`credit-chip${balance < 1 ? ' credit-chip-low' : ''}`}
      title="Your OpenRouter credit balance">
      <Wallet size={13} aria-hidden />
      ${balance.toFixed(2)}
    </span>
  )
}
