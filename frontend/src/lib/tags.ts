// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/** Hard ceiling on entries in one tag field. Every tag is stored in
 * profile.json and shipped to the engine on each posting read, so an
 * accidentally-pasted CSV would otherwise cost tokens on every scan, forever. */
export const MAX_TAGS = 30

/** Turn a raw TagInput draft into the next tag list.
 *
 * Pure and separate from the component so it can be checked without a DOM:
 * see `frontend/scripts/check-tags.mjs`.
 *
 * - splits on comma/semicolon/newline, so a pasted "Ghent, Brussels" is two tags
 * - dedupes case-insensitively against existing entries and within the paste
 * - truncates each entry to `maxLength` when one is set
 * - stops at MAX_TAGS, reporting how many were dropped so the caller can say so
 *   (a silently-truncated paste is exactly the invisible failure to avoid)
 */
export function parseTags(draft: string, existing: string[], maxLength?: number): {
  tags: string[]
  dropped: number
} {
  const next = [...existing]
  let dropped = 0
  for (const raw of draft.split(/[,;\n]+/)) {
    let part = raw.trim()
    if (!part) continue
    if (maxLength) part = part.slice(0, maxLength)
    if (next.some(v => v.toLowerCase() === part.toLowerCase())) continue
    if (next.length >= MAX_TAGS) { dropped++; continue }
    next.push(part)
  }
  return { tags: next, dropped }
}
