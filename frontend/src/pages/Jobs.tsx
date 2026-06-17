export default function JobsPage() {
  return (
    <div>
      <h1 className="page-title">Job Suggestions</h1>
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Coming in Phase 5</div>
        <p style={{ maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
          Automated job scraping from sources like Euraxess and IMEC will appear here.
          Jobs will be scored against your profile and ranked by relevance.
        </p>
      </div>
    </div>
  )
}
