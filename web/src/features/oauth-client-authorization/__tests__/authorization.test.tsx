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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { oauthAuthorizationSearchSchema } from '@/routes/_authenticated/oauth/authorize/'
import { useAuthStore } from '@/stores/auth-store'

import { OAuthClientAuthorization } from '..'
import {
  decideOAuthAuthorization,
  getOAuthAuthorizationRequest,
  validateOAuthLoopbackRedirect,
} from '../api'

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    getOAuthAuthorizationRequest: vi.fn(),
    decideOAuthAuthorization: vi.fn(),
  }
})

const getRequestMock = vi.mocked(getOAuthAuthorizationRequest)
const decideMock = vi.mocked(decideOAuthAuthorization)
const queryClients: QueryClient[] = []

function renderAuthorization() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClients.push(queryClient)
  return render(
    <QueryClientProvider client={queryClient}>
      <OAuthClientAuthorization requestToken='request-token' />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  getRequestMock.mockReset()
  decideMock.mockReset()
  useAuthStore.getState().auth.setUser({
    id: 42,
    username: 'oauth-user',
    display_name: 'OAuth User',
    role: 1,
  })
})

afterEach(() => {
  for (const queryClient of queryClients) queryClient.clear()
  queryClients.length = 0
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('OAuthClientAuthorization', () => {
  it('shows the current account and the complete requested scope bundle', async () => {
    getRequestMock.mockResolvedValue({
      client_id: 'yeschoy-desktop',
      client_name: '野菜API Desktop',
      scopes: ['profile', 'offline_access', 'sessions'],
      expires_at: '2026-09-08T01:00:00Z',
    })

    renderAuthorization()

    expect(
      await screen.findByText(
        (_, node) =>
          node?.textContent ===
          '野菜API Desktop is requesting access to your New API account.'
      )
    ).toBeVisible()
    expect(screen.getByText('OAuth User')).toBeVisible()
    expect(screen.getByText('Read your basic account profile')).toBeVisible()
    expect(screen.getByText('Keep this client signed in')).toBeVisible()
    expect(
      screen.getByText("View and revoke this client's authorized devices")
    ).toBeVisible()
    expect(
      screen.getByText(
        'Authorization does not reveal your password or API key.'
      )
    ).toBeVisible()
    expect(
      screen.queryByText(/read and manage your API keys/i)
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Do not authorize' })
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Authorize' })).toBeEnabled()
  })

  it('submits one whole-bundle decision and disables both actions', async () => {
    getRequestMock.mockResolvedValue({
      client_id: 'yeschoy-desktop',
      client_name: '野菜API Desktop',
      scopes: ['profile'],
      expires_at: '2026-09-08T01:00:00Z',
    })
    decideMock.mockReturnValue(new Promise(() => undefined))
    const user = userEvent.setup()
    renderAuthorization()

    await user.click(await screen.findByRole('button', { name: 'Authorize' }))

    expect(decideMock).toHaveBeenCalledTimes(1)
    expect(decideMock).toHaveBeenCalledWith('request-token', 'approve')
    expect(
      screen.getByRole('button', { name: 'Authorizing...' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Do not authorize' })
    ).toBeDisabled()
  })

  it('fails closed when the server returns a non-loopback redirect', async () => {
    getRequestMock.mockResolvedValue({
      client_id: 'yeschoy-desktop',
      client_name: '野菜API Desktop',
      scopes: ['profile'],
      expires_at: '2026-09-08T01:00:00Z',
    })
    decideMock.mockResolvedValue({
      redirect_to: 'https://attacker.example/oauth/callback?code=x&state=y',
    })
    const user = userEvent.setup()
    renderAuthorization()

    await user.click(await screen.findByRole('button', { name: 'Authorize' }))

    expect(
      await screen.findByText('Could not return to the desktop app')
    ).toBeVisible()
  })

  it('navigates an approved loopback result without a referrer', async () => {
    getRequestMock.mockResolvedValue({
      client_id: 'yeschoy-desktop',
      client_name: '野菜API Desktop',
      scopes: ['profile'],
      expires_at: '2026-09-08T01:00:00Z',
    })
    decideMock.mockResolvedValue({
      redirect_to:
        'http://127.0.0.1:49182/oauth/callback?code=auth-code&state=client-state',
    })
    let clickedHref = ''
    let clickedReferrerPolicy = ''
    let clickedRel = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        clickedHref = this.href
        clickedReferrerPolicy = this.referrerPolicy
        clickedRel = this.rel
      }
    )
    const user = userEvent.setup()
    renderAuthorization()

    await user.click(await screen.findByRole('button', { name: 'Authorize' }))

    await waitFor(() => expect(clickedHref).not.toBe(''))
    expect(clickedHref).toBe(
      'http://127.0.0.1:49182/oauth/callback?code=auth-code&state=client-state'
    )
    expect(clickedReferrerPolicy).toBe('no-referrer')
    expect(clickedRel).toBe('noreferrer')
  })

  it('shows an unavailable state when the request cannot be loaded', async () => {
    getRequestMock.mockRejectedValue(new Error('expired'))
    renderAuthorization()

    expect(
      await screen.findByText('This authorization request is unavailable')
    ).toBeVisible()
  })
})

describe('validateOAuthLoopbackRedirect', () => {
  it('accepts only one exact IPv4 loopback callback result', () => {
    expect(
      validateOAuthLoopbackRedirect(
        'http://127.0.0.1:49182/oauth/callback?code=auth-code&state=client-state'
      )
    ).toBe(
      'http://127.0.0.1:49182/oauth/callback?code=auth-code&state=client-state'
    )
    expect(
      validateOAuthLoopbackRedirect(
        'http://127.0.0.1:49182/oauth/callback?error=access_denied&state=client-state'
      )
    ).toBe(
      'http://127.0.0.1:49182/oauth/callback?error=access_denied&state=client-state'
    )
    for (const value of [
      'https://attacker.example/oauth/callback?code=x&state=y',
      'http://localhost:49182/oauth/callback?code=x&state=y',
      'http://127.0.0.1:0/oauth/callback?code=x&state=y',
      'http://127.0.0.1:49182/oauth/callback?code=x&code=z&state=y',
      'http://127.0.0.1:49182/oauth/callback?code=x',
      'http://127.0.0.1:49182/oauth/callback?code=x&error=access_denied&state=y',
    ]) {
      expect(validateOAuthLoopbackRedirect(value)).toBeNull()
    }
  })
})

describe('OAuth authorization route search', () => {
  it('requires one non-empty request token', () => {
    expect(
      oauthAuthorizationSearchSchema.parse({ request: 'request-token' })
    ).toEqual({ request: 'request-token' })
    expect(() =>
      oauthAuthorizationSearchSchema.parse({ request: '' })
    ).toThrow()
    expect(() => oauthAuthorizationSearchSchema.parse({})).toThrow()
  })
})
