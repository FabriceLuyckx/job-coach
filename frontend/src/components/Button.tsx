// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** Square icon-only button (used for the × remove control). */
  icon?: boolean
  /** Show a spinner and disable while an async action runs. */
  busy?: boolean
  children?: ReactNode
}

/** The single button primitive for the whole app. */
export default function Button({
  variant = 'primary', icon = false, busy = false,
  disabled, children, className, ...rest
}: Props) {
  const cls = `btn-${variant}${icon ? ' btn-icon' : ''}${className ? ' ' + className : ''}`
  return (
    <button type="button" className={cls} disabled={disabled || busy} {...rest}>
      {busy && <span className="spinner" />}
      {children}
    </button>
  )
}
