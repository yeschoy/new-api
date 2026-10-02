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

/**
 * WebAuthn plumbing for passkeys: the server sends options with base64url
 * strings where the browser wants ArrayBuffers, and wants base64url back.
 */
type Json = Record<string, unknown>

export function base64UrlToBuffer(value: unknown): ArrayBuffer {
  if (typeof value !== 'string' || !value) return new ArrayBuffer(0)
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

export function bufferToBase64Url(buffer: ArrayBuffer | ArrayBufferLike | null | undefined): string {
  if (!buffer) return ''
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** go-webauthn wraps the options as { publicKey: … }. */
function unwrapOptions(payload: unknown): Json {
  const record = (payload ?? {}) as Json
  const options = (record.publicKey ?? record.PublicKey ?? record.response ?? record.Response) as Json | undefined
  if (!options) throw new Error(t('Passkey 操作失败'))
  return options
}

function withIds(list: unknown): Json[] | undefined {
  if (!Array.isArray(list)) return undefined
  return list.map((item: Json) => ({ ...item, id: base64UrlToBuffer(item.id) }))
}

export function creationOptions(payload: unknown): PublicKeyCredentialCreationOptions {
  const options = unwrapOptions(payload)
  const user = (options.user ?? {}) as Json
  const publicKey: Json = { ...options, challenge: base64UrlToBuffer(options.challenge), user: { ...user, id: base64UrlToBuffer(user.id) } }
  const exclude = withIds(options.excludeCredentials)
  if (exclude) publicKey.excludeCredentials = exclude
  if (Array.isArray(options.attestationFormats) && options.attestationFormats.length === 0) delete publicKey.attestationFormats
  return publicKey as unknown as PublicKeyCredentialCreationOptions
}

export function requestOptions(payload: unknown): PublicKeyCredentialRequestOptions {
  const options = unwrapOptions(payload)
  const publicKey: Json = { ...options, challenge: base64UrlToBuffer(options.challenge) }
  const allow = withIds(options.allowCredentials)
  if (allow) publicKey.allowCredentials = allow
  return publicKey as unknown as PublicKeyCredentialRequestOptions
}

export function registrationResult(credential: PublicKeyCredential): Json {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  }
}

export function assertionResult(credential: PublicKeyCredential): Json {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  }
}

type CredentialApi = {
  isConditionalMediationAvailable?: () => Promise<boolean>
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>
}

/** Whether this browser and device can use a passkey. */
export async function passkeySupported(): Promise<boolean> {
  const credentialApi = (globalThis as unknown as { PublicKeyCredential?: CredentialApi }).PublicKeyCredential
  if (!credentialApi || !navigator.credentials) return false
  try {
    if (await credentialApi.isConditionalMediationAvailable?.()) return true
  } catch {
    // Fall through to the platform check.
  }
  if (typeof credentialApi.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return true
  try {
    return await credentialApi.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** The browser's "user cancelled or timed out" answer. */
export function isPasskeyCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}
