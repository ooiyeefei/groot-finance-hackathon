/**
 * Unit Tests: Model Version Loader (T043)
 *
 * Tests for DSPy model version loading, S3 artifact fetching, and caching.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getActiveVersion, loadPromptFromS3, loadActivePrompt, loadActivePromptCached, clearPromptCache } from '@/lib/ai/dspy/model-version-loader';
import type { ModelVersion, OptimizedPromptArtifact } from '@/lib/ai/dspy/types';

// Mock Convex generated API
vi.mock('@/convex/_generated/api', () => ({
  api: {
    functions: {
      chatOptimizationNew: {
        getActiveVersion: 'chatOptimizationNew:getActiveVersion'
      }
    }
  }
}));

// Mock AWS SDK S3 Client
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  class GetObjectCommand {
    constructor(public input: any) {}
  }
  class S3Client {
    constructor(public config: any) {}
    send = mockSend;
  }
  return { S3Client, GetObjectCommand, mockSend };
});

// Mock Convex HTTP Client
vi.mock('convex/browser', () => {
  const mockQuery = vi.fn();
  class ConvexHttpClient {
    constructor(public url: string) {}
    query = mockQuery;
  }
  return { ConvexHttpClient, mockQuery };
});

// Import mocked modules for test manipulation
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConvexHttpClient } from 'convex/browser';

// Get mock functions from the mocked modules
const mockS3Send = (await import('@aws-sdk/client-s3')).mockSend as ReturnType<typeof vi.fn>;
const mockConvexQuery = (await import('convex/browser')).mockQuery as ReturnType<typeof vi.fn>;

describe('Model Version Loader', () => {
  beforeEach(() => {
    clearPromptCache();
    mockS3Send.mockClear();
    mockConvexQuery.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getActiveVersion', () => {
    it('should return null when no active version exists', async () => {
      mockConvexQuery.mockResolvedValue(null);

      const version = await getActiveVersion('chat-agent-intent');

      expect(version).toBeNull();
      expect(mockConvexQuery).toHaveBeenCalledWith(
        expect.anything(),
        { module: 'chat-agent-intent' }
      );
    });

    it('should return ModelVersion when active version exists', async () => {
      const mockVersion: Partial<ModelVersion> = {
        _id: 'test-id-123' as any,
        _creationTime: Date.now(),
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        s3Key: 'dspy/chat-agent/chat-agent-intent/v20260320-001.json',
        promptHash: 'abc123def456',
        correctionsConsumed: 25,
        trainingExamples: 20,
        validationExamples: 5,
        optimizerType: 'bootstrapfewshot',
        optimizerConfig: {
          max_bootstrapped_demos: 4,
          max_labeled_demos: 4,
          max_rounds: 1
        },
        evalMetrics: {
          validationAccuracy: 0.92,
          perCategoryMetrics: {
            expense_query: { precision: 0.95, recall: 0.90, f1: 0.925, support: 10 }
          },
          confusionMatrix: [[8, 1], [1, 9]]
        },
        status: 'promoted',
        triggerType: 'manual',
        durationMs: 45000
      };

      mockConvexQuery.mockResolvedValue(mockVersion);

      const version = await getActiveVersion('chat-agent-intent');

      expect(version).not.toBeNull();
      expect(version?.versionId).toBe('v20260320-001');
      expect(version?.s3Key).toBe('dspy/chat-agent/chat-agent-intent/v20260320-001.json');
      expect(version?.evalMetrics).toBeDefined();
      expect(version?.evalMetrics.validationAccuracy).toBe(0.92);
    });

    it('should handle Convex query errors gracefully', async () => {
      mockConvexQuery.mockRejectedValue(new Error('Convex connection failed'));

      const version = await getActiveVersion('chat-agent-intent');

      expect(version).toBeNull();
    });
  });

  describe('loadPromptFromS3', () => {
    it('should return null for non-existent S3 key', async () => {
      const noSuchKeyError = Object.assign(
        new Error('NoSuchKey'),
        { name: 'NoSuchKey' }
      );
      mockS3Send.mockRejectedValue(noSuchKeyError);

      const prompt = await loadPromptFromS3('dspy/chat-agent/non-existent.json');

      expect(prompt).toBeNull();
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should parse JSON artifact correctly', async () => {
      const mockArtifact: OptimizedPromptArtifact = {
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        createdAt: '2026-03-20T10:00:00Z',
        systemInstructions: 'You are an AI assistant specialized in classifying financial queries.',
        fewShotExamples: [
          {
            query: 'Show me my expense claims',
            intent: 'expense_query',
            rationale: 'User wants to view expense claims'
          },
          {
            query: 'What is my sales revenue?',
            intent: 'sales_query',
            rationale: 'User wants sales revenue information'
          }
        ],
        metadata: {
          correctionsUsed: 25,
          validationAccuracy: 0.92,
          trainingDurationMs: 45000
        }
      };

      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => JSON.stringify(mockArtifact)
        }
      });

      const prompt = await loadPromptFromS3('dspy/chat-agent/v20260320-001.json');

      expect(prompt).not.toBeNull();
      expect(prompt?.versionId).toBe('v20260320-001');
      expect(prompt?.systemInstructions).toContain('financial queries');
      expect(prompt?.fewShotExamples).toHaveLength(2);
      expect(prompt?.metadata.correctionsUsed).toBe(25);
      expect(prompt?.metadata.validationAccuracy).toBe(0.92);
    });

    it('should handle empty S3 response body', async () => {
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => ''
        }
      });

      const prompt = await loadPromptFromS3('dspy/chat-agent/empty.json');

      expect(prompt).toBeNull();
    });

    it('should handle S3 client errors gracefully', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 network error'));

      const prompt = await loadPromptFromS3('dspy/chat-agent/error.json');

      expect(prompt).toBeNull();
    });

    it('should handle invalid JSON in S3 artifact', async () => {
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => 'not valid json'
        }
      });

      const prompt = await loadPromptFromS3('dspy/chat-agent/invalid.json');

      expect(prompt).toBeNull();
    });
  });

  describe('loadActivePrompt', () => {
    it('should return null when no active version exists', async () => {
      mockConvexQuery.mockResolvedValue(null);

      const prompt = await loadActivePrompt('chat-agent-intent');

      expect(prompt).toBeNull();
      expect(mockConvexQuery).toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should load prompt from S3 when active version exists', async () => {
      const mockVersion: Partial<ModelVersion> = {
        versionId: 'v20260320-001',
        s3Key: 'dspy/chat-agent/v20260320-001.json'
      };

      const mockArtifact: OptimizedPromptArtifact = {
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        createdAt: '2026-03-20T10:00:00Z',
        systemInstructions: 'Test instructions',
        fewShotExamples: [],
        metadata: {
          correctionsUsed: 25,
          validationAccuracy: 0.92,
          trainingDurationMs: 45000
        }
      };

      mockConvexQuery.mockResolvedValue(mockVersion);
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => JSON.stringify(mockArtifact)
        }
      });

      const prompt = await loadActivePrompt('chat-agent-intent');

      expect(prompt).not.toBeNull();
      expect(prompt?.versionId).toBe('v20260320-001');
      expect(mockConvexQuery).toHaveBeenCalled();
      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('loadActivePromptCached', () => {
    it('should cache results for 5 minutes', async () => {
      const mockVersion: Partial<ModelVersion> = {
        versionId: 'v20260320-001',
        s3Key: 'dspy/chat-agent/v20260320-001.json'
      };

      const mockArtifact: OptimizedPromptArtifact = {
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        createdAt: '2026-03-20T10:00:00Z',
        systemInstructions: 'Cached instructions',
        fewShotExamples: [],
        metadata: {
          correctionsUsed: 25,
          validationAccuracy: 0.92,
          trainingDurationMs: 45000
        }
      };

      mockConvexQuery.mockResolvedValue(mockVersion);
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => JSON.stringify(mockArtifact)
        }
      });

      // First call - should hit S3
      const result1 = await loadActivePromptCached('chat-agent-intent');
      expect(result1.artifact).not.toBeNull();
      expect(result1.metrics.cached).toBe(false);
      expect(result1.metrics.source).toBe('both');
      expect(mockS3Send).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await loadActivePromptCached('chat-agent-intent');
      expect(result2.artifact).not.toBeNull();
      expect(result2.artifact?.versionId).toBe('v20260320-001');
      expect(result2.metrics.cached).toBe(true);
      expect(mockS3Send).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should reload after cache TTL expires', async () => {
      const mockVersion: Partial<ModelVersion> = {
        versionId: 'v20260320-001',
        s3Key: 'dspy/chat-agent/v20260320-001.json'
      };

      const mockArtifact: OptimizedPromptArtifact = {
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        createdAt: '2026-03-20T10:00:00Z',
        systemInstructions: 'Test',
        fewShotExamples: [],
        metadata: {
          correctionsUsed: 25,
          validationAccuracy: 0.92,
          trainingDurationMs: 45000
        }
      };

      mockConvexQuery.mockResolvedValue(mockVersion);
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => JSON.stringify(mockArtifact)
        }
      });

      // First call
      const result1 = await loadActivePromptCached('chat-agent-intent');
      expect(result1.metrics.cached).toBe(false);

      // Mock time advance by 6 minutes (cache TTL is 5 minutes)
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);

      // Second call - cache expired, should reload
      const result2 = await loadActivePromptCached('chat-agent-intent');
      expect(result2.metrics.cached).toBe(false);
      expect(mockS3Send).toHaveBeenCalledTimes(2);

      vi.restoreAllMocks();
    });

    it('should return null with metrics when no version exists', async () => {
      mockConvexQuery.mockResolvedValue(null);

      const result = await loadActivePromptCached('non-existent-module');

      expect(result.artifact).toBeNull();
      expect(result.metrics.cached).toBe(false);
      expect(result.metrics.source).toBe('both');
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clearPromptCache', () => {
    it('should clear cached prompts', async () => {
      const mockVersion: Partial<ModelVersion> = {
        versionId: 'v20260320-001',
        s3Key: 'dspy/chat-agent/v20260320-001.json'
      };

      const mockArtifact: OptimizedPromptArtifact = {
        versionId: 'v20260320-001',
        module: 'chat-agent-intent',
        createdAt: '2026-03-20T10:00:00Z',
        systemInstructions: 'Test',
        fewShotExamples: [],
        metadata: {
          correctionsUsed: 25,
          validationAccuracy: 0.92,
          trainingDurationMs: 45000
        }
      };

      mockConvexQuery.mockResolvedValue(mockVersion);
      mockS3Send.mockResolvedValue({
        Body: {
          transformToString: async () => JSON.stringify(mockArtifact)
        }
      });

      // First call - caches result
      await loadActivePromptCached('chat-agent-intent');
      expect(mockS3Send).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      await loadActivePromptCached('chat-agent-intent');
      expect(mockS3Send).toHaveBeenCalledTimes(1);

      // Clear cache
      clearPromptCache();

      // Third call - cache cleared, should reload
      await loadActivePromptCached('chat-agent-intent');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });
});
