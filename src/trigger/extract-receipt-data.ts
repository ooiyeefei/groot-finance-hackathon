/**
 * Trigger.dev Task: Extract Receipt Data
 *
 * Advanced receipt processing using DSPy framework with Gemini 2.5 Flash
 * Follows extract tasks architecture pattern: Node.js creates signed URLs, Python script handles downloads
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
    console.log(`🚀 Starting DSPy receipt extraction`);
    console.log(`📝 Receipt text length: ${payload.receiptText?.length || 0} chars`);
    console.log(`🖼️ Image URL provided: ${!!payload.receiptImageUrl}`);
    console.log(`📄 Document ID: ${payload.documentId}`);
    console.log(`💰 Expense Claim ID: ${payload.expenseClaimId}`);
    console.log(`🔍 Request ID: ${payload.requestId}`);

    // Route to correct table based on domain (fallback to 'invoices' for backward compatibility)
    const documentDomain = payload.documentDomain || 'invoices';
    const tableName = DOMAIN_TABLE_MAP[documentDomain];
    console.log(`🔍 Using table: ${tableName} for domain: ${documentDomain}`);

    try {
      // Step 1: Fetch business categories for enhanced categorization (if expense claim provided)
      let businessCategories: any[] = [];
      let expenseClaim: any = null;

      if (payload.expenseClaimId) {
        console.log(`🏢 Fetching business expense categories for enhanced DSPy categorization`);

        // Get the expense claim and its business_id
        const { data: fetchedExpenseClaim, error: fetchError } = await supabase
          .from('expense_claims')
          .select('id, accounting_entry_id, business_id, storage_path, converted_image_path, file_name')
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
            console.log(`🏷️ Found ${businessCategories.length} enabled expense categories for categorization`);

            // Log categories overview like invoice processing
            if (businessCategories.length > 0) {
              const categoriesOverview = businessCategories
                .map(cat => `${cat.category_code.toUpperCase()}: ${cat.category_name}`)
                .join(', ');
              console.log(`🏷️ Expense Categories Overview: ${categoriesOverview}`);

              const totalKeywords = businessCategories.reduce((sum: number, cat: any) =>
                sum + (cat.ai_keywords?.length || 0), 0);
              const totalVendorPatterns = businessCategories.reduce((sum: number, cat: any) =>
                sum + (cat.vendor_patterns?.length || 0), 0);
              console.log(`🤖 AI Processing: ${businessCategories.length} expense categories (${totalKeywords} keywords, ${totalVendorPatterns} vendor patterns) sent to DSPy AI`);
            }
          } else {
            console.log(`⚠️ No custom expense categories found for business ${expenseClaim.business_id}`);
          }
        }
      }

      // Step 2: Create signed URL for secure image access (following extract tasks pattern)
      let imageUrl = payload.receiptImageUrl;

      if (!imageUrl && expenseClaim?.storage_path) {
        // Determine which path to use: converted_image_path (for PDFs) or storage_path (for images)
        const imagePath = expenseClaim.converted_image_path || expenseClaim.storage_path;
        console.log(`🖼️ Using image storage path: ${imagePath}`);
        console.log(`📄 Document type: ${expenseClaim.file_name?.includes('.pdf') ? 'application/pdf' : 'image'}, has converted path: ${!!expenseClaim.converted_image_path}`);

        const { data: urlData, error: urlError } = await supabase.storage
          .from('expense_claims')
          .createSignedUrl(imagePath, 600); // 10 minutes

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL: ${urlError?.message}`);
        }

        imageUrl = urlData.signedUrl;
        console.log(`🔗 Created signed URL for expense receipt processing`);
      }

      if (!imageUrl && !payload.receiptImageData) {
        throw new Error('No image URL or image data available for DSPy processing');
      }

      // Step 3: Run DSPy extraction using Python script (following extract tasks pattern)
      console.log("🐍 Running DSPy extraction with Python script...");

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

      // Step 4: Parse the result from Python script output (following extract tasks pattern)
      console.log("🐍 DSPy extraction completed");
      console.log("🔍 Raw Python result type:", typeof result);
      console.log("🔍 Raw Python result length:", result ? JSON.stringify(result).length : 0);

      // Log raw Python result like invoice processing
      console.log("🔍 Raw Python result:", JSON.stringify(result, null, 2));

      let pythonResult: any;
      if (result && typeof result === 'object' && 'stdout' in result) {
        try {
          // Parse stdout directly as JSON since our Python script outputs clean JSON
          const stdout = (result as any).stdout.trim();
          pythonResult = JSON.parse(stdout);
          console.log(`✅ Successfully parsed Python JSON output`);
          console.log("🔍 Debug - finalExtractionData value:", pythonResult);
        } catch (parseError) {
          console.error(`❌ Failed to parse Python JSON output:`, parseError);
          console.log(`📄 Raw stdout for debugging:`, (result as any).stdout);

          throw new Error('DSPy processing encountered an unexpected format error. Please try uploading the receipt again.');
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
        throw new Error('No extraction data returned from DSPy processing');
      }

      console.log(`✅ DSPy extraction successful: ${extractionResult.vendor_name}, ${extractionResult.total_amount} ${extractionResult.currency}`);

      // Log full extracted data like invoice processing
      console.log("📊 Full DSPy Extraction Results:");
      console.log(`🏪 Vendor: ${extractionResult.vendor_name}`);
      console.log(`💰 Amount: ${extractionResult.total_amount} ${extractionResult.currency}`);
      console.log(`🗓️ Date: ${extractionResult.transaction_date}`);
      console.log(`📄 Receipt #: ${extractionResult.receipt_number || 'N/A'}`);
      console.log(`🎯 Confidence: ${(extractionResult.confidence_score * 100).toFixed(1)}%`);
      console.log(`⚡ Processing time: ${pythonResult.processing_time_ms}ms`);
      console.log(`🧠 Model used: ${extractionResult.model_used || 'gemini-2.0-flash-exp'}`);
      console.log(`🔧 Backend: ${extractionResult.backend_used || 'gemini_dspy'}`);
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
        // Ensure processing status is set to 'processing' at start
        console.log(`🔄 Ensuring processing status is set to 'processing' for claim ${payload.expenseClaimId}`);
        await supabase
          .from('expense_claims')
          .update({
            processing_status: 'processing',
            processing_started_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);

        console.log(`💰 Updating expense claim ${payload.expenseClaimId} with DSPy extraction metadata`);

        if (!expenseClaim) {
          throw new Error(`Expense claim not found - was not fetched in Step 1: ${payload.expenseClaimId}`);
        }

        // Auto-categorize based on DSPy suggestion first, then vendor patterns
        let autoCategory = null;
        console.log(`🎯 Starting auto-categorization for vendor: ${extractionResult.vendor_name}`);

        if (businessCategories.length > 0) {
          // PRIORITY 1: Use DSPy's AI suggestion if available
          if (extractionResult.suggested_category) {
            console.log(`🤖 DSPy suggested category: "${extractionResult.suggested_category}"`);

            // Find matching business category by name (case-insensitive)
            const matchedByName = businessCategories.find(cat =>
              cat.category_name?.toLowerCase() === extractionResult.suggested_category.toLowerCase()
            );

            if (matchedByName) {
              autoCategory = matchedByName.category_code;
              console.log(`✅ Matched DSPy suggestion "${extractionResult.suggested_category}" to category: ${matchedByName.category_name} (${matchedByName.category_code})`);
            } else {
              console.log(`⚠️ DSPy suggestion "${extractionResult.suggested_category}" not found in business categories`);
            }
          }

          // PRIORITY 2: Fallback to vendor/keyword matching if no DSPy match
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
                console.log(`✅ Matched vendor pattern "${vendorPatterns.find((p: string) => vendor_lower.includes(p.toLowerCase()))}" to category: ${category.category_name} (${category.category_code})`);
                break;
              }

              // Check AI keywords
              if (aiKeywords.some((keyword: string) => vendor_lower.includes(keyword.toLowerCase()))) {
                autoCategory = category.category_code;
                console.log(`✅ Matched AI keyword "${aiKeywords.find((k: string) => vendor_lower.includes(k.toLowerCase()))}" to category: ${category.category_name} (${category.category_code})`);
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
          extraction_method: 'dspy',
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
        console.log(`💾 Updating expense claim with extracted data:`);
        console.log(`   🏪 vendor_name: ${extractionResult.vendor_name}`);
        console.log(`   💰 total_amount: ${extractionResult.total_amount} ${extractionResult.currency}`);
        console.log(`   📅 transaction_date: ${extractionResult.transaction_date}`);
        console.log(`   🎯 expense_category: ${autoCategory || businessCategories[0]?.category_code || 'other_business'}`);
        console.log(`   📝 business_purpose: ${extractionResult.business_purpose || 'Business expense'}`);
        console.log(`   📄 description: ${extractionResult.description || extractionResult.vendor_name}`);
        console.log(`   🧾 reference_number: ${extractionResult.receipt_number || 'null'}`);
        console.log(`   🎯 confidence_score: ${extractionResult.confidence_score || 'null'}`);

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

            // Update processing status
            processing_status: 'completed',
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
              extraction_method: 'dspy',
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
        processing_method: 'dspy',
        confidence_score: extractionResult.confidence_score,
        requires_validation: extractionResult.confidence_score < 0.8 || extractionResult.extraction_quality === 'low',
        document_id: payload.documentId,
        processing_time_ms: pythonResult.processing_time_ms || 0
      };

    } catch (error) {
      console.error("❌ DSPy extraction task failed:", error);

      // Update expense claim status to failed if expenseClaimId provided
      if (payload.expenseClaimId) {
        await supabase
          .from('expense_claims')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'DSPy processing failed',
            failed_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);
      }

      throw error;
    }
  },
});