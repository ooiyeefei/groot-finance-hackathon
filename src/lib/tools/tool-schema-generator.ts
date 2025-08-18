/**
 * Tool Schema Generator - Simplified Wrapper
 * 
 * This file now serves as a simple, non-redundant wrapper that delegates
 * to the ToolFactory's dynamic schema generation. This creates a single
 * source of truth for tool definitions in the ToolFactory.
 * 
 * @deprecated Consider importing ToolFactory.getToolSchemas() directly
 * instead of using this wrapper function.
 */

import { ToolFactory } from './tool-factory'
import { OpenAIToolSchema } from './base-tool'

/**
 * Generate OpenAI-compatible tool schemas for all registered tools
 * 
 * This function is now a simple wrapper around ToolFactory.getToolSchemas()
 * to maintain backward compatibility. For new code, consider using
 * ToolFactory.getToolSchemas() directly.
 */
export function generateToolSchemas(): OpenAIToolSchema[] {
  return ToolFactory.getToolSchemas()
}

// Re-export the interface for convenience
export type { OpenAIToolSchema }