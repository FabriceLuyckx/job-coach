// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { api } from '../api'
import { useKeyStatus } from './KeyStatus'

/**
 * Small OpenRouter balance indicator, shown next to the buttons that actually
 * spend credits (Generate CV, Find new listings) so cost is visible where it
 * happens, not only in Settings.
 */
// Module-side cache: the balance is fetched from openrouter.ai (slow, remote),
// so page switches show the last value instantly and only refresh when stale.
let cachedBalance: number | null = null
let cachedAt = 0
const BALANCE_TTL_MS = 60_000

export default function CreditChip() {
  const { keySet, provider } = useKeyStatus()
  const [balance, setBalance] = useState<number | null>(cachedBalance)

  useEffect(() => {
    if (!keySet || provider !== 'openrouter') return
    if (Date.now() - cachedAt < BALANCE_TTL_MS) return
    let active = true
    api.getOpenrouterUsage()
      .then(u => {
        cachedBalance = u.balance ?? u.remaining
        cachedAt = Date.now()
        if (active) setBalance(cachedBalance)
      })
      .catch(() => {})
    return () => { active = false }
  }, [keySet, provider])

  // Balance is an OpenRouter concept; the local engine has no cost to show.
  if (provider !== 'openrouter' || !keySet || balance == null) return null
  return (
    <span className={`credit-chip${balance < 1 ? ' credit-chip-low' : ''}`}
      title="Your OpenRouter credit balance">
      <Wallet size={13} aria-hidden />
      ${balance.toFixed(2)}
    </span>
  )
}
