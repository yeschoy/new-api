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

/** Longitude, latitude in degrees. */
export type LonLat = readonly [number, number]

const DEG = Math.PI / 180
/** Unix time of the J2000 epoch (2000-01-01 12:00 UTC). */
const J2000_MS = Date.UTC(2000, 0, 1, 12)
/** Sun elevations (°) where daylight ends and full night begins; lights come on in between. */
const DAY_EDGE = 1
const NIGHT_EDGE = -8

/**
 * The point on Earth with the sun straight overhead at a Unix time in ms
 * (the Astronomical Almanac's low-precision solar formulas, good to about 0.01°).
 */
export function subsolarPoint(ms: number): LonLat {
  const n = (ms - J2000_MS) / 86_400_000
  const meanLongitude = 280.46 + 0.9856474 * n
  const anomaly = (357.528 + 0.9856003 * n) * DEG
  const longitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * DEG
  const obliquity = (23.439 - 0.0000004 * n) * DEG
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude))
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude))
  const siderealTime = 280.46061837 + 360.98564736629 * n
  const lon = rightAscension / DEG - siderealTime
  return [((((lon + 180) % 360) + 360) % 360) - 180, declination / DEG]
}

/** How high the sun stands (degrees, negative below the horizon) at a place. */
export function sunElevation(lat: number, lon: number, sun: LonLat): number {
  const phi = lat * DEG
  const delta = sun[1] * DEG
  const hour = (lon - sun[0]) * DEG
  const s = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(hour)
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG
}

/** 0 in daylight, 1 at night, easing through twilight as the lights come on. */
export function nightness(elevation: number): number {
  if (elevation >= DAY_EDGE) return 0
  if (elevation <= NIGHT_EDGE) return 1
  const t = (DAY_EDGE - elevation) / (DAY_EDGE - NIGHT_EDGE)
  return t * t * (3 - 2 * t)
}
