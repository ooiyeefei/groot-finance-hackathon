import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        '.next',
        'tests',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/types.ts'
      ]
    },
    server: {
      deps: {
        inline: ['convex']
      }
    }
  },
  resolve: {
    alias: [
      { find: /^@\/convex\/(.*)$/, replacement: path.resolve(__dirname, './convex/$1') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './src/$1') }
    ]
  }
});
