/**
 * Vitest Test Setup
 * Global setup for all tests
 */

import { vi } from 'vitest'

// Mock environment variables for testing
process.env.NEXT_PUBLIC_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://test.convex.cloud'

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless DEBUG=true
  log: process.env.DEBUG ? console.log : vi.fn(),
  debug: vi.fn(),
  info: process.env.DEBUG ? console.info : vi.fn(),
  warn: console.warn,
  error: console.error,
}
