// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from './Button'

// Windowed page numbers: up to 5 around the current page, with the first/last
// page pinned and an ellipsis standing in for the omitted range. Returns page
// indices (0-based) and the string '…' for gaps.
function pageWindow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i)
  const out: (number | '…')[] = [0]
  const start = Math.max(1, page - 2)
  const end = Math.min(pageCount - 2, page + 2)
  if (start > 1) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pageCount - 2) out.push('…')
  out.push(pageCount - 1)
  return out
}

/** Numbered pager for the archival lists. `page`/`pageCount` are 0-based /
 * count; `onChange` emits a new 0-based page index. Renders nothing for a
 * single page. */
export default function Pager({ page, pageCount, onChange }: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
      <Button variant="ghost" icon aria-label={t('pager.prev')} disabled={page === 0}
        onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} aria-hidden />
      </Button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === '…'
          ? <span key={`gap${i}`} className="muted-sm" style={{ padding: '0 var(--space-1)' }} aria-hidden>…</span>
          : <Button key={p} variant={p === page ? 'secondary' : 'ghost'} icon
              aria-label={t('pager.page', { n: p + 1 })}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}>
              {p + 1}
            </Button>,
      )}
      <Button variant="ghost" icon aria-label={t('pager.next')} disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}>
        <ChevronRight size={16} aria-hidden />
      </Button>
    </div>
  )
}
