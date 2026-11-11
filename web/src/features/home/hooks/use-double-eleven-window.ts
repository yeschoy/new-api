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
import { useEffect, useState } from 'react'

// Shared announcement dates, not payment eligibility. Only the server decides
// whether a live payer reward is available during this marketing window.
const ANNOUNCE_AT = Date.parse('2026-11-10T00:00:00+08:00')
const START_AT = Date.parse('2026-11-11T00:00:00+08:00')
const END_AT = Date.parse('2026-11-19T00:00:00+08:00')

export function useDoubleElevenWindow() {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let timer: number
    const checkDates = () => {
      const current = Date.now()
      setNow(current)
      window.clearTimeout(timer)
      const next = [ANNOUNCE_AT, START_AT, END_AT].find(
        (boundary) => boundary > current
      )
      if (next) {
        timer = window.setTimeout(
          checkDates,
          Math.min(next - current, 2_147_483_647)
        )
      }
    }
    const checkWhenVisible = () => {
      if (!document.hidden) checkDates()
    }
    checkDates()
    window.addEventListener('focus', checkDates)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', checkDates)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [])

  return {
    visible: now >= ANNOUNCE_AT && now < END_AT,
    upcoming: now < START_AT,
  }
}
