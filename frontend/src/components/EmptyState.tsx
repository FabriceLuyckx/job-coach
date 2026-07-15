// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Shared first-run / empty-list state: icon, title, guidance, optional action. */
export default function EmptyState({ icon: Icon, title, children, action }: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <Icon size={28} strokeWidth={1.5} aria-hidden />
      <div className="empty-state-title">{title}</div>
      {children && <div className="empty-state-body">{children}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
