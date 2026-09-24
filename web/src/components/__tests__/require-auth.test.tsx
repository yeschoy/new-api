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
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { authStore } from '@/lib/auth-store'

import { RequireAuth } from '../require-auth'

function CurrentPath() {
  return <div data-testid='path'>{useLocation().pathname}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path='*'
            element={
              <>
                <CurrentPath />
                <RequireAuth>
                  <div>secret console</div>
                </RequireAuth>
              </>
            }
          />
        </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  afterEach(() => {
    cleanup()
    authStore.clear()
  })

  it('keeps an anonymous visitor on the page and offers sign-in and sign-up links', () => {
    authStore.clear()
    renderAt('/settings/keys')

    expect(screen.getByTestId('path')).toHaveTextContent('/settings/keys')
    expect(screen.queryByText('secret console')).toBeNull()
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute(
      'href',
      '/sign-in?redirect=%2Fsettings%2Fkeys'
    )
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute(
      'href',
      '/sign-up?redirect=%2Fsettings%2Fkeys'
    )
  })

  it('renders the protected content for a signed-in visitor', () => {
    authStore.applyBundle({
      user: { id: 1, username: 'demo', role: 1 },
      access_token: 'token',
      token_type: 'Bearer',
      access_expires_at: Date.now() / 1000 + 60,
      session: { sid: 's', current: true, login_method: 'password', expires_at: 0 },
    })
    renderAt('/settings/keys')

    expect(screen.getByText('secret console')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '登录' })).toBeNull()
  })
})
