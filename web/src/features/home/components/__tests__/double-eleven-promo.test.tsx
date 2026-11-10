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
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderApp } from '@/test-utils/render-app'

import { CiLandingPage } from '../ci-landing-page'
import { DoubleElevenPromo } from '../double-eleven-promo'

const { getPublicCashbackOffers } = vi.hoisted(() => ({
  getPublicCashbackOffers: vi.fn(),
}))
vi.mock('@/features/cashback/api', () => ({ getPublicCashbackOffers }))

let client: QueryClient
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T00:00:00+08:00'))
  getPublicCashbackOffers.mockReset().mockResolvedValue({
    active: true,
    currency: 'CNY',
    invitee: { strategy: 'per_hundred', fixed_per_hundred: 10 },
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
})
afterEach(() => {
  client.clear()
  vi.useRealTimers()
})

const offerText = 'Every CNY 100 topped up earns ¥10 in bonus credit'

describe('Double Eleven homepage promotion', () => {
  it.each([
    [false, 'Get started', '/sign-up'],
    [true, 'Top up now', '/wallet'],
  ])(
    'shows the live gift and auth-aware action (authenticated=%s)',
    async (isAuthenticated, label, href) => {
      await renderApp(
        <DoubleElevenPromo isAuthenticated={isAuthenticated} />,
        client
      )
      expect(await screen.findByText(offerText)).toBeVisible()
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        href
      )
      expect(
        screen.getByText(
          'Complete hundreds per order only; remainders do not carry over.'
        )
      ).toBeVisible()
      expect(
        screen.getByText(
          'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.'
        )
      ).toBeVisible()
      expect(screen.getByText('11.11')).toBeVisible()
      expect(screen.getByText('11.18')).toBeVisible()
      expect(screen.getByText('11.18').parentElement).toHaveTextContent(
        '11.11 – 11.18 · Beijing time'
      )
      expect(screen.queryByText(/unlimited/i)).toBeNull()
    }
  )

  it('uses the actual reward and makes first-top-up eligibility explicit', async () => {
    getPublicCashbackOffers.mockResolvedValue({
      active: true,
      currency: 'CNY',
      invitee: {
        strategy: 'per_hundred',
        fixed_per_hundred: 6,
        payer_scope: 'first_top_up',
      },
    })
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    expect(
      await screen.findByText(
        'Every CNY 100 topped up earns ¥6 in bonus credit'
      )
    ).toBeVisible()
    expect(screen.getByText('First top-up only')).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
  })

  it('announces the dates without promising a gift before the backend campaign starts', async () => {
    vi.setSystemTime(new Date('2026-11-10T20:00:00+08:00'))
    getPublicCashbackOffers.mockResolvedValue({
      active: false,
      currency: 'CNY',
    })
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    expect(
      await screen.findByText(
        'Offer details will appear when the campaign starts.'
      )
    ).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute(
      'href',
      '/activity'
    )
  })

  it('does not advertise an inviter-only offer as a top-up reward', async () => {
    getPublicCashbackOffers.mockResolvedValue({
      active: true,
      currency: 'CNY',
      inviter: { strategy: 'per_hundred', fixed_per_hundred: 10 },
    })
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    expect(
      await screen.findByText('No active top-up payer offer right now.')
    ).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
  })

  it('suppresses cached rewards while fetching and after a failed request', async () => {
    client.setQueryData(['cashback', 'public-offers'], {
      active: true,
      currency: 'CNY',
      invitee: { strategy: 'per_hundred', fixed_per_hundred: 10 },
    })
    let rejectRequest: (reason: Error) => void = () => undefined
    getPublicCashbackOffers.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject
      })
    )
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    expect(screen.getByText('Checking current offers…')).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
    await act(async () => rejectRequest(new Error('unavailable')))
    expect(
      await screen.findByText('Current offers are temporarily unavailable.')
    ).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
  })

  it('removes a formerly live reward when the backend stops the campaign', async () => {
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    await screen.findByText(offerText)
    getPublicCashbackOffers.mockResolvedValue({
      active: false,
      currency: 'CNY',
    })
    await act(async () => {
      await client.refetchQueries({ queryKey: ['cashback', 'public-offers'] })
    })
    expect(
      await screen.findByText('No active top-up payer offer right now.')
    ).toBeVisible()
    expect(screen.queryByText(offerText)).toBeNull()
    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute(
      'href',
      '/activity'
    )
  })

  it.each(['2026-11-09T23:59:59+08:00', '2026-11-19T00:00:00+08:00'])(
    'hides the promotion and skips requests outside the announcement window: %s',
    async (date) => {
      vi.setSystemTime(new Date(date))
      await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
      expect(
        screen.queryByRole('region', { name: 'Double 11 top-up special' })
      ).toBeNull()
      expect(getPublicCashbackOffers).not.toHaveBeenCalled()
    }
  )

  it('stays visible through November 18 and disappears on the deadline without a reload', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-18T23:59:59+08:00'))
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    expect(
      screen.getByRole('region', { name: 'Double 11 top-up special' })
    ).toBeVisible()
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(
      screen.queryByRole('region', { name: 'Double 11 top-up special' })
    ).toBeNull()
  })

  it('removes the expired card on focus after a suspended tab resumes', async () => {
    await renderApp(<DoubleElevenPromo isAuthenticated={false} />, client)
    await screen.findByText(offerText)
    vi.setSystemTime(new Date('2026-11-19T00:00:01+08:00'))
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Double 11 top-up special' })
      ).toBeNull()
    )
  })

  it('keeps a modest card inside the product hero and moves the hackathon below it', async () => {
    const { container } = await renderApp(
      <CiLandingPage
        isAuthenticated={false}
        models={[]}
        maxSavingsPercent={0}
      />,
      client
    )
    const hero = container.querySelector<HTMLElement>('.ci-hero')
    if (!hero) throw new Error('Missing product hero')
    expect(await within(hero).findByText(offerText)).toBeVisible()
    expect(within(hero).getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      within(hero).queryByRole('link', { name: /Qupper's Forge/ })
    ).toBeNull()
    expect(
      container.querySelector('.ci-partnershipAnnouncement')
        ?.previousElementSibling
    ).toBe(hero)
    const styles = readFileSync(
      'src/features/home/components/double-eleven-promo.css',
      'utf8'
    )
    expect(styles).not.toMatch(/animation:|min-height:\s*100/)
    expect(styles).toContain('max-width: 640px')
  })
})
