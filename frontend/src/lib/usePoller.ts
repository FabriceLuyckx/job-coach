// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useRef } from 'react'

/**
 * The one status-polling helper for long-running backend jobs (CV generation,
 * job scans). `start(tick)` calls `tick` every `interval` ms until it returns
 * true (finished) or throws; the interval is always cleaned up on unmount.
 */
export function usePoller(interval = 2000) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  function stop() {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  function start(tick: () => Promise<boolean>) {
    stop()
    timer.current = setInterval(async () => {
      let done = false
      try {
        done = await tick()
      } catch {
        done = true // tick is expected to handle its own errors; stop regardless
      }
      if (done) stop()
    }, interval)
  }

  useEffect(() => stop, [])

  return { start, stop }
}
