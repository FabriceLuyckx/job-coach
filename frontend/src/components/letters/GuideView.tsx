// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import type { LetterGuide } from '../../types'
import Button from '../Button'
import { useToast } from '../Toast'

// ponytail: old letter_history rows used {pointers} per section and no tips; fall
// back to pointers and default missing arrays to [] so historical guides still render.
const secFacts = (s: { evidence?: string[]; pointers?: string[] }) => s.evidence ?? s.pointers ?? []

/** Plain-text outline (markdown) — the clipboard fallback for plain editors.
 * Tips are deliberately NOT copied: the copy is a skeleton to draft the letter
 * around in a doc, while tips are on-screen writing reminders. */
function toMarkdown(g: LetterGuide, t: (k: string) => string): string {
  const lines: string[] = [
    `# ${t('letters.guide.headingFor')} ${g.job_title} @ ${g.employer}`,
    '',
    `## ${t('letters.guide.structure')}`,
  ]
  ;(g.structure ?? []).forEach((s, i) => {
    lines.push('', `### ${i + 1}. ${s.title}`, `_${s.goal}_`)
    secFacts(s).forEach(f => lines.push(`- ${f}`))
  })
  return lines.join('\n')
}

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** Rich-HTML version of the same outline — what Google Docs/Word/Pages paste. */
function toHtml(g: LetterGuide, t: (k: string) => string): string {
  const parts = [
    `<h1>${esc(t('letters.guide.headingFor'))} ${esc(g.job_title)} @ ${esc(g.employer)}</h1>`,
    `<h2>${esc(t('letters.guide.structure'))}</h2>`,
  ]
  ;(g.structure ?? []).forEach((s, i) => {
    parts.push(`<h3>${i + 1}. ${esc(s.title)}</h3>`, `<p><em>${esc(s.goal)}</em></p>`)
    const facts = secFacts(s)
    if (facts.length) parts.push(`<ul>${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`)
  })
  return parts.join('')
}

/** actions: extra controls (e.g. a delete button) rendered beside the Copy button.
 *  note: a full-width line rendered directly under the action row (e.g. a busy hint). */
export default function GuideView({ guide, actions, note }: { guide: LetterGuide; actions?: ReactNode; note?: ReactNode }) {
  const { t } = useTranslation()
  const toast = useToast()

  async function copy() {
    const text = toMarkdown(guide, t)
    try {
      // Rich + plain flavors: Docs/Word/Pages paste real headings and bullets,
      // plain editors get the markdown outline.
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([toHtml(guide, t)], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      toast.success(t('letters.guide.copied'))
    } catch {
      try {
        // ponytail: older browsers without ClipboardItem — plain text still works.
        await navigator.clipboard.writeText(text)
        toast.success(t('letters.guide.copied'))
      } catch {
        toast.error(t('letters.guide.copyFailed'))
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Button variant="secondary" onClick={copy}>
          <Copy size={14} style={{ marginRight: 5, verticalAlign: -2 }} aria-hidden />
          {t('letters.guide.copy')}
        </Button>
        {actions}
      </div>
      {note}

      <div>
        <div className="editor-cluster-label" style={{ marginBottom: 6 }}>{t('letters.guide.structure')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {(guide.structure ?? []).map((s, i) => (
            <div key={i} className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontWeight: 600 }}>{i + 1}. {s.title}</div>
              <p className="muted-sm" style={{ margin: '2px 0', paddingBottom: secFacts(s).length ? 8 : 0 }}>{s.goal}</p>
              {secFacts(s).length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                  {secFacts(s).map((f, j) => <li key={j}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
