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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ThemeProvider, useTheme } from '../theme'

function Probe() {
  const theme = useTheme()
  return (
    <button type='button' onClick={theme.toggle}>
      {theme.theme}
    </button>
  )
}

// A time on the visitor's own clock.
function at(day: number, hour: number, minute = 0) {
  return new Date(2026, 8, day, hour, minute)
}

function openAt(time: Date) {
  vi.setSystemTime(time)
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  )
}

/** Moves the clock and lets the page's once-a-minute check run. */
function waitUntil(time: Date) {
  vi.setSystemTime(new Date(time.getTime() - 60_000))
  act(() => vi.advanceTimersByTime(60_000))
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('ThemeProvider', () => {
  it('follows the clock: day from 06:00, night from 18:00', () => {
    openAt(at(25, 17, 59))
    expect(screen.getByRole('button')).toHaveTextContent('light')
    waitUntil(at(25, 18))
    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
    waitUntil(at(26, 6))
    expect(screen.getByRole('button')).toHaveTextContent('light')
  })

  it('keeps a picked theme only until the clock next switches', () => {
    openAt(at(25, 19))
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('light')
    waitUntil(at(26, 5, 59))
    expect(screen.getByRole('button')).toHaveTextContent('light')
    waitUntil(at(26, 18))
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })

  it('remembers a pick after a reload, until the next switch', () => {
    openAt(at(25, 19))
    fireEvent.click(screen.getByRole('button'))
    cleanup()
    openAt(at(25, 23))
    expect(screen.getByRole('button')).toHaveTextContent('light')
    cleanup()
    openAt(at(26, 19))
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })

  it('ignores a theme pinned for good by the old header button', () => {
    window.localStorage.setItem('theme-mode', 'light')
    openAt(at(25, 19))
    expect(screen.getByRole('button')).toHaveTextContent('dark')
  })
})
