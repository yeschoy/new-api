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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { updateSystemOption } from '../api'
import { DesktopNoticesSection } from '../maintenance/desktop-notices-section'

vi.mock('../api', () => ({ updateSystemOption: vi.fn() }))

describe('desktop notices settings', () => {
  test('shows server-side validation errors beneath the JSON field', async () => {
    const errorMessage = 'DesktopNotices 第 1 条的 severity 只能是 info 或 warning'
    vi.mocked(updateSystemOption).mockResolvedValue({
      success: false,
      message: errorMessage,
    })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DesktopNoticesSection defaultValue='[]' />
      </QueryClientProvider>
    )

    const input = screen.getByRole('textbox', { name: 'Desktop notices JSON' })
    const rejectedValue = '[{"title":"Notice","severity":"critical"}]'
    fireEvent.change(input, { target: { value: rejectedValue } })
    const form = input.closest('form')
    if (!form) {
      throw new Error('Desktop notices form not found')
    }
    fireEvent.submit(form)

    await waitFor(() =>
      expect(updateSystemOption).toHaveBeenCalledWith({
        key: 'DesktopNotices',
        value: rejectedValue,
      })
    )
    expect(await screen.findByText(errorMessage)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveValue(rejectedValue)

    fireEvent.change(input, { target: { value: '[{"title":"Corrected"}]' } })
    expect(screen.queryByText(errorMessage)).not.toBeInTheDocument()
    queryClient.clear()
  })
})
