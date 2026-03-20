/**
 * Vitest setup file
 * Runs before all tests to configure global mocks and environment
 */

import { vi } from 'vitest';

// Mock Convex generated API (must be done before any imports that use it)
vi.mock('../convex/_generated/api', () => ({
  api: {
    functions: {
      chatOptimizationNew: {
        getActiveVersion: 'chatOptimizationNew:getActiveVersion'
      }
    }
  }
}));
