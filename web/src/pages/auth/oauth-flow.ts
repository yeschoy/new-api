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

/** Full-page navigations, on one object so tests can stand in for them. */
export const browser = {
  assign(url: string) {
    window.location.assign(url)
  },
  replace(url: string) {
    window.location.replace(url)
  },
}

const REDIRECT_KEY = 'oauth_sign_in_redirect'

/** Keeps the page to open after a third-party sign-in across the round trip to the provider. */
export function rememberSignInRedirect(path: string) {
  try {
    window.sessionStorage.setItem(REDIRECT_KEY, path)
  } catch {
    // Without storage the visitor lands on the default page.
  }
}

/** The page remembered before leaving for the provider, read once. */
export function takeSignInRedirect(): string | null {
  try {
    const path = window.sessionStorage.getItem(REDIRECT_KEY)
    window.sessionStorage.removeItem(REDIRECT_KEY)
    return path
  } catch {
    return null
  }
}
