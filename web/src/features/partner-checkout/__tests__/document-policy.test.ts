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
import fs from 'node:fs'
import vm from 'node:vm'

import { afterEach, describe, expect, it } from 'vitest'

import { isPartnerCheckoutPath } from '../lib/access'

const html = fs.readFileSync('index.html', 'utf8')
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1]
)
const entryPolicy = inlineScripts[0] || ''
const analyticsLoader = inlineScripts.at(-1) || ''

afterEach(() => {
  document
    .querySelectorAll(
      'meta[http-equiv="Content-Security-Policy"], meta[name="referrer"], #site-analytics, script[data-policy-test]'
    )
    .forEach((element) => element.remove())
})

describe('cashier document policy before injected analytics', () => {
  it('limits scripts and connections to self before any analytics placeholder', () => {
    vm.runInNewContext(entryPolicy, {
      document,
      window: { location: { pathname: '/partner/checkout' } },
    })
    const policy = document.querySelector<HTMLMetaElement>(
      'meta[http-equiv="Content-Security-Policy"]'
    )
    expect(policy?.content).toContain("script-src 'self' 'unsafe-inline';")
    expect(policy?.content).toContain("connect-src 'self';")
    expect(policy?.content).toContain("frame-src 'none'")
    expect(policy?.content).not.toMatch(/https?:|\*/)
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer'
    )
    expect(html.indexOf(entryPolicy)).toBeLessThan(html.indexOf('<!--umami-->'))
    expect(html.indexOf(entryPolicy)).toBeLessThan(
      html.indexOf('<!--Google Analytics-->')
    )
  })

  it.each([
    '/partner/checkout',
    '/partner/checkout/',
    '/partner/%63heckout',
    '/%70artner/checkout',
    '/partner%2Fcheckout',
    '/partner/%63heckout%2f',
  ])('never mounts backend-injected analytics on %s', (pathname) => {
    const template = document.createElement('template')
    template.id = 'site-analytics'
    template.innerHTML =
      '<script data-policy-test src="https://analytics.example/script.js"></script><script data-policy-test>window.analyticsStarted = true</script>'
    document.head.append(template)
    const context = vm.createContext({
      document,
      window: { location: { pathname } },
    })
    vm.runInContext(entryPolicy, context)
    vm.runInContext(analyticsLoader, context)
    expect(isPartnerCheckoutPath(pathname)).toBe(true)
    const policy = document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
    expect(policy).toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain("connect-src 'self'")
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer'
    )
    expect(document.querySelector('script[data-policy-test]')).toBeNull()
    expect(document.querySelector('#site-analytics')).toBeNull()
  })

  it('preserves injected analytics script attributes and inline code outside checkout', () => {
    const template = document.createElement('template')
    template.id = 'site-analytics'
    template.innerHTML =
      '<script data-policy-test src="https://analytics.example/script.js" data-website-id="public-site-id" defer></script><script data-policy-test>window.analyticsStarted = true</script>'
    document.head.append(template)
    const context = vm.createContext({
      document,
      window: { location: { pathname: '/' } },
    })
    vm.runInContext(entryPolicy, context)
    vm.runInContext(analyticsLoader, context)
    const scripts = document.querySelectorAll('script[data-policy-test]')
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toHaveAttribute('data-website-id', 'public-site-id')
    expect(scripts[0]).toHaveAttribute('defer')
    expect(scripts[1]).toHaveTextContent('window.analyticsStarted = true')
  })

  it.each([
    '/',
    '/partner/checkout-other',
    '/partner/checkout/child',
    '/partner/%2563heckout',
    '/partner/%',
    '/partner/%FFcheckout',
  ])('does not restrict non-cashier or malformed path %s', (pathname) => {
    vm.runInNewContext(entryPolicy, {
      document,
      window: { location: { pathname } },
    })
    expect(isPartnerCheckoutPath(pathname)).toBe(false)
    expect(
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    ).toBeNull()
  })
})
