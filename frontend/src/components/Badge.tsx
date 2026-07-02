import type { ReactNode } from 'react'

type Variant = 'cv' | 'ai' | 'jobs' | 'lang' | 'neutral'

/** Small pill — section badges, language tags, statuses. */
export default function Badge({ variant = 'neutral', children }: {
  variant?: Variant
  children: ReactNode
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
