// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { X } from 'lucide-react'
import Button from './Button'

/** The one delete control used wherever a list item is removed. Quiet by
 * default; destructive intent (red) appears on hover only. */
export default function RemoveButton({ onClick, title = 'Remove' }: { onClick: () => void; title?: string }) {
  return (
    <Button variant="ghost" icon className="btn-icon-danger" aria-label={title} title={title} onClick={onClick}>
      <X size={16} aria-hidden />
    </Button>
  )
}
