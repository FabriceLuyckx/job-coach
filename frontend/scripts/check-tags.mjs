// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

// Self-check for parseTags — the one non-trivial path in TagInput.
// Run: node frontend/scripts/check-tags.mjs   (node strips the TS types)
import assert from 'node:assert/strict'
import { parseTags, MAX_TAGS } from '../src/lib/tags.ts'

const tags = (...a) => parseTags(...a).tags

// a plain entry
assert.deepEqual(tags('Data Scientist', []), ['Data Scientist'])
// a pasted list becomes several tags, not one
assert.deepEqual(tags('Ghent, Brussels; Antwerp', []), ['Ghent', 'Brussels', 'Antwerp'])
// dedupe is case-insensitive, against existing and within the paste
assert.deepEqual(tags('data scientist', ['Data Scientist']), ['Data Scientist'])
assert.deepEqual(tags('Ghent, ghent', []), ['Ghent'])
// blanks and stray separators drop out
assert.deepEqual(tags('  , ,\n', ['Ghent']), ['Ghent'])
// maxLength truncates each entry, not the whole draft
assert.deepEqual(tags('abcdef, ghijkl', [], 3), ['abc', 'ghi'])
// nothing to add leaves the list identical
assert.deepEqual(tags('', ['Ghent']), ['Ghent'])

// a pasted CSV stops at the ceiling and reports the overflow
const many = Array.from({ length: 50 }, (_, i) => `role ${i}`).join(', ')
const big = parseTags(many, [])
assert.equal(big.tags.length, MAX_TAGS)
assert.equal(big.dropped, 50 - MAX_TAGS)
// a full list accepts nothing further, and says so
const full = Array.from({ length: MAX_TAGS }, (_, i) => `r${i}`)
assert.deepEqual(parseTags('one more', full), { tags: full, dropped: 1 })
// duplicates past the cap are deduped, not counted as dropped
assert.deepEqual(parseTags('r0', full), { tags: full, dropped: 0 })

console.log('parseTags: ok')
