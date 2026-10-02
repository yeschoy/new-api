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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { ApiAccelerationUrls } from '../api-acceleration-urls'

const CHINA_ACCELERATION_URL = 'https://yeschoy.com'
const GLOBAL_ACCELERATION_URL = 'https://api.yeschoy.com'

it('shows and copies both acceleration URLs', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

  render(<ApiAccelerationUrls />)

  expect(screen.getByText(CHINA_ACCELERATION_URL)).toBeVisible()
  expect(screen.getByText(GLOBAL_ACCELERATION_URL)).toBeVisible()

  await user.click(
    screen.getByRole('button', {
      name: 'Copy Mainland China acceleration URL',
    })
  )
  await user.click(
    screen.getByRole('button', { name: 'Copy Global acceleration URL' })
  )

  expect(write).toHaveBeenNthCalledWith(1, CHINA_ACCELERATION_URL)
  expect(write).toHaveBeenNthCalledWith(2, GLOBAL_ACCELERATION_URL)
})
