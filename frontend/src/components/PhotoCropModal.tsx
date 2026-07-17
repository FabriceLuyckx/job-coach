// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Button from './Button'
import SaveButton from './SaveButton'
import type { CVDesignPreferences } from '../types'

type Crop = NonNullable<CVDesignPreferences['photo_crop']>

export const DEFAULT_CROP: Crop = { zoom: 1, x: 50, y: 50 }

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/**
 * Framing editor for the CV photo: drag to pan, slider (or wheel) to zoom.
 *
 * Stores parameters only — the uploaded image is never re-encoded, so the crop
 * is lossless and re-editable forever, and the preview here uses the exact CSS
 * the templates apply (object-fit: contain on the CV's paper colour +
 * object-position + scale), in the same square frame. Every template crops to a
 * circle, so a circular mask dims what will be cut off.
 */
export default function PhotoCropModal({ src, initial, paper, onCancel, onSave }: {
  src: string
  initial?: Crop
  /** The CV's background colour — the letterbox margin is part of the photo. */
  paper: string
  onCancel: () => void
  onSave: (crop: Crop) => Promise<void>
}) {
  const { t } = useTranslation()
  const [crop, setCrop] = useState<Crop>(initial ?? DEFAULT_CROP)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const dirty = JSON.stringify(crop) !== JSON.stringify(initial ?? DEFAULT_CROP)

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const frame = frameRef.current
    if (!d || !frame) return
    // x/y are translate offsets (50 = centred, see the style below), so they run
    // in the same direction as the drag. Measuring against the frame makes it
    // 1:1 — the photo tracks the pointer exactly.
    const { width, height } = frame.getBoundingClientRect()
    setCrop({
      ...crop,
      x: clamp(d.cx + ((e.clientX - d.x) / width) * 100, 0, 100),
      y: clamp(d.cy + ((e.clientY - d.y) / height) * 100, 0, 100),
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
  }

  function onWheel(e: React.WheelEvent) {
    setCrop(c => ({ ...c, zoom: clamp(+(c.zoom - e.deltaY * 0.002).toFixed(2), ZOOM_MIN, ZOOM_MAX) }))
  }

  return (
    <Modal title={t('settings.photo.adjustTitle')} onClose={onCancel}>
      <p className="help-text">{t('settings.photo.adjustHelp')}</p>

      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          width: 220,
          height: 220,
          margin: '0 auto var(--space-4)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          cursor: 'grab',
          touchAction: 'none',
          background: paper,
          position: 'relative',
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            // Must stay identical to photo_frame() in _sections.html — this is a
            // preview of the CV, not a lookalike.
            transform: `translate(${crop.x - 50}%, ${crop.y - 50}%) scale(${crop.zoom})`,
            userSelect: 'none',
          }}
        />
        {/* Circle mask: templates crop to a circle, so dim everything outside
            it. pointer-events: none keeps drag/wheel on the frame underneath. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 0 9999px rgba(28, 26, 22, 0.55)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div className="field">
        <label htmlFor="photo-zoom">{t('settings.photo.zoom')}</label>
        <input
          id="photo-zoom"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.05}
          value={crop.zoom}
          onChange={e => setCrop({ ...crop, zoom: +e.target.value })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <SaveButton dirty={dirty} onSave={() => onSave(crop)} idleLabel={t('common.save')} />
        <Button variant="secondary" onClick={() => setCrop(DEFAULT_CROP)} disabled={!dirty}>
          {t('settings.photo.resetCrop')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Modal>
  )
}
