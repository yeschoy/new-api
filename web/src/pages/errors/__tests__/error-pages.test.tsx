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
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { ForbiddenPage, MaintenancePage, ServerErrorPage, UnauthorizedPage } from '../error-pages'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

function renderAt(element: React.ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/earlier', element: <p>earlier page</p> },
      { path: '/error', element },
    ],
    { initialEntries: ['/earlier', '/error'], initialIndex: 1 }
  )
  return render(<RouterProvider router={router} />)
}

function httpError(status: number) {
  const response = { status, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig, data: {} } as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response)
}

afterEach(cleanup)

describe('error pages', () => {
  it('401 asks for the right account and goes back to the page before', async () => {
    const user = userEvent.setup()
    renderAt(<UnauthorizedPage />)

    expect(screen.getByRole('heading', { name: '未经授权的访问' })).toBeInTheDocument()
    expect(screen.getByText('401')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/')

    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(await screen.findByText('earlier page')).toBeInTheDocument()
  })

  it('403 says the visitor has no permission for the page', () => {
    renderAt(<ForbiddenPage />)

    expect(screen.getByRole('heading', { name: '禁止访问' })).toBeInTheDocument()
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByText('你没有打开这个页面的权限。')).toBeInTheDocument()
  })

  it('500 apologises and points to the issue tracker', () => {
    renderAt(<ServerErrorPage />)

    expect(screen.getByRole('heading', { name: '糟糕！出错了' })).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    const report = screen.getByRole('link', { name: '反馈问题' })
    expect(report).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api/issues')
    expect(report).toHaveAttribute('target', '_blank')
  })

  it('the server error page explains a rate limit when the request got a 429', () => {
    renderAt(<ServerErrorPage error={httpError(429)} />)

    expect(screen.getByRole('heading', { name: '请求过于频繁' })).toBeInTheDocument()
    expect(screen.getByText('429')).toBeInTheDocument()
    expect(screen.getByText('请稍等片刻再试。')).toBeInTheDocument()
  })

  it('the server error page shows the status of another failed request', () => {
    renderAt(<ServerErrorPage error={httpError(502)} />)

    expect(screen.getByRole('heading', { name: '糟糕！出错了' })).toBeInTheDocument()
    expect(screen.getByText('502')).toBeInTheDocument()
  })

  it('503 says the site is under maintenance and offers nothing to click', () => {
    renderAt(<MaintenancePage />)

    expect(screen.getByRole('heading', { name: '网站正在维护中' })).toBeInTheDocument()
    expect(screen.getByText('503')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
