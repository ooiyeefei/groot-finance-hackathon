/**
 * Type Contracts: DSPy Vendor Item Matcher
 * Date: 2026-03-17
 */

// Lambda request/response types
export interface MatchVendorItemsRequest {
  items: Array<{
    itemDescription: string;
    vendorId: string;
    vendorName: string;
    itemIdentifier: string;
  }>;
  businessCorrections: Array<{
    itemDescriptionA: string;
    itemDescriptionB: string;
    isMatch: boolean;
  }>;
  modelS3Key?: string;         // Pre-trained model from S3
  maxSuggestions?: number;     // Limit results (default: 20)
  rejectedPairKeys: string[];  // Normalized pair keys to exclude
}

export interface MatchVendorItemsResponse {
  suggestions: Array<{
    itemDescriptionA: string;
    itemDescriptionB: string;
    vendorIdA: string;
    vendorIdB: string;
    confidence: number;        // 0.0-1.0
    reasoning: string;
    suggestedGroupName: string;
  }>;
  modelVersion: string;
  usedDspy: boolean;
  confidenceCapped: boolean;   // true if 80% cap applied (no optimized model)
}

export interface OptimizeVendorItemModelRequest {
  businessId: string;
  corrections: Array<{
    itemDescriptionA: string;
    itemDescriptionB: string;
    isMatch: boolean;
  }>;
  currentModelS3Key?: string;
  optimizerType: "bootstrap_fewshot" | "miprov2";
}

export interface OptimizeVendorItemModelResponse {
  success: boolean;
  s3Key: string;
  accuracy: number;
  trainingExamples: number;
  previousAccuracy?: number;
  modelAccepted: boolean;      // false if accuracy gating rejected it
}

// Convex function parameter types
export interface RecordCorrectionParams {
  businessId: string;
  itemDescriptionA: string;
  itemDescriptionB: string;
  vendorIdA: string;
  vendorIdB: string;
  isMatch: boolean;
  originalConfidence?: number;
  originalReasoning?: string;
}

export interface GetCorrectionsParams {
  businessId: string;
  limit?: number;
}

export interface CheckOptimizationReadinessParams {
  businessId: string;
  minCorrections: number;      // 20
  minUniquePairs: number;      // 10
}
