import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The Go server embeds `web/dist`, so the output directory must stay `dist`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const serverUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.VITE_REACT_APP_SERVER_URL ||
    'http://localhost:3000'
  const proxy = Object.fromEntries(
    ['/api', '/v1', '/mj', '/pg'].map((key) => [
      key,
      { target: serverUrl, changeOrigin: true },
    ])
  )

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: { host: '0.0.0.0', proxy },
    build: { outDir: 'dist', emptyOutDir: true },
  }
})
