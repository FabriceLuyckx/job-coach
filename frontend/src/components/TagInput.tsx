// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useState, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from './Toast'
import { MAX_TAGS, parseTags } from '../lib/tags'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  // Cap each entry's length. Used for skills, which render as fixed-width
  // pills in the CV sidebar and must stay on a tidy line.
  maxLength?: number
  // Ties a visible <label htmlFor> to the text field.
  id?: string
}

export default function TagInput({ value, onChange, placeholder = 'Add and press Enter', maxLength, id }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [draft, setDraft] = useState('')

  function add() {
    const { tags, dropped } = parseTags(draft, value, maxLength)
    if (tags.length !== value.length) onChange(tags)
    if (dropped) toast.info(t('common.tagLimit', { max: MAX_TAGS, dropped }))
    setDraft('')
  }

  function remove(tag: string) {
    const before = value
    onChange(value.filter(x => x !== tag))
    // Removal is one click with no confirmation; every other destructive action
    // in the app offers Undo, and retyping a tag from memory is the one thing
    // this page should never ask for.
    toast.info(t('common.removedNamed', { name: tag }), {
      duration: 5000,
      action: { label: t('cv.undo'), onClick: () => onChange(before) },
    })
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !draft && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  return (
    <div>
      <div className="tag-list" style={{ marginBottom: value.length ? 8 : 0 }}>
        {value.map((v) => (
          <span key={v} className="tag">
            {v}
            <button type="button" aria-label={t('common.removeNamed', { name: v })}
              title={t('common.removeNamed', { name: v })}
              onClick={() => remove(v)}>×</button>
          </span>
        ))}
      </div>
      <input
        id={id}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      {maxLength && draft.length >= maxLength && (
        <div className="field-hint">{t('common.tagLengthHint', { max: maxLength })}</div>
      )}
    </div>
  )
}
