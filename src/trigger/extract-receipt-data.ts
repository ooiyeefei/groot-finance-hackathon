/**
 * Trigger.dev Task: Extract Receipt Data
 *
 * AI receipt processing with Gemini 2.5 Flash
 * Node.js handles URLs, Python processes extraction
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for background processing
const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is missing');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is missing');
  }

  console.log(`🔗 Connecting to Supabase: ${supabaseUrl.substring(0, 30)}...`);

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

const supabase = createSupabaseClient();

// Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

export const extractReceiptData = task({
  id: "extract-receipt-data",
  maxDuration: 180, // 3 minutes - with vLLM fallback system
  retry: {
    maxAttempts: 1, // No retries - we have vLLM fallback internally
  },
  run: async (payload: {
    receiptText?: string;
    receiptImageData?: {
      base64: string;
      mimeType: string;
      filename: string;
    };
    receiptImageUrl?: string;
    documentId?: string;
    expenseClaimId?: string;
    userId?: string;
    imageMetadata?: {
      confidence?: number;
      quality?: 'excellent' | 'good' | 'acceptable' | 'poor';
      textLength?: number;
    };
    forcedProcessingMethod?: 'simple' | 'complex' | 'auto';
    requestId?: string;
    documentDomain?: 'invoices' | 'expense_claims';
  }) => {
    console.log(`🚀 Starting AI receipt extraction - Claim: ${payload.expenseClaimId}`);

    // Route to correct table based on domain (fallback to 'invoices' for backward compatibility)
    const documentDomain = payload.documentDomain || 'invoices';
    const tableName = DOMAIN_TABLE_MAP[documentDomain];
    console.log(`🔍 Using table: ${tableName} for domain: ${documentDomain}`);

    // Step 1: Fetch business categories for enhanced categorization (if expense claim provided)
    let businessCategories: any[] = [];
    let expenseClaim: any = null;

    try {

      if (payload.expenseClaimId) {
        console.log(`🏢 Fetching business categories for AI categorization`);

        // Get the expense claim and its business_id
        const { data: fetchedExpenseClaim, error: fetchError } = await supabase
          .from('expense_claims')
          .select('id, accounting_entry_id, business_id, storage_path, converted_image_path, file_name, processing_metadata, vendor_name, total_amount, status')
          .eq('id', payload.expenseClaimId)
          .single();

        expenseClaim = fetchedExpenseClaim;

        if (!fetchError && expenseClaim?.business_id) {
          console.log(`🏷️ Fetching business expense categories - business_id: ${expenseClaim.business_id}`);

          const { data: business, error: businessError } = await supabase
            .from('businesses')
            .select('custom_expense_categories')
            .eq('id', expenseClaim.business_id)
            .single();

          if (!businessError && business?.custom_expense_categories) {
            // Filter for ACTIVE categories only (is_active: true)
            businessCategories = business.custom_expense_categories.filter((cat: any) =>
              cat && cat.category_name && cat.is_active === true
            );
            console.log(`🏷️ Found ${businessCategories.length} active categories`);

            // Log categories fed to AI for debugging
            if (businessCategories.length > 0) {
              const categoriesOverview = businessCategories
                .map(cat => `${cat.category_code.toUpperCase()}: ${cat.category_name}`)
                .join(', ');
              console.log(`🏷️ Categories sent to AI: ${categoriesOverview}`);
            }
          } else {
            console.log(`⚠️ No custom expense categories found for business ${expenseClaim.business_id}`);
          }
        }
      }

      // Step 2: Create signed URL for secure image access (following extract tasks pattern)
      let imageUrl = payload.receiptImageUrl;

      if (!imageUrl && expenseClaim?.storage_path) {
        // Use converted image path for PDFs or original storage path for images
        const imagePath = expenseClaim.converted_image_path || expenseClaim.storage_path;

        const { data: urlData, error: urlError } = await supabase.storage
          .from('expense_claims')
          .createSignedUrl(imagePath, 600); // 10 minutes

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL: ${urlError?.message}`);
        }

        imageUrl = urlData.signedUrl;
      }

      if (!imageUrl && !payload.receiptImageData) {
        throw new Error('No image URL or image data available for processing');
      }

      // Step 3: Run AI extraction using Python script
      console.log("🐍 Running AI extraction...");

      const result = await python.runScript(
        "./src/python/extract_receipt_data.py",
        [JSON.stringify({
          imageUrl: imageUrl,
          imageData: payload.receiptImageData,
          businessCategories: businessCategories,
          receiptText: payload.receiptText || '',
          forcedProcessingMethod: payload.forcedProcessingMethod || 'auto',
          expenseClaimId: payload.expenseClaimId
        })],
        {
          timeout: 180000, // 3 minutes
        }
      );

      // Step 4: Parse Python script result
      console.log("🔍 Raw Python result:", JSON.stringify(result, null, 2));

      let pythonResult: any;
      if (result && typeof result === 'object' && 'stdout' in result) {
        try {
          // Parse JSON output from Python script
          const stdout = (result as any).stdout.trim();
          pythonResult = JSON.parse(stdout);
        } catch (parseError) {
          console.error(`❌ Failed to parse Python JSON output:`, parseError);
          console.log(`📄 Raw stdout for debugging:`, (result as any).stdout);

          throw new Error('AI processing encountered an unexpected format error. Please try uploading the receipt again.');
        }
      } else {
        pythonResult = result;
      }

      // Check if Python script returned an error
      if (pythonResult && pythonResult.success === false && pythonResult.error) {
        let userFriendlyError = 'Unable to extract data from this receipt. ';

        if (pythonResult.error.includes('API') || pythonResult.error.includes('overload')) {
          userFriendlyError += 'Our processing service is temporarily busy. Please try again in a few moments.';
        } else if (pythonResult.error.includes('timeout') || pythonResult.error.includes('hang')) {
          userFriendlyError += 'The receipt took too long to process. Please try uploading a clearer image.';
        } else if (pythonResult.error.includes('image') || pythonResult.error.includes('download')) {
          userFriendlyError += 'There was an issue accessing your receipt. Please try uploading it again.';
        } else {
          userFriendlyError += 'Please try uploading the receipt again or contact support if the issue persists.';
        }

        console.error(`❌ Technical error details:`, pythonResult.error);
        throw new Error(userFriendlyError);
      }

      // Extract the result data
      const extractionResult = pythonResult.data;
      if (!extractionResult) {
        throw new Error('No extraction data returned from AI processing');
      }

      console.log(`✅ AI extraction successful: ${extractionResult.vendor_name}, ${extractionResult.total_amount} ${extractionResult.currency}`);

      // Log full extracted data for debugging
      console.log("📊 Full Extraction Results:");
      console.log(`🏪 Vendor: ${extractionResult.vendor_name}`);
      console.log(`💰 Amount: ${extractionResult.total_amount} ${extractionResult.currency}`);
      console.log(`🗓️ Date: ${extractionResult.transaction_date}`);
      console.log(`📄 Receipt #: ${extractionResult.receipt_number || 'N/A'}`);
      console.log(`🎯 Confidence: ${(extractionResult.confidence_score * 100).toFixed(1)}%`);
      console.log(`⚡ Processing time: ${pythonResult.processing_time_ms}ms`);
      if (extractionResult.line_items?.length > 0) {
        console.log(`📋 Line items: ${extractionResult.line_items.length} items`);
        extractionResult.line_items.slice(0, 3).forEach((item: any, idx: number) => {
          console.log(`   ${idx + 1}. ${item.description}: ${item.quantity}x${item.unit_price} = ${item.line_total}`);
        });
        if (extractionResult.line_items.length > 3) {
          console.log(`   ... and ${extractionResult.line_items.length - 3} more items`);
        }
      }

      // Step 5: Update expense claim with extracted metadata (NO accounting_entries creation)
      if (payload.expenseClaimId) {
        // Ensure processing status is set to 'analyzing' at start ✅ Unified status
        console.log(`🔄 Ensuring unified status is set to 'analyzing' for claim ${payload.expenseClaimId}`);
        await supabase
          .from('expense_claims')
          .update({
            status: 'analyzing', // ✅ Unified status field
            processing_started_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);

        console.log(`💰 Updating expense claim ${payload.expenseClaimId} with extraction metadata`);

        if (!expenseClaim) {
          throw new Error(`Expense claim not found - was not fetched in Step 1: ${payload.expenseClaimId}`);
        }

        // Auto-categorize based on AI suggestion, then vendor patterns
        let autoCategory = null;
        console.log(`🎯 Starting auto-categorization for vendor: ${extractionResult.vendor_name}`);

        if (businessCategories.length > 0) {
          // PRIORITY 1: Use AI suggested category if available
          if (extractionResult.suggested_category) {
            console.log(`🤖 AI suggested category: "${extractionResult.suggested_category}"`);

            const matchedByName = businessCategories.find(cat =>
              cat.category_name?.toLowerCase() === extractionResult.suggested_category.toLowerCase()
            );

            if (matchedByName) {
              autoCategory = matchedByName.category_code;
              console.log(`✅ Matched AI suggestion "${extractionResult.suggested_category}" to category: ${matchedByName.category_name} (${matchedByName.category_code})`);
            } else {
              console.log(`⚠️ AI suggestion "${extractionResult.suggested_category}" not found in business categories`);
            }
          }

          // PRIORITY 2: Fallback to vendor/keyword matching
          if (!autoCategory) {
            const vendor_lower = extractionResult.vendor_name.toLowerCase();
            console.log(`🔍 Checking vendor "${vendor_lower}" against ${businessCategories.length} active categories`);

            // Use business-specific vendor patterns and keywords
            for (const category of businessCategories) {
              const vendorPatterns = category.vendor_patterns || [];
              const aiKeywords = category.ai_keywords || [];

              // Check vendor patterns first
              if (vendorPatterns.some((pattern: string) => vendor_lower.includes(pattern.toLowerCase()))) {
                autoCategory = category.category_code;
                console.log(`✅ Matched vendor pattern to category: ${category.category_name} (${category.category_code})`);
                break;
              }

              // Check AI keywords
              if (aiKeywords.some((keyword: string) => vendor_lower.includes(keyword.toLowerCase()))) {
                autoCategory = category.category_code;
                console.log(`✅ Matched AI keyword to category: ${category.category_name} (${category.category_code})`);
                break;
              }
            }
          }

          if (!autoCategory) {
            console.log(`⚠️ No category match found - will use first active category: ${businessCategories[0]?.category_code || 'other_business'}`);
          }
        } else {
          console.log(`⚠️ No active business categories available - will use fallback: other_business`);
        }

        // Create extraction metadata for storage
        const extractionMetadata = {
          extraction_method: 'ai',
          extraction_timestamp: new Date().toISOString(),
          confidence_score: extractionResult.confidence_score,
          processing_time_ms: pythonResult.processing_time_ms,
          model_used: extractionResult.model_used || 'gemini-2.0-flash-exp',
          backend_used: extractionResult.backend_used || 'gemini_dspy',

          financial_data: {
            description: extractionResult.vendor_name,
            vendor_name: extractionResult.vendor_name,
            total_amount: extractionResult.total_amount,
            original_currency: extractionResult.currency,
            home_currency: extractionResult.currency,
            home_currency_amount: extractionResult.total_amount,
            exchange_rate: 1.0,
            transaction_date: extractionResult.transaction_date,
            reference_number: extractionResult.receipt_number || null,
            subtotal_amount: extractionResult.subtotal_amount || null,
            tax_amount: extractionResult.tax_amount || null
          },

          line_items: extractionResult.line_items || [],

          raw_extraction: {
            ...extractionResult,
            thinking: pythonResult.thinking || {}
          }
        };

        // Update expense claim with extracted metadata
        console.log(`💾 Final category determined: ${autoCategory || businessCategories[0]?.category_code || 'other_business'}`);
        console.log(`💾 Updating expense claim ${payload.expenseClaimId} with extraction data`);

        const { error: updateError } = await supabase
          .from('expense_claims')
          .update({
            // Update basic fields for UI convenience
            vendor_name: extractionResult.vendor_name,
            total_amount: extractionResult.total_amount,
            currency: extractionResult.currency,
            transaction_date: extractionResult.transaction_date,
            expense_category: autoCategory || businessCategories[0]?.category_code || 'other_business', // Use first active category as fallback
            business_purpose: extractionResult.business_purpose || 'Business expense',
            description: extractionResult.description || extractionResult.vendor_name,
            reference_number: extractionResult.receipt_number || null,
            confidence_score: extractionResult.confidence_score || null,

            // Currency fields (no conversion, same as original)
            home_currency: extractionResult.currency,
            home_currency_amount: extractionResult.total_amount,
            exchange_rate: 1.0,

            // Store all metadata in processing_metadata JSONB field
            processing_metadata: extractionMetadata,

            // ✅ Key change: OCR completion goes to 'draft' for user review
            status: 'draft', // User can now edit and submit when ready
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);

        if (updateError) {
          console.error('Failed to update expense claim:', updateError);
          throw new Error(`Failed to update expense claim: ${updateError.message}`);
        }

        console.log(`✅ Expense claim ${payload.expenseClaimId} updated successfully`);

        // Log audit event
        await supabase
          .from('audit_events')
          .insert({
            business_id: expenseClaim.business_id,
            actor_user_id: payload.userId,
            event_type: 'expense_claim.extraction_completed',
            target_entity_type: 'expense_claim',
            target_entity_id: payload.expenseClaimId,
            details: {
              extraction_method: 'ai',
              vendor: extractionResult.vendor_name,
              amount: extractionResult.total_amount,
              currency: extractionResult.currency,
              category: autoCategory,
              line_items_count: extractionResult.line_items?.length || 0,
              confidence_score: extractionResult.confidence_score,
              processing_time_ms: pythonResult.processing_time_ms
            }
          });
      }

      return {
        success: true,
        data: extractionResult,
        processing_method: 'ai',
        confidence_score: extractionResult.confidence_score,
        requires_validation: extractionResult.confidence_score < 0.8 || extractionResult.extraction_quality === 'low',
        document_id: payload.documentId,
        processing_time_ms: pythonResult.processing_time_ms || 0
      };

    } catch (error) {
      console.error("❌ AI extraction task failed:", error);

      // Smart failure handling based on processing context
      if (payload.expenseClaimId) {
        // Re-fetch expense claim data if not available (fallback for edge cases)
        if (!expenseClaim) {
          const { data: fetchedClaim } = await supabase
            .from('expense_claims')
            .select('processing_metadata, vendor_name, total_amount, status')
            .eq('id', payload.expenseClaimId)
            .single();
          expenseClaim = fetchedClaim;
        }

        // Check if this claim has previous successful processing data
        const hasPreviousData = expenseClaim && (
          (expenseClaim.processing_metadata?.extraction_method === 'ai' && expenseClaim.processing_metadata?.extraction_timestamp) ||
          (expenseClaim.vendor_name && expenseClaim.total_amount > 0) ||
          expenseClaim.status === 'draft' // Already had some form data
        );

        console.log(`🔍 Processing failure context - Has previous data: ${hasPreviousData}`);

        const failureMetadata = {
          extraction_method: 'ai',
          extraction_timestamp: new Date().toISOString(),
          ai_processing_status: 'failed',
          error_message: error instanceof Error ? error.message : 'AI processing failed',
          failed_at: new Date().toISOString(),
          processing_type: hasPreviousData ? 'reprocessing' : 'initial_processing'
        };

        // Smart status determination
        let targetStatus: string;
        let logMessage: string;

        if (hasPreviousData) {
          // Reprocessing scenario: Keep form editable by returning to draft
          targetStatus = 'draft';
          logMessage = `🔄 Expense claim ${payload.expenseClaimId} returned to draft status after reprocessing failure (has previous data)`;
        } else {
          // First-time processing scenario: Mark as failed since no fallback data exists
          targetStatus = 'failed';
          logMessage = `❌ Expense claim ${payload.expenseClaimId} marked as failed after initial processing failure (no previous data)`;
        }

        await supabase
          .from('expense_claims')
          .update({
            status: targetStatus,
            processing_metadata: failureMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);

        console.log(logMessage);
      }

      throw error;
    }
  },
});