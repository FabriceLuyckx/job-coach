// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, TriangleAlert } from 'lucide-react'
import { getSetupStatus, type SetupStatus } from '../api'

/**
 * One-time first-run banner shown while the packaged app downloads its PDF
 * engine (Chromium, ~150 MB). Everything except PDF export works meanwhile.
 * Stays hidden entirely once Chromium is present — so it never shows in a dev
 * setup where it's already installed.
 */
export default function SetupBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SetupStatus | null>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const s = await getSetupStatus()
        if (!active) return
        setStatus(s)
        if (!s.chromium_ready) timer = setTimeout(poll, 2000)
      } catch {
        if (active) timer = setTimeout(poll, 5000)
      }
    }
    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])

  if (!status || status.chromium_ready) return null

  const message = status.error
    ? t('banner.setupError', { error: status.error })
    : t('banner.setupInstalling')

  return (
    <div role="status" className={`setup-banner ${status.error ? 'setup-banner-error' : 'setup-banner-info'}`}>
      {status.error ? <TriangleAlert size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      <span>{message}</span>
    </div>
  )
}
