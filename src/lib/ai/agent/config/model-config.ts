/**
 * Model configuration and detection logic
 *
 * Uses the OpenAI-compatible endpoint (Qwen3 on Modal).
 */

import { ModelType } from '../../tools/base-tool';
import { aiConfig } from '../../config/ai-config';

// Model type detection — always returns 'openai' (OpenAI-compatible API)
export const detectModelType = (): ModelType => {
  console.log(`[ModelDetection] Using OpenAI-compatible path — Model: ${aiConfig.chat.modelId} at ${aiConfig.chat.endpointUrl}`);
  return 'openai';
};
