interface Props {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}

export default function BulletListEditor({ value, onChange, placeholder = 'Add item…' }: Props) {
  function update(idx: number, text: string) {
    const next = [...value]
    next[idx] = text
    onChange(next)
  }
  function remove(idx: number) { onChange(value.filter((_, i) => i !== idx)) }
  function add() { onChange([...value, '']) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={item}
            onChange={e => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <button type="button" className="btn-danger" style={{ flexShrink: 0, padding: '7px 10px' }} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>+ Add</button>
    </div>
  )
}
