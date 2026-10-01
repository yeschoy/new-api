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
import { api, type ApiEnvelope } from './api'

type EncryptionKey = { kid: string; public_key: string }

export type EncryptedPassword = {
  password_encrypted: string
  encryption_key_id: string
}

const KEY_CACHE_TTL_MS = 5 * 60_000
let cachedKey: EncryptionKey | null = null
let cachedAt = 0

export function clearPasswordEncryptionCache() {
  cachedKey = null
  cachedAt = 0
}

async function getKey(): Promise<EncryptionKey> {
  if (cachedKey && Date.now() - cachedAt < KEY_CACHE_TTL_MS) return cachedKey
  const res = await api.get<ApiEnvelope<EncryptionKey>>(
    '/api/user/login/encryption-key'
  )
  const key = res.data?.data
  if (!res.data?.success || !key?.kid || !key.public_key) {
    throw new Error('Password encryption key is unavailable')
  }
  cachedKey = key
  cachedAt = Date.now()
  return key
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replaceAll(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function rsaOaepEncrypt(text: string, pem: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'spki',
        pemToDer(pem),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      )
      const cipher = await globalThis.crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        key,
        new TextEncoder().encode(text)
      )
      return toBase64(cipher)
    } catch {
      // Fall through to forge for runtimes without RSA-OAEP support.
    }
  }
  // Web Crypto is limited to secure contexts; plain-HTTP intranets use forge.
  const forge = (await import('node-forge')).default
  const publicKey = forge.pki.publicKeyFromPem(pem)
  const cipher = publicKey.encrypt(forge.util.encodeUtf8(text), 'RSA-OAEP', {
    md: forge.md.sha256.create(),
  })
  return forge.util.encode64(cipher)
}

export async function encryptPassword(
  password: string
): Promise<EncryptedPassword> {
  try {
    const key = await getKey()
    return {
      password_encrypted: await rsaOaepEncrypt(password, key.public_key),
      encryption_key_id: key.kid,
    }
  } catch (error) {
    clearPasswordEncryptionCache()
    throw error
  }
}
