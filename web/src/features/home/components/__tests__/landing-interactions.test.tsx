import { readFileSync } from 'node:fs'

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
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderApp } from '@/test-utils/render-app'

import { buildModelCatalog } from '../../lib/catalog'
import { CiLandingPage } from '../ci-landing-page'

let client: QueryClient
let style: HTMLStyleElement
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
  style = document.createElement('style')
  document.head.append(style)
})
afterEach(() => {
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
  it('uses the savings translation instead of the on/off control translation', async () => {
    const discounted = buildModelCatalog(
      [{ ...models[0].pricingModel, group_ratio: { default: 0.5 } }],
      1
    )
    await renderApp(
      <CiLandingPage
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
      <CiLandingPage
        isAuthenticated={false}
        models={models}
        maxSavingsPercent={0}
      />,
      client
    )
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('link', { name: 'Models' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
  it('keeps table-cell layout and makes the loaded live comparison visible', async () => {
    style.textContent = readFileSync('src/styles/ci-landing.css', 'utf8')
    const { container } = await renderApp(
      <CiLandingPage
        isAuthenticated={false}
        models={models}
        maxSavingsPercent={0}
      />,
      client
    )
    const cells = [...container.querySelectorAll('tbody td')]
    expect(cells.length).toBeGreaterThan(0)
    expect(
      cells.every((cell) => getComputedStyle(cell).display === 'table-cell')
    ).toBe(true)
    const comparison = container.querySelector('.ci-rateComparison')
    if (!comparison) throw new Error('Missing live comparison')
    expect(getComputedStyle(comparison).opacity).toBe('1')
  })
})
