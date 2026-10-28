import { defineConfig } from 'vite'

// base: './' so the built bundle also works from a subpath (GitHub Pages).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    emptyOutDir: true,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
})
