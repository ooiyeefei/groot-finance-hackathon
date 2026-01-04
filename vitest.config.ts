import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@/convex': path.resolve(__dirname, './convex'),
      '@': path.resolve(__dirname, './src'),
    },
  },
})