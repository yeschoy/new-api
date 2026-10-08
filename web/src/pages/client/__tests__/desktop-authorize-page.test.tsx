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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { DesktopAuthorizePage } from '../desktop-authorize-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const DECISION_URL = '/api/desktop/v2/device-authorizations/decision'

function signIn() {
  authStore.applyBundle({
    user: { id: 7, username: 'alice', role: 1 },
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

/** The error axios throws for a non-2xx answer from the decision endpoint. */
function httpError(status: number, code: string) {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
    data: { success: false, code, message: '' },
  } as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response)
}

function renderPage(path: string) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  const router = createMemoryRouter([{ path: '*', element: <DesktopAuthorizePage /> }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(signIn)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('desktop authorization page', () => {
  it('shows the code from the app link in a clean form', () => {
    renderPage('/desktop-authorize?user_code=%20abcd-efgh%20')
    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument()
  })

  it('approves the connection and confirms it', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, data: { status: 'approved' } } })
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    await user.click(screen.getByRole('button', { name: '连接这台电脑' }))

    expect(post).toHaveBeenCalledWith(DECISION_URL, { user_code: 'ABCD-EFGH', decision: 'approve' })
    expect(await screen.findByRole('heading', { name: '已同意连接' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '连接这台电脑' })).toBeNull()
  })

  it('declines the connection and says nothing was granted', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, data: { status: 'denied' } } })
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    await user.click(screen.getByRole('button', { name: '暂不连接' }))

    expect(post).toHaveBeenCalledWith(DECISION_URL, { user_code: 'ABCD-EFGH', decision: 'deny' })
    expect(await screen.findByRole('heading', { name: '已拒绝连接' })).toBeInTheDocument()
    expect(screen.getByText('没有授予任何访问权限，可以关闭此页面。')).toBeInTheDocument()
  })

  it('locks both buttons while the answer is on its way', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'post').mockReturnValue(new Promise(() => undefined))
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    await user.click(screen.getByRole('button', { name: '连接这台电脑' }))

    expect(screen.getByRole('button', { name: '正在连接…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '暂不连接' })).toBeDisabled()
  })

  it('tells the visitor to start again when the request has expired', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue(httpError(400, 'expired_token'))
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    await user.click(screen.getByRole('button', { name: '连接这台电脑' }))

    expect(await screen.findByText('这次连接请求已经过期')).toBeInTheDocument()
    expect(screen.getByText('请回到桌面助手，重新发起连接。')).toBeInTheDocument()
  })

  it('reports a failed answer without claiming access was given', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue(httpError(503, 'server_error'))
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    await user.click(screen.getByRole('button', { name: '连接这台电脑' }))

    expect(await screen.findByText('暂时无法确认连接')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '已同意连接' })).toBeNull()
    expect(screen.getByRole('button', { name: '连接这台电脑' })).toBeEnabled()
  })

  it('asks to reopen the page from the app when the link has no code', () => {
    const post = vi.spyOn(api, 'post')
    renderPage('/desktop-authorize')

    expect(screen.getByText('缺少连接验证码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '连接这台电脑' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '暂不连接' })).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('asks a signed-out visitor to sign in and come back to the same link', () => {
    authStore.clear()
    renderPage('/desktop-authorize?user_code=ABCD-EFGH')

    expect(screen.getByRole('heading', { name: '登录后即可使用' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute(
      'href',
      `/sign-in?redirect=${encodeURIComponent('/desktop-authorize?user_code=ABCD-EFGH')}`
    )
    expect(screen.queryByRole('button', { name: '连接这台电脑' })).toBeNull()
  })
})
