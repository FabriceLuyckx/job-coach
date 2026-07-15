// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/** Normalize an unknown thrown value to a user-displayable message. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
