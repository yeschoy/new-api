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
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'
import { renderApp } from '@/test-utils/render-app'

import { buildModelCatalog } from '../../lib/catalog'
import { LandingPage } from '../landing-page'

let client: QueryClient
let style: HTMLStyleElement
const originalConfig = useSystemConfigStore.getState()
const originalAuth = useAuthStore.getState()
beforeEach(() => {
  useAuthStore.getState().auth.reset()
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
  style = document.createElement('style')
  document.head.append(style)
})
afterEach(() => {
  useSystemConfigStore.setState(originalConfig)
  useAuthStore.setState(originalAuth)
  client.clear()
  style.remove()
})
const models = buildModelCatalog(
  [
    {
      id: 1,
      model_name: 'test-model',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 2,
      enable_groups: ['default'],
      group_ratio: { default: 1 },
    },
  ],
  1
)

describe('landing interactions and price layout', () => {
  it('keeps one community action in the header that reads as the accent action', async () => {
    await renderApp(
      <LandingPage
        isAuthenticated={false}
        models={models}
        maxSavingsPercent={0}
      />,
      client
    )

    const header = screen.getByRole('banner')
    const community = within(header).getAllByRole('button', {
      name: 'Community',
    })
    expect(community).toHaveLength(1)
    expect(community[0]).toBeVisible()
    expect(community[0]).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(within(header).getByRole('link', { name: '野菜 home' })).toHaveAttribute(
      'href',
      '/#top'
    )
  })

  it('shows the signed-in account menu and overview entry instead of sign-in links', async () => {
    const user = userEvent.setup()
    const bundle = createTestAuthBundle()
    useAuthStore.getState().auth.setBundle({
      ...bundle,
      user: { ...bundle.user, display_name: 'Demo User' },
    })
    await renderApp(
      <LandingPage isAuthenticated models={models} maxSavingsPercent={0} />,
      client
    )
    const header = screen.getByRole('banner')
    expect(
      within(header).getByRole('button', { name: 'Community' })
    ).toBeVisible()
    expect(
      within(header).queryByRole('link', { name: 'Sign in' })
    ).not.toBeInTheDocument()
    expect(
      within(header).queryByRole('link', { name: 'Start saving' })
    ).not.toBeInTheDocument()
    for (const link of within(header).getAllByRole('link', {
      name: 'Overview',
    })) {
      expect(link).toHaveAttribute('href', '/dashboard')
    }
    const avatar = within(header).getByRole('button', { name: 'Profile' })
    await user.click(avatar)
    expect(await screen.findByText('Demo User')).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Wallet' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await user.keyboard('{Escape}')
    await user.click(
      within(header).getByRole('button', { name: 'Open navigation' })
    )
    const navigation = within(header).getByRole('navigation', {
      name: 'Main navigation',
    })
    expect(
      within(navigation).queryByRole('link', { name: 'Sign in' })
    ).not.toBeInTheDocument()
    expect(
      within(navigation).getByRole('link', { name: 'Overview' })
    ).toHaveAttribute('href', '/dashboard')
  })

  it.each([
    [false, '/sign-up'],
    [true, '/dashboard'],
  ])(
    'keeps the hero client action beside the auth-aware primary action (authenticated=%s)',
    async (isAuthenticated, primaryHref) => {
      if (isAuthenticated) {
        useAuthStore.getState().auth.setBundle(createTestAuthBundle())
      }
      await renderApp(
        <LandingPage
          isAuthenticated={isAuthenticated}
          models={models}
          maxSavingsPercent={0}
        />,
        client
      )
      const hero = screen.getByRole('heading', { level: 1 }).closest('section')
      if (!hero) throw new Error('Missing hero')
      expect(
        within(hero).getByRole('link', { name: 'Start saving' })
      ).toHaveAttribute('href', primaryHref)
      expect(
        within(hero).getByRole('link', { name: 'Client' })
      ).toHaveAttribute('href', '/client')
    }
  )

  it('uses the savings translation instead of the on/off control translation', async () => {
    const discounted = buildModelCatalog(
      [{ ...models[0].pricingModel, group_ratio: { default: 0.5 } }],
      1
    )
    await renderApp(
      <LandingPage
        isAuthenticated={false}
        models={discounted}
        maxSavingsPercent={50}
      />,
      client
    )
    expect(screen.getAllByText('Save 50%').length).toBeGreaterThan(0)
  })

  it('closes mobile navigation when an in-page destination is selected', async () => {
    const user = userEvent.setup()
    await renderApp(
      <LandingPage
        isAuthenticated={false}
        models={models}
        maxSavingsPercent={0}
      />,
      client
    )
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const navigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Sign in' })
    ).toHaveAttribute('href', '/sign-in')
    expect(
      within(navigation).getByRole('link', { name: 'Start saving' })
    ).toHaveAttribute('href', '/sign-up')
    expect(
      screen.queryByRole('button', { name: 'Profile' })
    ).not.toBeInTheDocument()
    expect(
      within(navigation).queryByRole('link', { name: 'Model Price' })
    ).not.toBeInTheDocument()
    expect(
      within(navigation).queryByRole('link', { name: 'Docs' })
    ).not.toBeInTheDocument()
    expect(
      within(navigation).getAllByRole('link', { name: 'Client' })[0]
    ).toHaveAttribute('href', '/client')
    await user.click(within(navigation).getAllByRole('link', { name: 'Models' })[1])
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps table-cell layout and shows the live comparison for a discounted model', async () => {
    style.textContent = readFileSync('src/styles/editorial.css', 'utf8')
    const discounted = buildModelCatalog(
      [{ ...models[0].pricingModel, group_ratio: { default: 0.5 } }],
      1
    )
    const { container } = await renderApp(
      <LandingPage
        isAuthenticated={false}
        models={discounted}
        maxSavingsPercent={50}
      />,
      client
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells.length).toBeGreaterThan(0)
    expect(
      cells.every((cell) => getComputedStyle(cell).display === 'table-cell')
    ).toBe(true)
    const comparison = screen.getByTestId('live-comparison')
    expect(comparison).toBeVisible()
    expect(within(comparison).getByText('test-model')).toBeVisible()
  })
})

describe('configured landing footer', () => {
  it.each([true, false])(
    'renders custom notices and respects enabled legal links=%s',
    async (enabled) => {
      useSystemConfigStore.getState().setConfig({
        footerHtml:
          '<strong>Operator registration notice</strong><script>window.footerInjected = true</script>',
      })
      client.setQueryData(
        ['status'],
        {
          user_agreement_enabled: enabled,
          privacy_policy_enabled: enabled,
        },
        { updatedAt: Date.now() + 60000 }
      )
      await renderApp(
        <LandingPage
          isAuthenticated={false}
          models={models}
          maxSavingsPercent={0}
        />,
        client
      )
      const footer = screen.getByRole('contentinfo')
      expect(
        within(footer).getByText('Operator registration notice')
      ).toBeVisible()
      expect(footer.querySelector('script')).toBeNull()
      for (const [name, href] of [
        ['User Agreement', '/user-agreement'],
        ['Privacy Policy', '/privacy-policy'],
      ]) {
        if (enabled) {
          expect(within(footer).getByRole('link', { name })).toHaveAttribute(
            'href',
            href
          )
        } else {
          expect(within(footer).queryByRole('link', { name })).toBeNull()
        }
      }
      expect(
        within(footer).getByRole('link', { name: 'New API' })
      ).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
    }
  )
})
