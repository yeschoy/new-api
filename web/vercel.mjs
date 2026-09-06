import { createVercelConfig } from './scripts/vercel-config.mjs'

export const config = createVercelConfig({
  installCommand: 'bun install --frozen-lockfile',
  buildCommand: 'bun run build',
  outputDirectory: 'dist',
})
