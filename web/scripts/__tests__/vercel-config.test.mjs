import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const roots = ['../../../', '../../', '../../../electron/'].map(
  (path) => new URL(path, import.meta.url)
)

for (const root of roots) {
  test(`deployment at ${root.pathname} proxies API before the SPA fallback`, () => {
    const dynamicConfig = new URL('vercel.mjs', root)
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { config } from ${JSON.stringify(dynamicConfig.href)}; console.log(JSON.stringify(config))`,
      ],
      {
        env: {
          ...process.env,
          VITE_REACT_APP_SERVER_URL: 'https://backend.example.test/',
        },
        encoding: 'utf8',
      }
    )
    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(result.stdout)
    const privacy = config.headers.find((rule) =>
      rule.source.startsWith('/:partnerDocument(')
    )
    assert.ok(
      privacy,
      'shared generator must emit partner HTML privacy headers'
    )
    const matcher = new RegExp(
      `^/${privacy.source.slice('/:partnerDocument('.length, -1)}$`
    )
    for (const path of [
      '/partner/checkout',
      '/partner/checkout/',
      '/partner/%63heckout',
      '/%70artner/checkout',
      '/partner%2Fcheckout',
      '/partner/%63heckout%2f',
      '/partner/purchase',
      '/partner/purchase/',
      '/partner/%70urchase',
      '/%70artner/purchase',
      '/partner%2fpurchase',
      '/partner/%70urchase%2F',
    ]) {
      assert.ok(matcher.test(path), `private HTML alias: ${path}`)
    }
    for (const path of [
      '/',
      '/sign-in',
      '/partner/checkout-other',
      '/partner/purchase-other',
      '/partner/purchase/child',
      '/partner/%2570urchase',
      '/partner/%2563heckout',
      '/partner/%',
      '/partner/%FFpurchase',
    ]) {
      assert.equal(matcher.test(path), false, `ordinary HTML: ${path}`)
    }
    for (const [key, value] of [
      ['Cache-Control', 'private, no-store'],
      ['Referrer-Policy', 'no-referrer'],
      ['X-Frame-Options', 'DENY'],
      ['Content-Security-Policy', "frame-ancestors 'none'"],
    ]) {
      assert.ok(
        privacy.headers.some(
          (header) => header.key === key && header.value === value
        )
      )
    }

    for (const prefix of ['api', 'pg', 'v1', 'mj']) {
      const index = config.rewrites.findIndex(
        (route) => route.source === `/${prefix}/:path*`
      )
      assert.notEqual(
        index,
        -1,
        `${prefix} requests must not fall through to index.html`
      )
      assert.equal(
        config.rewrites[index].destination,
        `https://backend.example.test/${prefix}/:path*`
      )
      assert.ok(
        index <
          config.rewrites.findIndex(
            (route) => route.destination === '/index.html'
          )
      )
      assert.ok(
        config.headers.some(
          (rule) =>
            rule.source === `/${prefix}/:path*` &&
            rule.headers.some(
              (header) =>
                header.key === 'x-vercel-enable-rewrite-caching' &&
                header.value === '0'
            )
        )
      )
    }
  })
}

test('rejects missing and unsafe backend targets before deployment', async () => {
  const { createVercelConfig } = await import('../vercel-config.mjs')
  const original = process.env.VITE_REACT_APP_SERVER_URL
  try {
    for (const value of [
      '',
      'http://backend.example.test',
      'https://user:pass@backend.example.test',
      'https://backend.example.test/api',
      'https://backend.example.test?key=value',
      'https://backend.example.test#fragment',
    ]) {
      process.env.VITE_REACT_APP_SERVER_URL = value
      assert.throws(() => createVercelConfig({}), /VITE_REACT_APP_SERVER_URL/)
    }
  } finally {
    if (original === undefined) delete process.env.VITE_REACT_APP_SERVER_URL
    else process.env.VITE_REACT_APP_SERVER_URL = original
  }
})
