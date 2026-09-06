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
