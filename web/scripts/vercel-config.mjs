/** Build-time configuration shared by the supported Vercel project roots. */
export function createVercelConfig(commands) {
  const rawTarget = process.env.VITE_REACT_APP_SERVER_URL?.trim()
  if (!rawTarget) {
    throw new Error('VITE_REACT_APP_SERVER_URL is required for Vercel deploys')
  }
  const target = new URL(rawTarget)
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    (target.pathname !== '' && target.pathname !== '/')
  ) {
    throw new Error(
      'VITE_REACT_APP_SERVER_URL must be an HTTPS origin without credentials, path, query, or fragment'
    )
  }

  const prefixes = ['api', 'pg', 'v1', 'mj']
  return {
    framework: null,
    ...commands,
    rewrites: [
      ...prefixes.map((prefix) => ({
        source: `/${prefix}/:path*`,
        destination: `${target.origin}/${prefix}/:path*`,
      })),
      { source: '/(.*)', destination: '/index.html' },
    ],
    headers: prefixes.map((prefix) => ({
      source: `/${prefix}/:path*`,
      headers: [
        { key: 'x-vercel-enable-rewrite-caching', value: '0' },
        { key: 'Cache-Control', value: 'private, no-store' },
      ],
    })),
  }
}
