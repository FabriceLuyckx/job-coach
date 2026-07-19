// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

/**
 * Schematic preview of a CV template — a handful of divs standing in for the
 * layout's blocks, drawn in the palette currently selected. No screenshots, no
 * image assets, no AI: crisp at any DPI and it doubles as a live palette
 * preview (the swatches recolour it before anything is saved).
 */

interface Palette { accent: string; ink: string; paper: string }

/** One text line. `w` is a percentage of its container. */
function Line({ w, color, h = 2 }: { w: number; color: string; h?: number }) {
  return <div style={{ width: `${w}%`, height: h, background: color, opacity: 0.55 }} />
}

function Lines({ widths, color }: { widths: number[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {widths.map((w, i) => <Line key={i} w={w} color={color} />)}
    </div>
  )
}

/** A section: accent heading rule + a few body lines. */
function Block({ p, headW = 40, lines = [100, 92, 78] }: { p: Palette; headW?: number; lines?: number[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Line w={headW} color={p.accent} h={2.5} />
      <Lines widths={lines} color={p.ink} />
    </div>
  )
}

const THUMB_W = 90
const THUMB_H = 120  // ~A4 ratio

export default function TemplateThumb({ layout, palette, selected }: {
  layout: string
  palette: Palette
  selected: boolean
}) {
  const p = palette
  const sheet: React.CSSProperties = {
    width: THUMB_W,
    height: THUMB_H,
    background: p.paper,
    border: `1px solid ${selected ? p.accent : 'var(--border)'}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }

  // Each arm mirrors its template's actual geometry — sidebar side, header
  // treatment, photo spot — at postage-stamp scale.
  if (layout === 'default' || layout === 'compact') {
    const dense = layout === 'compact'
    const sidebar = (
      <div style={{
        width: dense ? '32%' : '36%',
        background: `color-mix(in srgb, ${p.accent} 8%, ${p.paper})`,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{
          width: dense ? 14 : 18, height: dense ? 14 : 18, borderRadius: '50%',
          background: p.accent, opacity: 0.35, margin: '0 auto',
        }} />
        <Lines widths={[90, 70]} color={p.ink} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {[10, 8, 12, 7].map((w, i) => (
            <div key={i} style={{ width: w, height: 3, background: p.accent, opacity: 0.7 }} />
          ))}
        </div>
        <Lines widths={[85, 60]} color={p.ink} />
      </div>
    )
    const main = (
      <div style={{ flex: 1, padding: 4, display: 'flex', flexDirection: 'column', gap: dense ? 3 : 4 }}>
        <Block p={p} lines={dense ? [100, 95, 88, 80] : [100, 92, 84]} />
        <Block p={p} lines={dense ? [100, 92, 96, 78] : [96, 88]} />
        {dense && <Block p={p} lines={[100, 90]} />}
      </div>
    )
    return (
      <div style={sheet}>
        {/* default has the accent header band across the top; compact leads with
            the name in the main column instead. */}
        {layout === 'default' && (
          <div style={{ height: 16, background: p.accent, flex: '0 0 auto' }} />
        )}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {layout === 'default' ? <>{sidebar}{main}</> : <>{main}{sidebar}</>}
        </div>
      </div>
    )
  }

  if (layout === 'banner') {
    return (
      <div style={sheet}>
        <div style={{
          height: 30, background: p.accent, flex: '0 0 auto', padding: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{ width: '60%', height: 4, background: p.paper, opacity: 0.9 }} />
            <div style={{ width: '40%', height: 2, background: p.paper, opacity: 0.6 }} />
          </div>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: `1px solid ${p.paper}`, opacity: 0.9, flex: '0 0 auto',
          }} />
        </div>
        <div style={{ flex: 1, padding: 5, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Block p={p} lines={[100, 94, 86]} />
          <Block p={p} lines={[100, 90]} />
          <Block p={p} lines={[96, 88, 72]} />
        </div>
      </div>
    )
  }

  if (layout === 'classic') {
    return (
      <div style={{ ...sheet, padding: 6, gap: 5 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.accent, opacity: 0.3 }} />
          <div style={{ width: '55%', height: 4, background: p.accent }} />
          <div style={{ width: '35%', height: 2, background: p.ink, opacity: 0.5 }} />
          <div style={{ width: '100%', height: 1, background: p.accent, marginTop: 2 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Block p={p} headW={30} lines={[100, 95, 88]} />
          <Block p={p} headW={30} lines={[100, 92]} />
          <Block p={p} headW={30} lines={[96, 84]} />
        </div>
      </div>
    )
  }

  // minimal — typographic: no filled blocks, accent only on thin marks.
  return (
    <div style={{ ...sheet, padding: 7, gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <div style={{ width: '70%', height: 3, background: p.ink, opacity: 0.75 }} />
          <div style={{ width: '45%', height: 2, background: p.accent }} />
        </div>
        <div style={{ width: 11, height: 11, borderRadius: '50%', border: `1px solid ${p.ink}`, opacity: 0.35, flex: '0 0 auto' }} />
      </div>
      <div style={{ height: 1, background: p.ink, opacity: 0.2 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Block p={p} headW={22} lines={[100, 93, 85]} />
        <Block p={p} headW={22} lines={[100, 88]} />
        <Block p={p} headW={22} lines={[94, 80]} />
      </div>
    </div>
  )
}
