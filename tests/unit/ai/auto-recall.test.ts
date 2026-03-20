/**
 * Unit Tests: Auto-Recall (T044)
 */

import { describe, it, expect } from '@jest/globals';
import { shouldAutoRecall } from '@/lib/ai/agent/auto-recall';

describe('Auto-Recall', () => {
  describe('shouldAutoRecall', () => {
    it('should return false for very short queries', () => {
      expect(shouldAutoRecall('help')).toBe(false);
      expect(shouldAutoRecall('hi')).toBe(false);
      expect(shouldAutoRecall('okay')).toBe(false);
    });

    it('should return false for meta-commands', () => {
      expect(shouldAutoRecall('/help')).toBe(false);
      expect(shouldAutoRecall('/reset')).toBe(false);
      expect(shouldAutoRecall('/clear')).toBe(false);
      expect(shouldAutoRecall('/forget')).toBe(false);
    });

    it('should return true for normal queries', () => {
      expect(shouldAutoRecall('Show me my expense claims')).toBe(true);
      expect(shouldAutoRecall('What is my sales revenue this month?')).toBe(true);
      expect(shouldAutoRecall('I need to reconcile my bank statement')).toBe(true);
    });

    it('should handle whitespace correctly', () => {
      expect(shouldAutoRecall('   short   ')).toBe(false);
      expect(shouldAutoRecall('   This is a longer query with whitespace   ')).toBe(true);
    });
  });
});
