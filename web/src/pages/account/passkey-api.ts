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

import { applyRotation } from './account-api'
import { assertionResult, creationOptions, registrationResult, requestOptions } from './webauthn'

/** controller/passkey.go PasskeyStatus. */
export type PasskeyStatus = { enabled: boolean; last_used_at?: string | null }

/** What a security proof may unlock (controller/secure_verification.go). */
export type ProofScope = 'passkey.register' | 'passkey.delete'

type Challenge = { options?: unknown; flow_token?: string }

const proofHeaders = (proof?: string) => (proof ? { 'X-Security-Proof': proof } : undefined)

export async function getPasskeyStatus(): Promise<PasskeyStatus> {
  const res = await api.get<ApiEnvelope<PasskeyStatus>>('/api/user/passkey')
  return unwrap(res.data, t('Passkey 操作失败'))
}

function proofToken(data: { proof_token?: string } | undefined): string {
  if (!data?.proof_token) throw new Error(t('验证失败'))
  return data.proof_token
}

/** A short-lived proof for a sensitive change from an authenticator code (POST /api/verify). */
export async function proofByCode(scope: ProofScope, code: string): Promise<string> {
  const res = await api.post<ApiEnvelope<{ proof_token?: string }>>('/api/verify', { method: '2fa', code, scope })
  return proofToken(unwrap(res.data, t('验证失败')))
}

/** …or from this device's passkey. */
export async function proofByPasskey(scope: ProofScope): Promise<string> {
  const begin = await api.post<ApiEnvelope<Challenge>>('/api/user/passkey/verify/begin', { scope })
  const challenge = unwrap(begin.data, t('验证失败'))
  if (!challenge?.flow_token) throw new Error(t('验证失败'))
  const credential = await navigator.credentials.get({ publicKey: requestOptions(challenge.options ?? challenge) })
  if (!credential) throw new DOMException('cancelled', 'NotAllowedError')
  const finish = await api.post<ApiEnvelope<{ proof_token?: string }>>('/api/user/passkey/verify/finish', {
    flow_token: challenge.flow_token,
    credential: assertionResult(credential as PublicKeyCredential),
  })
  return proofToken(unwrap(finish.data, t('验证失败')))
}

/** Creates a passkey on this device; with two-step on, the server wants a proof first. */
export async function registerPasskey(proof?: string): Promise<void> {
  const begin = await api.post<ApiEnvelope<Challenge>>('/api/user/passkey/register/begin', undefined, { headers: proofHeaders(proof) })
  const challenge = unwrap(begin.data, t('Passkey 操作失败'))
  if (!challenge?.flow_token) throw new Error(t('Passkey 操作失败'))
  const credential = await navigator.credentials.create({ publicKey: creationOptions(challenge.options ?? challenge) })
  if (!credential) throw new DOMException('cancelled', 'NotAllowedError')
  const finish = await api.post<ApiEnvelope<unknown>>(
    '/api/user/passkey/register/finish',
    { flow_token: challenge.flow_token, credential: registrationResult(credential as PublicKeyCredential) },
    { headers: proofHeaders(proof) }
  )
  applyRotation(unwrap(finish.data, t('Passkey 操作失败')))
}

export async function removePasskey(proof: string): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>('/api/user/passkey', { headers: proofHeaders(proof) })
  applyRotation(unwrap(res.data, t('Passkey 操作失败')))
}
