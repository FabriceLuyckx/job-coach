// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/** Shared date/time formatting so every page renders dates the same way. */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** A profile month field holds `YYYY-MM` (a bare `YYYY` also prints and sorts
 *  correctly, so it counts). Only Chromium renders `<input type="month">` as a
 *  real picker that guarantees the format — Safari and Firefox fall back to a
 *  plain text box, so whatever was typed arrives here unchecked. */
export function isMonthValue(v: string): boolean {
  return /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(v.trim())
}

/** Coerce the unambiguous near-misses of that text fallback (`2023-3`,
 *  `2023/03`, `03/2023`) to `YYYY-MM`. Anything else is returned untouched for
 *  `isMonthValue` to flag — guessing at "March 2023" would mean shipping a
 *  month-name table in every UI language. */
export function normalizeMonth(v: string): string {
  const s = v.trim()
  const ym = /^(\d{4})[-/. ](\d{1,2})$/.exec(s)
  const my = ym ? null : /^(\d{1,2})[-/. ](\d{4})$/.exec(s)
  const year = ym ? ym[1] : my?.[2]
  const month = ym ? +ym[2] : Number(my?.[1])
  if (!year || !(month >= 1 && month <= 12)) return s
  return `${year}-${String(month).padStart(2, '0')}`
}
