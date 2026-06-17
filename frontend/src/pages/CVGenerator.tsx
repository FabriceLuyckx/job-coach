import { useRef, useState } from 'react'
import { api } from '../api'

const SECTIONS = [
  { key: 'summary', label: 'Professional Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'publications', label: 'Publications' },
  { key: 'links', label: 'Links' },
  { key: 'skills', label: 'Skills' },
  { key: 'languages', label: 'Languages' },
  { key: 'education', label: 'Education' },
  { key: 'grants', label: 'Grants & Fellowships' },
  { key: 'photo', label: 'Photo' },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export default function CVGeneratorPage() {
  const [url, setUrl] = useState('')
  const [lang, setLang] = useState<'en' | 'nl'>('en')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    slug: string; job_title: string; employer: string; tailoring_notes: string; preview_url: string
  } | null>(null)
  const [visible, setVisible] = useState<Record<SectionKey, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.key, true])) as Record<SectionKey, boolean>
  )
  const iframeRef = useRef<HTMLIFrameElement>(null)

  async function generate() {
    if (!url.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await api.generateCV(url.trim(), lang)
      setResult(res)
      // reset toggles to all visible for each new generation
      setVisible(Object.fromEntries(SECTIONS.map(s => [s.key, true])) as Record<SectionKey, boolean>)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  function toggleSection(key: SectionKey, show: boolean) {
    setVisible(prev => ({ ...prev, [key]: show }))
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    iframe.contentDocument.querySelectorAll<HTMLElement>(`[data-section="${key}"]`).forEach(el => {
      el.style.display = show ? '' : 'none'
    })
  }

  function onIframeLoad() {
    // apply current toggle state after iframe loads
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    SECTIONS.forEach(({ key }) => {
      if (!visible[key]) {
        iframe.contentDocument!.querySelectorAll<HTMLElement>(`[data-section="${key}"]`).forEach(el => {
          el.style.display = 'none'
        })
      }
    })
  }

  return (
    <div>
      <h1 className="page-title">CV Generator</h1>

      <div className="card">
        <div className="field">
          <label>Job listing URL</label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ width: 120 }}>
            <label>Language</label>
            <select value={lang} onChange={e => setLang(e.target.value as 'en' | 'nl')}>
              <option value="en">English</option>
              <option value="nl">Dutch</option>
            </select>
          </div>
          <button className="btn-primary" onClick={generate} disabled={loading || !url.trim()}>
            {loading && <span className="spinner" />}
            {loading ? 'Generating…' : 'Generate CV'}
          </button>
        </div>
        {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, marginTop: 4 }}>
          {/* Controls panel */}
          <div>
            <div className="card" style={{ position: 'sticky', top: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                {result.job_title}<br />
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>{result.employer}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
                {result.tailoring_notes}
              </p>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Sections</div>
              {SECTIONS.map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontWeight: 400, color: 'var(--text)', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={visible[key]}
                    onChange={e => toggleSection(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <a
                  href={`/api/cv/preview/${result.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ display: 'block', textAlign: 'center', padding: '7px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Open full screen
                </a>
              </div>
            </div>
          </div>

          {/* CV iframe */}
          <div style={{ minHeight: 600 }}>
            <iframe
              ref={iframeRef}
              src={`/api/cv/preview/${result.slug}`}
              onLoad={onIframeLoad}
              style={{ width: '100%', height: '100vh', border: 'none', borderRadius: 'var(--radius)' }}
              title="CV Preview"
            />
          </div>
        </div>
      )}
    </div>
  )
}
