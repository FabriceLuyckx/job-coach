import { useState, KeyboardEvent } from 'react'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}

export default function TagInput({ value, onChange, placeholder = 'Add and press Enter' }: Props) {
  const [draft, setDraft] = useState('')

  function add() {
    const trimmed = draft.trim()
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
      />
    </div>
  )
}
