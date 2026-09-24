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
import {
  CALLS,
  CHINA_CALLERS,
  CHINA_SITES,
  FADE_OUT,
  REQUEST,
  RIPPLE,
  THINK,
  TOKEN_TRAVEL,
  US_CALLERS,
  US_SITES,
  arcControl,
  callPhase,
  nearestCopy,
  pointOnArc,
  type LonLat,
} from '../world-signals'

describe('callPhase', () => {
  const period = 5

  it('sends the request first', () => {
    expect(callPhase(0, period, 0)).toEqual({ request: 0, think: null, tokens: [], arrive: null, route: 0 })
  })

  it('lets the model work once the request lands', () => {
    const phase = callPhase(REQUEST + THINK / 2, period, 0)
    expect(phase.request).toBeNull()
    expect(phase.think).toBeCloseTo(0.5)
  })

  it('streams the answer back token by token', () => {
    const { tokens } = callPhase(REQUEST + THINK + TOKEN_TRAVEL / 2, period, 0)
    expect(tokens[0]).toBeCloseTo(0.5)
    expect(tokens.length).toBeGreaterThan(2)
    for (let i = 1; i < tokens.length; i += 1) expect(tokens[i]).toBeLessThan(tokens[i - 1])
  })

  it('ripples at the caller when the answer arrives', () => {
    expect(callPhase(REQUEST + THINK + TOKEN_TRAVEL + RIPPLE / 2, period, 0).arrive).toBeCloseTo(0.5)
  })

  it('rests at the end of the loop and repeats', () => {
    expect(callPhase(period - 0.01, period, 0)).toEqual({ request: null, think: null, tokens: [], arrive: null, route: 0 })
    expect(callPhase(period, period, 0).request).toBe(0)
  })

  it('lights the route as the request goes out and fades it while the answer streams back', () => {
    expect(callPhase(REQUEST / 2, period, 0).route).toBe(1)
    expect(callPhase(REQUEST + THINK + FADE_OUT / 2, period, 0).route).toBeCloseTo(0.5)
    expect(callPhase(REQUEST + THINK + FADE_OUT + 0.1, period, 0).route).toBe(0)
  })

  it('shifts each call by its offset', () => {
    expect(callPhase(1, period, 1)).toEqual(callPhase(2, period, 0))
  })
})

describe('arc geometry', () => {
  const a = { x: 0, y: 100 }
  const b = { x: 200, y: 100 }

  it('bends an east-west route upward', () => {
    expect(arcControl(a, b).y).toBeLessThan(100)
  })

  it('starts at one end and finishes at the other', () => {
    const c = arcControl(a, b)
    expect(pointOnArc(a, c, b, 0)).toEqual(a)
    expect(pointOnArc(a, c, b, 1)).toEqual(b)
  })

  it('takes the short way across the map edge', () => {
    expect(nearestCopy(10, 90, 100)).toBe(-10)
    expect(nearestCopy(90, 10, 100)).toBe(110)
    expect(nearestCopy(40, 70, 100)).toBe(70)
  })
})

describe('CALLS', () => {
  const inChina = ([lon, lat]: LonLat) => lon > 73 && lon < 123 && lat > 18 && lat < 54
  const inUS = ([lon, lat]: LonLat) => lon > -125 && lon < -66 && lat > 24 && lat < 50
  const between = CALLS.filter(
    (call) =>
      (CHINA_CALLERS.includes(call.from) && US_SITES.includes(call.to)) ||
      (US_CALLERS.includes(call.from) && CHINA_SITES.includes(call.to))
  )

  it('has callers where they claim to be', () => {
    for (const city of CHINA_CALLERS) expect(inChina(city)).toBe(true)
    for (const city of US_CALLERS) expect(inUS(city)).toBe(true)
  })

  it('is always answered by a model site in China or the US', () => {
    const sites = [...CHINA_SITES, ...US_SITES]
    for (const call of CALLS) expect(sites).toContain(call.to)
  })

  it('draws plenty of traffic', () => {
    expect(CALLS.length).toBeGreaterThanOrEqual(100)
  })

  it('has China and the US calling each other both ways, more than anyone else', () => {
    expect(between.some((call) => CHINA_CALLERS.includes(call.from))).toBe(true)
    expect(between.some((call) => US_CALLERS.includes(call.from))).toBe(true)
    expect(between.length).toBeGreaterThan(CALLS.length / 3)
  })

  it('has China and the US calling each other more often', () => {
    const others = CALLS.filter((call) => !between.includes(call))
    expect(Math.max(...between.map((call) => call.every))).toBeLessThan(Math.min(...others.map((call) => call.every)))
  })

  it('has callers on every inhabited continent', () => {
    const from = CALLS.map((call) => call.from)
    const has = (test: (lon: number, lat: number) => boolean) => from.some(([lon, lat]) => test(lon, lat))
    expect(has((lon, lat) => lon < -30 && lat < 0)).toBe(true) // South America
    expect(has((lon, lat) => lon > -15 && lon < 40 && lat > 40)).toBe(true) // Europe
    expect(has((lon, lat) => lon > -20 && lon < 52 && lat < 32 && lat > -35)).toBe(true) // Africa
    expect(has((lon, lat) => lon > 110 && lat < -10)).toBe(true) // Oceania
    expect(has((lon, lat) => lon > 125 && lat > 0)).toBe(true) // Japan and Korea
  })
})
