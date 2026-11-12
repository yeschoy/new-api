// One URL-path decode, matching Go and the early document classifier. Cover
// raw and percent-encoded letters/separators without affecting ordinary pages.
const encodedLiteral = (text) =>
  [...text]
    .map((character) => {
      const hex = character
        .charCodeAt(0)
        .toString(16)
        .replaceAll(/[a-f]/g, (letter) => `[${letter}${letter.toUpperCase()}]`)
      return `(?:${character}|%${hex})`
    })
    .join('')
export const partnerDocumentSource = `/:partnerDocument(${encodedLiteral('partner')}(?:/|%2[fF])(?:${encodedLiteral('checkout')}|${encodedLiteral('purchase')})(?:/|%2[fF])?)`

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
    headers: [
      ...prefixes.map((prefix) => ({
        source: `/${prefix}/:path*`,
        headers: [
          { key: 'x-vercel-enable-rewrite-caching', value: '0' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      })),
      {
        source: partnerDocumentSource,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ],
  }
}
