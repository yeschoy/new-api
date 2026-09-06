import { createVercelConfig } from './web/scripts/vercel-config.mjs'

export const config = createVercelConfig({
  installCommand: 'cd web && bun install --frozen-lockfile',
  buildCommand: 'cd web && bun run build',
  outputDirectory: 'web/dist',
})
