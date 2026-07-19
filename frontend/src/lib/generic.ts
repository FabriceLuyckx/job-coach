// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Fabrice Luyckx

import type { Profile } from '../types'

/** job_url of the generic (untargeted) application. Mirrors GENERIC_URL in
 *  app/services/cv_renderer.py — the server owns writing it; the client only
 *  recognises it to pin and relabel the row. */
export const GENERIC_URL = 'generic:profile'

/** What's still missing before a generic application can be generated. Mirrors
 *  profile_ready() server-side, which is the authority — this only avoids
 *  offering a button that would 400. */
export function genericMissing(profile: Profile | null): ('target_roles' | 'experience')[] {
  if (!profile) return []
  const missing: ('target_roles' | 'experience')[] = []
  if (!profile.preferences?.target_roles?.length) missing.push('target_roles')
  if (!profile.experience?.length) missing.push('experience')
  return missing
}
