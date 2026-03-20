/**
 * Unit Tests: Auto-Recall (T044)
 *
 * Tests for automatic memory recall before agent response generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldAutoRecall, autoRecallMemories } from '@/lib/ai/agent/auto-recall';
import type { Memory } from '@/lib/ai/agent/memory/mem0-service';

// Mock mem0-service
vi.mock('@/lib/ai/agent/memory/mem0-service', () => ({
  searchMemories: vi.fn()
}));

// Import mocked function for test manipulation
import { searchMemories } from '@/lib/ai/agent/memory/mem0-service';

describe('Auto-Recall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shouldAutoRecall', () => {
    it('should return false for very short queries', () => {
      expect(shouldAutoRecall('help')).toBe(false);
      expect(shouldAutoRecall('hi')).toBe(false);
      expect(shouldAutoRecall('okay')).toBe(false);
      expect(shouldAutoRecall('yes')).toBe(false);
      expect(shouldAutoRecall('no')).toBe(false);
      expect(shouldAutoRecall('thanks')).toBe(false);
    });

    it('should return false for queries with exactly 9 characters', () => {
      expect(shouldAutoRecall('123456789')).toBe(false); // 9 chars = too short
    });

    it('should return true for queries with 10+ characters', () => {
      expect(shouldAutoRecall('1234567890')).toBe(true); // 10 chars = valid
      expect(shouldAutoRecall('hello world')).toBe(true); // 11 chars
    });

    it('should return false for meta-commands', () => {
      expect(shouldAutoRecall('/help')).toBe(false);
      expect(shouldAutoRecall('/reset')).toBe(false);
      expect(shouldAutoRecall('/clear')).toBe(false);
      expect(shouldAutoRecall('/forget')).toBe(false);
    });

    it('should return false for meta-commands with uppercase', () => {
      expect(shouldAutoRecall('/HELP')).toBe(false);
      expect(shouldAutoRecall('/Reset')).toBe(false);
      expect(shouldAutoRecall('/CLEAR')).toBe(false);
    });

    it('should return true for normal queries', () => {
      expect(shouldAutoRecall('Show me my expense claims')).toBe(true);
      expect(shouldAutoRecall('What is my sales revenue this month?')).toBe(true);
      expect(shouldAutoRecall('I need to reconcile my bank statement')).toBe(true);
      expect(shouldAutoRecall('Help me understand the invoice process')).toBe(true);
    });

    it('should handle whitespace correctly', () => {
      expect(shouldAutoRecall('   short   ')).toBe(false); // trimmed to "short" = 5 chars
      expect(shouldAutoRecall('   This is a longer query with whitespace   ')).toBe(true);
      expect(shouldAutoRecall('  /help  ')).toBe(false); // trimmed meta-command
    });

    it('should return true for queries with special characters', () => {
      expect(shouldAutoRecall('What\'s my balance?')).toBe(true);
      expect(shouldAutoRecall('Show me $1,000+ expenses')).toBe(true);
      expect(shouldAutoRecall('Email: test@example.com')).toBe(true);
    });
  });

  describe('autoRecallMemories', () => {
    const mockUserId = 'user_test123';
    const mockBusinessId = 'biz_test456';

    it('should filter by 0.7 similarity threshold', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'User prefers MYR currency',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.85
        },
        {
          id: 'mem2',
          memory: 'User has 10 employees',
          user_id: mockUserId,
          created_at: '2026-03-20T09:00:00Z',
          score: 0.75
        },
        {
          id: 'mem3',
          memory: 'User likes red color',
          user_id: mockUserId,
          created_at: '2026-03-20T08:00:00Z',
          score: 0.65 // Below threshold
        },
        {
          id: 'mem4',
          memory: 'User is in Malaysia',
          user_id: mockUserId,
          created_at: '2026-03-20T07:00:00Z',
          score: 0.50 // Below threshold
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories.slice(0, 2)); // Only above threshold

      const result = await autoRecallMemories('What is my currency?', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].score).toBeGreaterThanOrEqual(0.7);
      expect(result.memories[1].score).toBeGreaterThanOrEqual(0.7);
      expect(searchMemories).toHaveBeenCalledWith(
        'What is my currency?',
        mockUserId,
        mockBusinessId,
        5,
        0.7
      );
    });

    it('should return top 5 memories', async () => {
      const mockMemories: Memory[] = Array.from({ length: 10 }, (_, i) => ({
        id: `mem${i + 1}`,
        memory: `Memory ${i + 1}`,
        user_id: mockUserId,
        created_at: '2026-03-20T10:00:00Z',
        score: 0.9 - i * 0.02 // Descending scores
      }));

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories.slice(0, 5));

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(5);
      expect(result.memories[0].score).toBeGreaterThan(result.memories[4].score); // Descending order
    });

    it('should format context injection with <remembered_context> wrapper', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'User prefers MYR currency',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.85
        },
        {
          id: 'mem2',
          memory: 'User has 10 employees',
          user_id: mockUserId,
          created_at: '2026-03-20T09:00:00Z',
          score: 0.75
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.injectedContext).toContain('<remembered_context>');
      expect(result.injectedContext).toContain('</remembered_context>');
      expect(result.injectedContext).toContain('1. User prefers MYR currency');
      expect(result.injectedContext).toContain('2. User has 10 employees');
      expect(result.injectedContext).toContain('previous conversations with this user');
    });

    it('should return empty context when no memories found', async () => {
      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(0);
      expect(result.injectedContext).toBe('');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle custom limit parameter', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'Memory 1',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.9
        },
        {
          id: 'mem2',
          memory: 'Memory 2',
          user_id: mockUserId,
          created_at: '2026-03-20T09:00:00Z',
          score: 0.85
        },
        {
          id: 'mem3',
          memory: 'Memory 3',
          user_id: mockUserId,
          created_at: '2026-03-20T08:00:00Z',
          score: 0.8
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories.slice(0, 3));

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId, 3);

      expect(result.memories).toHaveLength(3);
      expect(searchMemories).toHaveBeenCalledWith(
        'test query',
        mockUserId,
        mockBusinessId,
        3,
        0.7
      );
    });

    it('should handle custom threshold parameter', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'High relevance',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.95
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId, 5, 0.9);

      expect(result.memories).toHaveLength(1);
      expect(searchMemories).toHaveBeenCalledWith(
        'test query',
        mockUserId,
        mockBusinessId,
        5,
        0.9
      );
    });

    it('should track duration correctly', async () => {
      (searchMemories as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 50))
      );

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.durationMs).toBeGreaterThanOrEqual(40); // At least 40ms (with some margin)
    });

    it('should handle searchMemories errors gracefully', async () => {
      (searchMemories as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Mem0 service unavailable')
      );

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(0);
      expect(result.injectedContext).toBe('');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle memories without scores', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'Memory without score',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z'
          // No score field
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].score).toBe(0);
    });

    it('should format numbered list correctly with multiple memories', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'First memory',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.9
        },
        {
          id: 'mem2',
          memory: 'Second memory',
          user_id: mockUserId,
          created_at: '2026-03-20T09:00:00Z',
          score: 0.85
        },
        {
          id: 'mem3',
          memory: 'Third memory',
          user_id: mockUserId,
          created_at: '2026-03-20T08:00:00Z',
          score: 0.8
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.injectedContext).toContain('1. First memory');
      expect(result.injectedContext).toContain('2. Second memory');
      expect(result.injectedContext).toContain('3. Third memory');
      expect(result.injectedContext).toContain('Use this context to provide more personalized');
    });

    it('should preserve memory content exactly as stored', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem1',
          memory: 'User\'s company name is "Tech Solutions Sdn Bhd" (registered 2020)',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.9
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.injectedContext).toContain('User\'s company name is "Tech Solutions Sdn Bhd" (registered 2020)');
    });

    it('should handle empty string query', async () => {
      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await autoRecallMemories('', mockUserId, mockBusinessId);

      expect(result.memories).toHaveLength(0);
      expect(result.injectedContext).toBe('');
      expect(searchMemories).toHaveBeenCalledWith('', mockUserId, mockBusinessId, 5, 0.7);
    });

    it('should map memory fields correctly to RecalledMemory interface', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem_abc123',
          memory: 'Test memory content',
          user_id: mockUserId,
          created_at: '2026-03-20T10:00:00Z',
          score: 0.88,
          hash: 'hash123',
          metadata: { source: 'conversation' }
        }
      ];

      (searchMemories as ReturnType<typeof vi.fn>).mockResolvedValue(mockMemories);

      const result = await autoRecallMemories('test query', mockUserId, mockBusinessId);

      expect(result.memories[0]).toEqual({
        id: 'mem_abc123',
        content: 'Test memory content',
        score: 0.88,
        createdAt: '2026-03-20T10:00:00Z'
      });
    });
  });
});
