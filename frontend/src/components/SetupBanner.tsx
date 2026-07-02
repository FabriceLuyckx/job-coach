import { useEffect, useState } from 'react'
import { Download, TriangleAlert } from 'lucide-react'
import { getSetupStatus, type SetupStatus } from '../api'

/**
 * One-time first-run banner shown while the packaged app downloads its PDF
 * engine (Chromium, ~150 MB). Everything except PDF export works meanwhile.
 * Stays hidden entirely once Chromium is present — so it never shows in a dev
 * setup where it's already installed.
 */
export default function SetupBanner() {
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
    ? `PDF engine setup failed: ${status.error}. PDF export is unavailable; other features work.`
    : 'Setting up — downloading the PDF engine (~150 MB, one time). PDF export will be available shortly; everything else works now.'

  return (
    <div role="status" className={`setup-banner ${status.error ? 'setup-banner-error' : 'setup-banner-info'}`}>
      {status.error ? <TriangleAlert size={15} aria-hidden /> : <Download size={15} aria-hidden />}
      <span>{message}</span>
    </div>
  )
}
