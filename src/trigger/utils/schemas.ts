/**
 * Runtime Type Validation Schemas for Python Script Results
 * Ensures type safety for python.runScript responses
 */

import { z } from "zod";

export const ExtractionResultSchema = z.object({
  success: z.boolean(),
  document_type: z.string().optional(),
  extracted_data: z.any().optional(),
  confidence_score: z.number().optional(),
  extraction_method: z.string().optional(),
  model_used: z.string().optional(),
  metadata: z.any().optional(),
  error: z.string().optional(),
  error_type: z.string().optional()
});

export const ClassificationResultSchema = z.object({
  success: z.boolean(),
  document_type: z.string().optional(),
  confidence_score: z.number().optional(),
  reasoning: z.string().optional(),
  is_supported: z.boolean().optional(),
  user_message: z.string().optional(),
  detected_elements: z.array(z.string()).optional(),
  context_metadata: z.any().optional(), // Basic routing context only, no detailed extraction
  error: z.string().optional(),
  error_type: z.string().optional(),
  classification_method: z.string().optional(),
  model_used: z.string().optional()
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export function validatePythonScriptResult<T>(
  result: unknown,
  schema: z.ZodSchema<T>,
  taskName: string
): T {
  try {
    return schema.parse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`${taskName} validation failed: ${errorDetails}`);
    }
    throw new Error(`${taskName} validation error: ${error}`);
  }
}

export function safePythonScriptResult<T>(
  result: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const parsed = schema.parse(result);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { success: false, error: `Validation failed: ${errorDetails}` };
    }
    return { success: false, error: `Validation error: ${error}` };
  }
}