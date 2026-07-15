// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import type { LetterGuide } from '../../types'
import Button from '../Button'
import { useToast } from '../Toast'

/** Serialise a guide to a markdown outline the user pastes into their editor. */
function toMarkdown(g: LetterGuide, t: (k: string) => string): string {
  const lines: string[] = [
    `# ${t('letters.guide.headingFor')} ${g.job_title} @ ${g.employer}`,
    '',
    `**${t('letters.guide.angle')}:** ${g.angle}`,
    '',
    `## ${t('letters.guide.structure')}`,
  ]
  g.structure.forEach((s, i) => {
    lines.push('', `### ${i + 1}. ${s.title}`, `_${s.goal}_`)
    s.pointers.forEach(p => lines.push(`- ${p}`))
  })
  lines.push('', `## ${t('letters.guide.evidence')}`)
  g.evidence.forEach(e => lines.push(`- **${e.job_need}** → ${e.your_match}`))
  if (g.gaps.length) {
    lines.push('', `## ${t('letters.guide.gaps')}`)
    g.gaps.forEach(gap => lines.push(`- ${gap}`))
  }
  lines.push('', `## ${t('letters.guide.tone')}`, g.tone)
  return lines.join('\n')
}

export default function GuideView({ guide }: { guide: LetterGuide }) {
  const { t } = useTranslation()
  const toast = useToast()

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(guide, t))
      toast.success(t('letters.guide.copied'))
    } catch {
      toast.error(t('letters.guide.copyFailed'))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={copy}>
          <Copy size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
          {t('letters.guide.copyMarkdown')}
        </Button>
      </div>

      <div>
        <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.angle')}</div>
        <p style={{ margin: 0 }}>{guide.angle}</p>
      </div>

      <div>
        <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.structure')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {guide.structure.map((s, i) => (
            <div key={i} className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontWeight: 600 }}>{i + 1}. {s.title}</div>
              <p className="muted-sm" style={{ margin: '2px 0 8px' }}>{s.goal}</p>
              <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                {s.pointers.map((p, j) => <li key={j}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.evidence')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {guide.evidence.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', fontWeight: 600 }}>{e.job_need}</div>
              <div style={{ flex: '2 1 300px' }}>{e.your_match}</div>
            </div>
          ))}
        </div>
      </div>

      {guide.gaps.length > 0 && (
        <div>
          <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.gaps')}</div>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {guide.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      <div>
        <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.tone')}</div>
        <p className="muted-sm" style={{ margin: 0 }}>{guide.tone}</p>
      </div>
    </div>
  )
}
