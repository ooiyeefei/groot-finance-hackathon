/**
 * Trigger.dev Job Definition: Gemini OCR Processing
 * 
 * Updated to use Google's Gemini API for intelligent receipt/invoice processing
 * Based on expert recommendations for multimodal document understanding
 */

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from '@supabase/supabase-js';
import { createGeminiOCRService } from '@/lib/services/gemini-ocr-service';
import { createExpenseCategorizer } from '@/lib/services/expense-categorizer';

// Initialize Supabase client with service role key for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Transform Gemini OCR response to match existing document structure
function transformGeminiToDocumentFormat(geminiData: any, enhancedCategory: any) {
  // Create entities array compatible with existing frontend
  const entities = [
    {
      type: 'vendor_name',
      value: geminiData.vendor_name || '',
      confidence: 0.9
    },
    {
      type: 'total_amount',
      value: String(geminiData.total_amount || '0'),
      confidence: 0.9
    },
    {
      type: 'transaction_date',
      value: geminiData.transaction_date || '',
      confidence: 0.9
    },
    {
      type: 'currency',
      value: geminiData.currency || 'SGD',
      confidence: 0.9
    },
    {
      type: 'suggested_category',
      value: enhancedCategory.category,
      confidence: enhancedCategory.confidence
    }
  ];

  // Add line items to entities if present
  if (geminiData.line_items && geminiData.line_items.length > 0) {
    geminiData.line_items.forEach((item: any, index: number) => {
      entities.push({
        type: `line_item_${index + 1}`,
        value: `${item.description || ''} - ${item.amount || 0}`,
        confidence: 0.8
      });
    });
  }

  return {
    text: [
      `Vendor: ${geminiData.vendor_name || 'Unknown'}`,
      `Amount: ${geminiData.total_amount || 0} ${geminiData.currency || 'SGD'}`,
      `Date: ${geminiData.transaction_date || 'Unknown'}`,
      `Category: ${enhancedCategory.category}`,
      geminiData.description ? `Description: ${geminiData.description}` : '',
      geminiData.reasoning ? `AI Reasoning: ${geminiData.reasoning}` : ''
    ].filter(Boolean).join('\n'),
    entities,
    // Gemini-specific structured data
    document_summary: {
      vendor_name: { value: geminiData.vendor_name, confidence: 0.9 },
      total_amount: { value: String(geminiData.total_amount || '0'), confidence: 0.9 },
      currency: { value: geminiData.currency || 'SGD', confidence: 0.9 },
      transaction_date: { value: geminiData.transaction_date, confidence: 0.9 },
      suggested_category: { value: enhancedCategory.category, confidence: enhancedCategory.confidence }
    },
    line_items: geminiData.line_items || [],
    metadata: {
      pageCount: 1,
      wordCount: (geminiData.description || '').split(' ').length,
      language: 'en',
      processingMethod: 'gemini_ocr',
      confidence_score: geminiData.confidence_score,
      requires_validation: geminiData.requires_validation,
      category_reasoning: enhancedCategory.reasoning
    }
  };
}


// --- Main Trigger.dev v3 Task Definition ---

export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath: string; expenseCategory?: string }) => {
    console.log(`✅ Starting Gemini OCR process for document: ${payload.documentId}`);

    try {
      // Step 1: Fetch document record and create signed URL
      const { data: documentRecord, error: fetchError } = await supabase
        .from('documents')
        .select('file_name, file_type, file_size')
        .eq('id', payload.documentId)
        .single();

      if (fetchError || !documentRecord) {
        throw new Error(`Failed to fetch document record: ${fetchError?.message}`);
      }

      console.log(`📄 Processing document: ${documentRecord.file_name} (${documentRecord.file_type}, ${Math.round(documentRecord.file_size / 1024)}KB)`);

      // Step 2: Create signed URL for Gemini API
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(payload.imageStoragePath, 600); // 10 minutes validity

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL: ${urlError?.message}`);
      }

      const signedImageUrl = urlData.signedUrl;
      console.log("🔗 Signed URL created successfully");

      // Step 3: Download image and convert to base64 for Gemini API
      console.log("📥 Downloading image for Gemini processing...");
      const imageResponse = await fetch(signedImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const mimeType = documentRecord.file_type || 'image/jpeg';

      console.log(`🖼️ Image prepared: ${Math.round(imageBuffer.byteLength / 1024)}KB, type: ${mimeType}`);

      // Step 4: Initialize Gemini OCR service
      const geminiService = createGeminiOCRService({
        model: 'gemini-2.5-flash', // Fast and cost-effective for production
        confidenceThreshold: 0.7,
        timeoutMs: 45000, // 45 seconds for Trigger.dev context
        retryAttempts: 2
      });

      // Step 5: Process with Gemini OCR
      console.log("🤖 Processing with Gemini API...");
      const geminiResult = await geminiService.processReceipt({
        imageBase64,
        mimeType,
        documentType: payload.expenseCategory ? 'receipt' : 'invoice',
        expenseCategory: payload.expenseCategory as any
      });

      if (!geminiResult.success || !geminiResult.data) {
        throw new Error(`Gemini OCR failed: ${geminiResult.error?.error || 'Unknown error'}`);
      }

      const geminiData = geminiResult.data;
      console.log(`✅ Gemini processing completed in ${geminiResult.processing_time_ms}ms`);
      console.log(`📊 Confidence: ${(geminiData.confidence_score * 100).toFixed(1)}%, Category: ${geminiData.suggested_category}`);

      // Step 6: Enhanced categorization using pattern matching
      const categorizer = createExpenseCategorizer();
      const enhancedCategory = categorizer.categorizePexpense(geminiData);
      
      console.log(`🏷️ Enhanced categorization: ${enhancedCategory.category} (${(enhancedCategory.confidence * 100).toFixed(1)}% confidence)`);

      // Step 7: Transform Gemini response to match existing document structure
      const transformedResult = transformGeminiToDocumentFormat(geminiData, enhancedCategory);

      // Step 8: Update document record with results
      const { error: updateError } = await supabase.from('documents').update({
        processing_status: 'completed',
        extracted_data: transformedResult,
        confidence_score: geminiData.confidence_score,
        processed_at: new Date().toISOString(),
        error_message: null,
        // Store Gemini-specific metadata
        processing_metadata: {
          gemini_model: geminiData.processing_metadata?.model_used,
          processing_time_ms: geminiResult.processing_time_ms,
          requires_validation: geminiData.requires_validation,
          category_suggestion: {
            original: geminiData.suggested_category,
            enhanced: enhancedCategory.category,
            confidence: enhancedCategory.confidence
          }
        }
      }).eq('id', payload.documentId);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`✅ Document ${payload.documentId} processed successfully`);
      
      return { 
        success: true, 
        documentId: payload.documentId, 
        confidence: geminiData.confidence_score,
        category: enhancedCategory.category,
        requiresValidation: geminiData.requires_validation,
        processingTime: geminiResult.processing_time_ms
      };

    } catch (error) {
      console.error("❌ Gemini OCR process failed:", error);
      
      // Update document status to failed
      await supabase.from('documents').update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed',
        processed_at: new Date().toISOString()
      }).eq('id', payload.documentId);
      
      throw error;
    }
  },
});