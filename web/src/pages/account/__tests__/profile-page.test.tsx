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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getLang, setLang } from '@/i18n/i18n'
import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'
import { ProfilePage } from '@/pages/console/profile-page'

import { USER, ok, renderAccountPage, signIn } from './render-account'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const SETTING = JSON.stringify({ notify_type: 'email', quota_warning_threshold: 500_000 })

function responses(user: Record<string, unknown>, status: Record<string, unknown> = {}) {
  return { '/api/status': { quota_per_unit: 500_000, ...status }, '/api/user/self': user }
}

beforeEach(() => signIn())

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  await setLang('zh')
  window.localStorage.clear()
})

describe('ProfilePage', () => {
  it('shows the balance, usage and requests at the top', async () => {
    renderAccountPage(<ProfilePage />, responses({ ...USER, setting: SETTING }))

    expect(await screen.findByText('$10')).toBeInTheDocument()
    expect(screen.getByText('$2')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('binds an email with the code sent to it', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    const get = renderAccountPage(<ProfilePage />, responses({ ...USER, email: '', setting: SETTING }))

    await user.click(await screen.findByRole('button', { name: '绑定邮箱' }))
    const dialog = screen.getByRole('dialog', { name: '绑定邮箱' })
    await user.type(within(dialog).getByLabelText('邮箱'), 'new@example.com')
    await user.click(within(dialog).getByRole('button', { name: '发送验证码' }))
    await user.type(within(dialog).getByLabelText('验证码'), '246810')
    await user.click(within(dialog).getByRole('button', { name: '绑定' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/oauth/email/bind', { email: 'new@example.com', code: '246810' }))
    expect(get).toHaveBeenCalledWith('/api/verification', { params: { email: 'new@example.com' } })
  })

  it('saves the notification method with the alert threshold in quota units', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<ProfilePage />, responses({ ...USER, setting: SETTING }))

    const threshold = await screen.findByLabelText('余额预警阈值')
    expect(threshold).toHaveValue('1')
    await user.click(screen.getByRole('radio', { name: 'Webhook' }))
    await user.type(screen.getByLabelText('Webhook 地址'), 'https://hook.example.com/notify')
    await user.clear(threshold)
    await user.type(threshold, '2')
    await user.click(screen.getByRole('button', { name: '保存通知设置' }))

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/api/user/setting',
        expect.objectContaining({ notify_type: 'webhook', webhook_url: 'https://hook.example.com/notify', quota_warning_threshold: 1_000_000 })
      )
    )
  })

  it('saves the interface language to the account and switches to it', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<ProfilePage />, responses({ ...USER, setting: SETTING }))

    await user.selectOptions(await screen.findByRole('combobox', { name: '界面语言' }), 'en')

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/user/self', { language: 'en' }))
    expect(getLang()).toBe('en')
  })

  it('hides a menu page and saves the menu', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<ProfilePage />, responses({ ...USER, setting: SETTING }))

    await user.click(await screen.findByRole('switch', { name: '使用记录' }))
    await user.click(screen.getByRole('button', { name: '保存菜单' }))

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/user/self', { sidebar_modules: expect.any(String) }))
    const saved = JSON.parse((put.mock.calls[0][1] as { sidebar_modules: string }).sidebar_modules)
    expect(saved.console.log).toBe(false)
    expect(saved.console.token).toBe(true)
  })

  it('checks in for the day', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ quota_awarded: 2_500, checkin_date: '2026-10-08' }))
    const user = userEvent.setup()
    renderAccountPage(<ProfilePage />, {
      ...responses({ ...USER, setting: SETTING }, { checkin_enabled: true }),
      '/api/user/checkin': {
        enabled: true,
        min_quota: 1_000,
        max_quota: 5_000,
        stats: { checked_in_today: false, total_checkins: 3, total_quota: 9_000, checkin_count: 1, records: [{ checkin_date: '2026-10-01', quota_awarded: 3_000 }] },
      },
    })

    expect(await screen.findByText('每天签到可随机获得 $0.002 – $0.01，直接计入余额。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '立即签到' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/user/checkin', undefined, { params: {} }))
  })
})
