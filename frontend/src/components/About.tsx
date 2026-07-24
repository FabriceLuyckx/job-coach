// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import Modal from './Modal'
import { api } from '../api'

// The repo/license URLs match the footer's — the modal is the richer, more
// discoverable surface for the same AGPL §13 source offer.
const REPO_URL = 'https://github.com/FabriceLuyckx/job-coach'
const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html'

/** About the app: name, version (fetched on open), description, copyright, and
 *  license/source links. Reuses the shared accessible Modal. */
export default function About({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    api.getVersion().then(v => setVersion(v.version)).catch(() => setVersion(''))
  }, [])

  return (
    <Modal title={t('about.title')} onClose={onClose}>
      <p className="help-text" style={{ marginTop: 0 }}>{t('about.description')}</p>
      <p className="help-text">
        {t('about.version', { version: version || '—' })}
      </p>
      <p className="help-text">{t('about.copyright')}</p>
      <p className="help-text" style={{ marginBottom: 0 }}>
        <Trans
          i18nKey="about.license"
          components={{
            lic: <a href={LICENSE_URL} target="_blank" rel="noreferrer" />,
            src: <a href={REPO_URL} target="_blank" rel="noreferrer" />,
          }}
        />
      </p>
    </Modal>
  )
}
