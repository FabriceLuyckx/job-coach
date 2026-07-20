// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { ReactNode } from 'react'

type Variant = 'cv' | 'ai' | 'jobs' | 'lang' | 'neutral' | 'required'

/** Small pill — section badges, language tags, statuses. */
export default function Badge({ variant = 'neutral', children }: {
  variant?: Variant
  children: ReactNode
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
