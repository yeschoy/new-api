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
import { nightness, subsolarPoint, sunElevation } from '../world-sun'

describe('subsolarPoint', () => {
  it('is over the Tropic of Cancer at noon UTC on the June solstice', () => {
    const [lon, lat] = subsolarPoint(Date.UTC(2026, 5, 21, 12))
    expect(lat).toBeCloseTo(23.44, 0)
    expect(Math.abs(lon)).toBeLessThan(3)
  })

  it('is over the Tropic of Capricorn on the December solstice', () => {
    expect(subsolarPoint(Date.UTC(2026, 11, 21, 12))[1]).toBeCloseTo(-23.44, 0)
  })

  it('is over the equator at the March equinox', () => {
    expect(Math.abs(subsolarPoint(Date.UTC(2026, 2, 20, 12))[1])).toBeLessThan(0.6)
  })

  it('is over the date line at midnight UTC', () => {
    expect(Math.abs(subsolarPoint(Date.UTC(2026, 8, 25, 0))[0])).toBeGreaterThan(177)
  })
})

describe('sunElevation', () => {
  it('is 90° under the sun and -90° on the far side of the Earth', () => {
    const sun = subsolarPoint(Date.UTC(2026, 8, 25, 4))
    expect(sunElevation(sun[1], sun[0], sun)).toBeCloseTo(90, 5)
    expect(sunElevation(-sun[1], sun[0] + 180, sun)).toBeCloseTo(-90, 5)
  })
})

describe('nightness', () => {
  it('is 0 in daylight, 1 at night and blends through twilight', () => {
    expect(nightness(10)).toBe(0)
    expect(nightness(-20)).toBe(1)
    expect(nightness(-3.5)).toBeCloseTo(0.5)
  })

  it('lights New York at night while it is noon in Beijing', () => {
    const noonInBeijing = Date.UTC(2026, 8, 25, 4) // 12:00 China Standard Time
    const sun = subsolarPoint(noonInBeijing)
    expect(nightness(sunElevation(39.9, 116.4, sun))).toBe(0)
    expect(nightness(sunElevation(40.71, -74.01, sun))).toBe(1)
  })
})
