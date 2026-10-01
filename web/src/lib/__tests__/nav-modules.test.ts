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
import { showNavModule } from '../nav-modules'

// The live site's setting on 2026-10-01.
const LIVE = JSON.stringify({
  home: true,
  console: true,
  pricing: { enabled: true, requireAuth: false },
  rankings: { enabled: false, requireAuth: true },
  docs: true,
  about: false,
})

describe('showNavModule', () => {
  it('hides what the admin switched off and keeps the rest', () => {
    expect(showNavModule(LIVE, 'rankings', true)).toBe(false)
    expect(showNavModule(LIVE, 'about', false)).toBe(false)
    expect(showNavModule(LIVE, 'pricing', false)).toBe(true)
    expect(showNavModule(LIVE, 'docs', false)).toBe(true)
  })

  it('shows sign-in-only modules to signed-in visitors alone', () => {
    const raw = JSON.stringify({ rankings: { enabled: true, requireAuth: true } })
    expect(showNavModule(raw, 'rankings', false)).toBe(false)
    expect(showNavModule(raw, 'rankings', true)).toBe(true)
  })

  it('reads switches the way the backend does', () => {
    expect(showNavModule(JSON.stringify({ docs: '0' }), 'docs', true)).toBe(false)
    expect(showNavModule(JSON.stringify({ docs: 'false' }), 'docs', true)).toBe(false)
    expect(showNavModule(JSON.stringify({ docs: 0 }), 'docs', true)).toBe(false)
    expect(showNavModule(JSON.stringify({ docs: 'maybe' }), 'docs', true)).toBe(true)
    expect(showNavModule(JSON.stringify({ pricing: { enabled: '0' } }), 'pricing', true)).toBe(false)
  })

  it('shows everything when the setting is missing or unreadable', () => {
    expect(showNavModule(undefined, 'rankings', false)).toBe(true)
    expect(showNavModule('', 'rankings', false)).toBe(true)
    expect(showNavModule('{not json', 'rankings', false)).toBe(true)
  })
})
