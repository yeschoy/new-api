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
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { ThemeProvider } from '@/site/theme'

import { ClientPage } from '../client-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const WINDOWS_INSTALLER = 'https://ergou.qzz.io/releases/official/yeschoy-windows-x86_64-installer.exe'
const MAC_INSTALLER = 'https://ergou.qzz.io/releases/official/yeschoy-macos-universal-installer.dmg'

function setBrowser(userAgent: string, platform: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
}

function renderPage() {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  const router = createMemoryRouter([{ path: '*', element: <ClientPage /> }], { initialEntries: ['/client'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  Reflect.deleteProperty(window.navigator, 'userAgent')
  Reflect.deleteProperty(window.navigator, 'platform')
  window.localStorage.clear()
})

describe('client download page', () => {
  it('starts the Windows installer from the main button on a Windows computer', () => {
    setBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')
    renderPage()
    expect(screen.getByRole('link', { name: '下载 Windows 版' })).toHaveAttribute('href', WINDOWS_INSTALLER)
  })

  it('starts the Mac installer from the main button on a Mac', () => {
    setBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', 'MacIntel')
    renderPage()
    expect(screen.getByRole('link', { name: '下载 macOS 版' })).toHaveAttribute('href', MAC_INSTALLER)
  })

  it('lists both installers whatever the computer', () => {
    setBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')
    renderPage()
    expect(screen.getByRole('link', { name: /Windows 安装程序.*Windows 10 或更高版本.*x86_64/ })).toHaveAttribute('href', WINDOWS_INSTALLER)
    expect(screen.getByRole('link', { name: /macOS 通用版 DMG.*Intel 与 Apple 芯片/ })).toHaveAttribute('href', MAC_INSTALLER)
  })

  it('sends a system without an installer to the download choices with a note', async () => {
    const user = userEvent.setup()
    setBrowser('Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64')
    renderPage()

    const main = screen.getByRole('link', { name: '下载桌面客户端' })
    expect(main).toHaveAttribute('href', '#manual-downloads')
    await user.click(main)

    expect(screen.getByRole('status')).toHaveTextContent('无法识别受支持的桌面系统，请在下方选择 Windows 或 macOS 版本。')
    expect(screen.getByRole('heading', { name: '选择下载版本' })).toHaveFocus()
  })

  it('shows the light screenshot first by day and the dark one under the theme section', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0))
    setBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')
    renderPage()

    const shots = screen.getAllByRole('img').map((image) => image.getAttribute('src'))
    expect(shots).toEqual([
      '/client/yecai-client-apps-light-showcase.webp',
      '/client/yecai-client-app-connection-showcase.webp',
      '/client/yecai-client-model-pricing-showcase.webp',
      '/client/yecai-client-apps-dark-showcase.webp',
    ])
    expect(screen.getByRole('img', { name: '野菜客户端浅色主题下的“我的应用”总览' })).toBeInTheDocument()
  })

  it('shows the dark screenshot first at night', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 1, 22, 0))
    setBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32')
    renderPage()

    const shots = screen.getAllByRole('img').map((image) => image.getAttribute('src'))
    expect(shots[0]).toBe('/client/yecai-client-apps-dark-showcase.webp')
    expect(shots[3]).toBe('/client/yecai-client-apps-light-showcase.webp')
    expect(screen.getByText('浅色 · 主题')).toBeInTheDocument()
  })
})
