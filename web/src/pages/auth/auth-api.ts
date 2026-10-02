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
import { t } from '@/i18n/i18n'
import { api, type ApiEnvelope } from '@/lib/api'
import { unwrap } from '@/lib/console-api'

/** `?turnstile=` for the routes behind the human check (middleware/turnstile-check.go). */
function humanCheck(token: string): Record<string, string> {
  return token ? { turnstile: token } : {}
}

// ── Password recovery (controller/misc.go) ────────────────────────────────

/** Mails a reset link; the server answers the same whether or not the address is registered. */
export async function sendResetEmail(email: string, turnstile: string): Promise<void> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/reset_password', { params: { email, ...humanCheck(turnstile) } })
  unwrap(res.data, t('发送失败'))
}

/** Redeems the emailed link; the server sets and returns a new random password. */
export async function confirmReset(email: string, token: string): Promise<string> {
  const res = await api.post<ApiEnvelope<string>>('/api/user/reset', { email, token })
  return unwrap(res.data, t('重置失败'))
}
