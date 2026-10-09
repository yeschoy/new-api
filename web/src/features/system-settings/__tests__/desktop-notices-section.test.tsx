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
  test('shows server-side validation errors from advanced JSON editor', async () => {
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
        <DesktopNoticesSection
          defaultValue='[{"id":"n1","title":"Hello","severity":"info"}]'
        />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Advanced: edit JSON/i }))
    const input = await screen.findByRole('textbox', {
      name: 'Desktop notices JSON',
    })
    const rejectedValue = '[{"title":"Notice","severity":"critical"}]'
    fireEvent.change(input, { target: { value: rejectedValue } })
    fireEvent.click(screen.getByRole('button', { name: /Apply JSON to list/i }))

    // After apply, list updates; save should hit the server with rejected severity
    // Apply may fail client validation for critical? Client validate only checks title/id.
    // So apply succeeds, then save.
    await waitFor(() =>
      expect(screen.getByText('Notice')).toBeInTheDocument()
    )

    const saveButtons = screen.getAllByRole('button', {
      name: /Save desktop notices/i,
    })
    fireEvent.click(saveButtons[0]!)

    await waitFor(() =>
      expect(updateSystemOption).toHaveBeenCalledWith({
        key: 'DesktopNotices',
        value: expect.stringContaining('"severity": "critical"'),
      })
    )
    expect(await screen.findByText(errorMessage)).toBeInTheDocument()
    queryClient.clear()
  })

  test('adds a notice through the form UI', async () => {
    vi.mocked(updateSystemOption).mockResolvedValue({
      success: true,
      message: '',
    })
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <DesktopNoticesSection defaultValue='[]' />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Add desktop notice/i }))
    const title = await screen.findByPlaceholderText(
      /e\.g\. Scheduled maintenance/i
    )
    fireEvent.change(title, { target: { value: '维护通知' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }))

    expect(await screen.findByText('维护通知')).toBeInTheDocument()
    queryClient.clear()
  })
})
