/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import axios from 'axios'

import { api, type ApiEnvelope } from '@/lib/api'

export type AuthorizationDecision = 'approve' | 'deny'

export type DecisionOutcome = 'approved' | 'denied' | 'expired' | 'error'

/** The code the desktop app shows, as typed into its link: trimmed, upper case, letters, digits and dashes only. */
export function normalizeUserCode(value: string | null): string {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

// The server answers an unknown, used-up or timed-out code with these.
function failureOf(code: string | undefined): DecisionOutcome {
  return code === 'expired_token' || code === 'invalid_request' ? 'expired' : 'error'
}

/** Sends the signed-in visitor's answer to the desktop app's connection request. */
export async function decideDesktopAuthorization(userCode: string, decision: AuthorizationDecision): Promise<DecisionOutcome> {
  try {
    const res = await api.post<ApiEnvelope<{ status?: string }>>('/api/desktop/v2/device-authorizations/decision', {
      user_code: userCode,
      decision,
    })
    if (res.data.success) return decision === 'approve' ? 'approved' : 'denied'
    return failureOf(res.data.code)
  } catch (error) {
    if (axios.isAxiosError(error)) return failureOf((error.response?.data as { code?: string } | undefined)?.code)
    return 'error'
  }
}
