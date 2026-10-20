import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  interface Window {
    YeschoyConnect: {
      normalizeIssueReasonCode: (reason: string, status?: number) => string
      ensureAccessToken: (options?: {
        fetchImpl?: typeof fetch
      }) => Promise<string>
      open: (options?: {
        fetchImpl?: typeof fetch
        origin?: string
        issuePath?: string
        downloadUrl?: string
        missingAppTimeoutMs?: number
      }) => Promise<void>
    }
  }
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

function loadConnectScript() {
  const script = readFileSync(join(repoRoot, 'public/connect.js'), 'utf8')
  // connect.js is a browser IIFE; eval mirrors how /desktop/connect loads it.
  // Re-eval in beforeEach so the in-memory access-token cache starts empty.
  // eslint-disable-next-line no-eval
  eval(script)
}

beforeEach(() => {
  loadConnectScript()
})

describe('YeschoyConnect.normalizeIssueReasonCode', () => {
  it('maps AUTH_UNAUTHORIZED to session_required', () => {
    expect(
      window.YeschoyConnect.normalizeIssueReasonCode('AUTH_UNAUTHORIZED', 401)
    ).toBe('session_required')
  })

  it('maps bare 401 to session_required', () => {
    expect(window.YeschoyConnect.normalizeIssueReasonCode('', 401)).toBe(
      'session_required'
    )
  })

  it('keeps unrelated errors', () => {
    expect(
      window.YeschoyConnect.normalizeIssueReasonCode('issue_failed', 503)
    ).toBe('issue_failed')
  })
})

describe('YeschoyConnect.ensureAccessToken', () => {
  it('POSTs /api/user/auth/refresh and returns the access token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/user/auth/refresh')
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            access_token: 'access-from-refresh',
            access_expires_at: Math.floor(Date.now() / 1000) + 600,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await expect(
      window.YeschoyConnect.ensureAccessToken({ fetchImpl })
    ).resolves.toBe('access-from-refresh')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps refresh 401 AUTH_UNAUTHORIZED to session_required', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({ success: false, code: 'AUTH_UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await expect(
      window.YeschoyConnect.ensureAccessToken({ fetchImpl })
    ).rejects.toMatchObject({
      reasonCode: 'session_required',
      httpStatus: 401,
    })
  })
})

describe('YeschoyConnect.open auth', () => {
  it('refreshes then issues connect-codes with Bearer', async () => {
    const calls: Array<{ url: string; auth?: string | null }> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({ url, auth: headers.get('Authorization') })
      if (url === '/api/user/auth/refresh') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              access_token: 'bearer-token',
              access_expires_at: Math.floor(Date.now() / 1000) + 600,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (url === '/api/desktop/v2/connect-codes') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              code: 'c'.repeat(48),
              origin: 'https://station.example',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch

    const hrefBefore = window.location.href
    await window.YeschoyConnect.open({
      fetchImpl,
      origin: 'https://station.example',
      missingAppTimeoutMs: 60_000,
      downloadUrl: 'https://yeschoy.com/download',
    })

    expect(calls).toEqual([
      { url: '/api/user/auth/refresh', auth: null },
      {
        url: '/api/desktop/v2/connect-codes',
        auth: 'Bearer bearer-token',
      },
    ])
    // jsdom cannot navigate to custom schemes; auth call order is the contract.
    void hrefBefore
  })
})
