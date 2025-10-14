/**
 * Model configuration and detection logic
 */

import { ModelType } from '../../tools/base-tool';
import { aiConfig } from '../../config/ai-config';
import { GeminiService } from '../../ai-services/gemini-service';

// Helper to check if we should use Gemini - BOTH conditions must be true
export const shouldUseGemini = () => {
  return process.env.USE_GEMINI === 'true' && !!aiConfig.gemini?.apiKey;
};

// Model type detection for conditional logic
export const detectModelType = (): ModelType => {
  const useGemini = shouldUseGemini();
  const hasGeminiService = !!geminiService;
  const modelType = (useGemini && hasGeminiService) ? 'gemini' : 'openai';

  console.log(`[ModelDetection] USE_GEMINI=${useGemini}, hasGeminiService=${hasGeminiService} → Using ${modelType.toUpperCase()} path`);

  return modelType;
};

// Initialize Gemini service if configured
let geminiService: GeminiService | null = null;
if (shouldUseGemini() && aiConfig.gemini?.apiKey) {
  console.log(`🔧 [INIT] Gemini service initialized - Model: ${aiConfig.gemini.model}`);
  geminiService = new GeminiService();
} else {
  console.log(`🔧 [INIT] Using OpenAI-compatible service - Model: ${aiConfig.chat.modelId} at ${aiConfig.chat.endpointUrl}`);
}

export { geminiService };