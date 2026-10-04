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
import { readFileSync } from 'node:fs'

import { QueryClient } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { ProductActivityPage } from '@/features/product-activity'
import zh from '@/i18n/locales/zh.json'
import { THEME_STORAGE_KEYS } from '@/lib/theme-storage'
import { Route } from '@/routes/activity'
import { useAuthStore } from '@/stores/auth-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'
import { renderApp } from '@/test-utils/render-app'

const originalAuth = useAuthStore.getState()
let client: QueryClient
beforeEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEYS.mode)
  useAuthStore.getState().auth.reset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
})
afterEach(async () => {
  client.clear()
  localStorage.removeItem(THEME_STORAGE_KEYS.mode)
  useAuthStore.setState(originalAuth)
  await act(() => i18next.changeLanguage('en'))
})

describe('public product activity', () => {
  it('shows two named cards without unverified entitlements and routes guest actions to sign-up', async () => {
    expect(Route.options.component).toBe(ProductActivityPage)
    await renderApp(<ProductActivityPage />, client)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(
      within(cards[0]).getByRole('heading', { name: 'DeepSeek Power Card' })
    ).toBeVisible()
    expect(
      within(cards[1]).getByRole('heading', { name: 'GPT Power Card' })
    ).toBeVisible()
    for (const card of cards) {
      expect(
        within(card).getByRole('link', { name: 'Sign up to explore plans' })
      ).toHaveAttribute('href', '/sign-up')
    }
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Offers' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      within(nav).queryByRole('link', { name: 'Models' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /home$/i })).not.toHaveAttribute(
      'aria-current'
    )
    expect(document.body.textContent).not.toMatch(/unlimited|¥\d|\d+ hours/i)
  })

  it('routes signed-in card actions to wallet and remains keyboard accessible', async () => {
    useAuthStore.getState().auth.setBundle(createTestAuthBundle())
    await renderApp(<ProductActivityPage />, client)
    const links = screen.getAllByRole('link', { name: 'View plans in wallet' })
    expect(links).toHaveLength(2)
    links[0].focus()
    expect(links[0]).toHaveFocus()
    expect(links[0]).toHaveAttribute('href', '/wallet')
    expect(links[1]).toHaveAttribute('href', '/wallet')
  })

  it('keeps narrow-screen cards stacked and the mobile navigation toggle operable', async () => {
    const user = userEvent.setup()
    await renderApp(<ProductActivityPage />, client)
    const menu = screen.getByRole('button', { name: 'Open navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    await user.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(readFileSync('src/styles/activity-landing.css', 'utf8')).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*?\.activity-details\s*\{\s*grid-template-columns: 1fr;/
    )
  })

  it('supports light and dark themes and visible focus on card actions', async () => {
    const user = userEvent.setup()
    const { container } = await renderApp(
      <ThemeProvider defaultTheme='light'>
        <ProductActivityPage />
      </ThemeProvider>,
      client
    )
    expect(container.querySelector('.activity-landing')).toHaveAttribute(
      'data-theme',
      'light'
    )
    await user.click(
      screen.getByRole('button', { name: 'Switch to dark theme' })
    )
    expect(container.querySelector('.activity-landing')).toHaveAttribute(
      'data-theme',
      'dark'
    )
    const action = screen.getAllByRole('link', {
      name: 'Sign up to explore plans',
    })[0]
    action.focus()
    expect(action).toHaveFocus()
    expect(readFileSync('src/styles/activity-landing.css', 'utf8')).toMatch(
      /\.activity-card__link:focus-visible\s*\{[^}]*outline:/
    )
  })

  it('provides the card headings and calls to action in all seven locales', () => {
    for (const locale of ['en', 'zh', 'zh-TW', 'fr', 'ru', 'ja', 'vi']) {
      const translations = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
      ).translation as Record<string, string>
      for (const key of [
        'DeepSeek Power Card',
        'GPT Power Card',
        'Sign up to explore plans',
        'View plans in wallet',
      ]) {
        expect(translations[key], `${locale}: ${key}`).toBeTruthy()
        if (locale !== 'en') expect(translations[key]).not.toBe(key)
      }
      if (['fr', 'ru', 'vi'].includes(locale)) {
        expect(translations['DeepSeek Power Card']).toContain('Power')
        expect(translations['GPT Power Card']).toContain('Power')
      }
    }
  })

  it('updates card headings and action labels when the language changes', async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await renderApp(<ProductActivityPage />, client)
    await act(() => i18next.changeLanguage('zhCN'))
    expect(
      screen.getByRole('heading', { name: 'DeepSeek 狂蹬卡' })
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'GPT 狂蹬卡' })).toBeVisible()
    expect(
      screen.getAllByRole('link', { name: '注册后查看套餐' })
    ).toHaveLength(2)
  })
})
