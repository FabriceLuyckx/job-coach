import { useState, KeyboardEvent } from 'react'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  // Cap each entry's length. Used for skills, which render as fixed-width
  // pills in the CV sidebar and must stay on a tidy line.
  maxLength?: number
}

export default function TagInput({ value, onChange, placeholder = 'Add and press Enter', maxLength }: Props) {
  const [draft, setDraft] = useState('')

  function add() {
    let trimmed = draft.trim()
    if (maxLength) trimmed = trimmed.slice(0, maxLength)
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setDraft('')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="tag-list" style={{ marginBottom: value.length ? 8 : 0 }}>
        {value.map((v) => (
          <span key={v} className="tag">
            {v}
            <button type="button" onClick={() => onChange(value.filter(x => x !== v))}>×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      {maxLength && draft.length >= maxLength && (
        <div className="field-hint">Keep skills short ({maxLength} characters max) so they fit the CV sidebar.</div>
      )}
    </div>
  )
}
