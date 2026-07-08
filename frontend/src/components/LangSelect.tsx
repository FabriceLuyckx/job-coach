import { LANGUAGE_NAMES, SHIPPED_LOCALES } from '../i18n'

/**
 * CV-language dropdown. Offers the shipped languages (native names) plus any
 * extra code already in use (e.g. a posting's detected language) so a CV can be
 * generated in a language beyond the shipped set.
 */
export default function LangSelect({ value, onChange, disabled, extra, style }: {
  value: string
  onChange: (lang: string) => void
  disabled?: boolean
  extra?: string  // an additional code to include (e.g. the current value)
  style?: React.CSSProperties
}) {
  const codes = [...SHIPPED_LOCALES as readonly string[]]
  if (extra && !codes.includes(extra)) codes.push(extra)
  if (!codes.includes(value)) codes.push(value)
  return (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={style}>
      {codes.map(code => (
        <option key={code} value={code}>{LANGUAGE_NAMES[code] ?? code}</option>
      ))}
    </select>
  )
}
