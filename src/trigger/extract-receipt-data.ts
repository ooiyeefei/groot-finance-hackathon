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

// Security validation functions
function validateImageUrl(url: string): { isValid: boolean; error?: string; sanitizedUrl?: string } {
  try {
    const parsedUrl = new URL(url);

    // Allow only HTTPS URLs
    if (parsedUrl.protocol !== 'https:') {
      return { isValid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Allow only Supabase storage URLs for signed URLs
    const allowedHosts = [
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('http://', ''),
      // Add other allowed storage providers if needed
    ].filter(Boolean);

    const hostname = parsedUrl.hostname;
    const isAllowedHost = allowedHosts.some(host =>
      hostname === host || hostname.endsWith(`.${host}`) || hostname.endsWith('.supabase.co')
    );

    if (!isAllowedHost) {
      return { isValid: false, error: 'URL host not allowed for security reasons' };
    }

    return { isValid: true, sanitizedUrl: url };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

function sanitizeBusinessCategories(categories: any[]): any[] {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories.map(cat => ({
    category_name: sanitizeTextInput(cat?.category_name || ''),
    category_code: sanitizeTextInput(cat?.category_code || ''),
    vendor_patterns: Array.isArray(cat?.vendor_patterns)
      ? cat.vendor_patterns.map((p: any) => sanitizeTextInput(String(p || ''))).slice(0, 10)
      : [],
    ai_keywords: Array.isArray(cat?.ai_keywords)
      ? cat.ai_keywords.map((k: any) => sanitizeTextInput(String(k || ''))).slice(0, 10)
      : [],
    is_active: Boolean(cat?.is_active)
  })).slice(0, 50); // Limit to 50 categories max
}

function sanitizeTextInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes, control characters, and limit length
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[`$\\]/g, '') // Remove shell metacharacters
    .trim()
    .substring(0, 1000); // Limit length
}

function sanitizeProcessingMethod(method: string): 'simple' | 'complex' | 'auto' {
  const allowedMethods = ['simple', 'complex', 'auto'];
  return allowedMethods.includes(method) ? method as any : 'auto';
}

function sanitizeUuid(uuid?: string): string | undefined {
  if (!uuid || typeof uuid !== 'string') {
    return undefined;
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid) ? uuid : undefined;
}

function maskSensitiveData(data: string): string {
  if (!data || typeof data !== 'string') {
    return '[REDACTED]';
  }

  // Show only first 3 characters for debugging while protecting sensitive data
  return data.length > 3 ? `${data.substring(0, 3)}***` : '***';
}

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

            // Log category count without exposing sensitive business data
            if (businessCategories.length > 0) {
              console.log(`🏷️ Categories available for AI categorization: ${businessCategories.length} active categories`);
            }
          } else {
            console.log(`⚠️ No custom expense categories found for business ${expenseClaim.business_id}`);
          }
        }
      }

      // Step 2: Create signed URL for secure image access with validation and timeout handling
      let imageUrl = payload.receiptImageUrl;

      if (!imageUrl && expenseClaim?.storage_path) {
        // Use converted image path for PDFs or original storage path for images
        const imagePath = expenseClaim.converted_image_path || expenseClaim.storage_path;

        console.log(`🔗 Attempting to create signed URL for path: ${imagePath}`);

        try {
          // Step 2a: First verify the file actually exists in storage to prevent hanging
          console.log(`🔍 Verifying file exists in storage before creating signed URL...`);

          // Extract folder path and filename for file existence check
          const pathParts = imagePath.split('/');
          const fileName = pathParts.pop();
          const folderPath = pathParts.join('/');

          // Check if file exists with a reasonable timeout
          const listTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage list operation timed out after 30 seconds')), 30000)
          );

          const listOperation = supabase.storage
            .from('expense_claims')
            .list(folderPath, {
              limit: 1000,
              search: fileName
            });

          const { data: files, error: listError } = await Promise.race([
            listOperation,
            listTimeoutPromise
          ]) as any;

          if (listError) {
            console.error(`❌ File existence check failed: ${listError.message}`);
            throw new Error(`Unable to verify file exists in storage: ${listError.message}`);
          }

          if (!files || files.length === 0) {
            console.error(`❌ File not found in storage: ${imagePath}`);
            throw new Error(`Receipt file not found in storage at path: ${imagePath}. The file may not have been uploaded correctly or may have been moved.`);
          }

          console.log(`✅ File verified to exist: ${files[0].name} (${files[0].metadata?.size || 'unknown size'})`);

          // Step 2b: Create signed URL with timeout protection
          console.log(`🔗 Creating signed URL with timeout protection...`);

          const signedUrlTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Signed URL creation timed out after 20 seconds')), 20000)
          );

          const signedUrlOperation = supabase.storage
            .from('expense_claims')
            .createSignedUrl(imagePath, 600); // 10 minutes

          const { data: urlData, error: urlError } = await Promise.race([
            signedUrlOperation,
            signedUrlTimeoutPromise
          ]) as any;

          if (urlError) {
            console.error(`❌ Signed URL creation failed: ${urlError.message}`);
            throw new Error(`Failed to create signed URL: ${urlError.message}`);
          }

          if (!urlData?.signedUrl) {
            console.error(`❌ Signed URL creation returned no data`);
            throw new Error('Signed URL creation returned no data');
          }

          imageUrl = urlData.signedUrl;
          console.log(`✅ Signed URL created successfully`);

        } catch (storageError) {
          console.error(`❌ Storage access error:`, storageError);

          // Enhanced error handling for storage issues
          let storageErrorMessage = 'Unable to access receipt file in storage.';

          if (storageError instanceof Error) {
            if (storageError.message.includes('timed out')) {
              storageErrorMessage = 'Storage access timed out. Please try again in a few moments.';
            } else if (storageError.message.includes('not found')) {
              storageErrorMessage = 'Receipt file not found. Please re-upload your receipt.';
            } else if (storageError.message.includes('permission') || storageError.message.includes('unauthorized')) {
              storageErrorMessage = 'Permission denied accessing receipt file. Please contact support.';
            } else {
              storageErrorMessage = `Storage error: ${storageError.message}`;
            }
          }

          throw new Error(storageErrorMessage);
        }
      }

      if (!imageUrl && !payload.receiptImageData) {
        throw new Error('No image URL or image data available for processing');
      }

      // Step 3: Input validation and sanitization before Python execution
      console.log("🔒 Validating and sanitizing inputs...");

      // Validate and sanitize image URL for SSRF protection
      if (imageUrl) {
        const urlValidation = validateImageUrl(imageUrl);
        if (!urlValidation.isValid) {
          throw new Error(`Invalid image URL: ${urlValidation.error}`);
        }
        imageUrl = urlValidation.sanitizedUrl;
      }

      // Sanitize text inputs to prevent injection
      const sanitizedParams = {
        imageUrl: imageUrl,
        imageData: payload.receiptImageData,
        businessCategories: sanitizeBusinessCategories(businessCategories),
        receiptText: sanitizeTextInput(payload.receiptText || ''),
        forcedProcessingMethod: sanitizeProcessingMethod(payload.forcedProcessingMethod || 'auto'),
        expenseClaimId: sanitizeUuid(payload.expenseClaimId)
      };

      // Step 4: Run AI extraction using Python script
      console.log("🐍 Running AI extraction...");

      let result: any;

      try {
        const pythonPromise = python.runScript(
          "./src/python/extract_receipt_data.py",
          [JSON.stringify(sanitizedParams)],
          {
            timeout: 180000, // 3 minutes
            env: {
              GEMINI_API_KEY: process.env.GEMINI_API_KEY
            }
          }
        );

        result = await pythonPromise;

        console.log("✅ Python script execution completed");
      } catch (pythonError: any) {
        console.error("❌ Python execution failed:", pythonError);

        // Enhanced error categorization and user-friendly messages
        let userFriendlyError = '';
        let errorCategory = 'unknown';

        if (pythonError.code === 'ENOENT') {
          // Python environment not found
          errorCategory = 'environment';
          userFriendlyError = 'AI processing service is not properly configured. Please contact support to resolve this issue.';
          console.error('❌ Python environment missing - ENOENT error. Virtual environment may not be activated or Python not installed.');
        } else if (pythonError.message?.includes('timeout') || pythonError.message?.includes('AbortError') || pythonError.message?.includes('maxDuration') || pythonError.code === 'ETIMEDOUT') {
          // Processing timeout - more comprehensive detection
          errorCategory = 'timeout';
          userFriendlyError = 'Receipt processing timed out after 3 minutes. This usually happens with very complex receipts or during high server load. Please try uploading a clearer, simpler image or try again later.';
        } else if (pythonError.message?.includes('spawn') || pythonError.message?.includes('python')) {
          // Python execution issues
          errorCategory = 'execution';
          userFriendlyError = 'Unable to start AI processing. Please try again in a few moments or contact support if the issue persists.';
        } else if (pythonError.message?.includes('memory') || pythonError.message?.includes('resource')) {
          // Resource issues
          errorCategory = 'resource';
          userFriendlyError = 'Processing resources are temporarily unavailable. Please try again in a few moments.';
        } else {
          // General execution error
          errorCategory = 'execution';
          userFriendlyError = 'An unexpected error occurred during AI processing. Please try uploading your receipt again.';
        }

        // Update expense claim with detailed failure information
        if (payload.expenseClaimId) {
          const failureMetadata = {
            extraction_method: 'ai',
            extraction_timestamp: new Date().toISOString(),
            ai_processing_status: 'failed',
            processing_status: 'failed', // ✅ Also set this for ProcessingStep compatibility
            error_category: errorCategory,
            error_code: pythonError.code || (errorCategory === 'timeout' ? 'TIMEOUT_ERROR' : 'UNKNOWN'),
            error_message: userFriendlyError,
            technical_error: pythonError.message || pythonError.toString(),
            failed_at: new Date().toISOString(),
            processing_stage: 'python_execution',
            timeout_duration: errorCategory === 'timeout' ? '180 seconds' : undefined
          };

          await supabase
            .from('expense_claims')
            .update({
              status: 'failed',
              processing_metadata: failureMetadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', payload.expenseClaimId);

          console.log(`❌ Expense claim ${payload.expenseClaimId} marked as failed due to ${errorCategory} error`);
        }

        throw new Error(userFriendlyError);
      }

      // Step 4: Parse Python script result
      console.log("🔍 Parsing Python extraction result...");

      let pythonResult: any;
      if (result && typeof result === 'object' && 'stdout' in result) {
        try {
          // Parse JSON output from Python script
          const stdout = (result as any).stdout.trim();
          if (!stdout) {
            throw new Error('Empty output from AI processing script');
          }
          pythonResult = JSON.parse(stdout);
        } catch (parseError) {
          console.error(`❌ Failed to parse Python JSON output:`, parseError);
          console.log(`📄 Stdout length: ${(result as any).stdout?.length || 0} characters (content redacted for security)`);

          // Update expense claim with parsing failure
          if (payload.expenseClaimId) {
            const parseFailureMetadata = {
              extraction_method: 'ai',
              extraction_timestamp: new Date().toISOString(),
              ai_processing_status: 'failed',
              error_category: 'parsing_error',
              error_code: 'JSON_PARSE_FAILED',
              error_message: 'AI processing returned invalid data format. Please try uploading the receipt again.',
              technical_error: parseError instanceof Error ? parseError.message : parseError?.toString(),
              failed_at: new Date().toISOString(),
              processing_stage: 'python_result_parsing',
              raw_stdout: (result as any).stdout?.substring(0, 1000) // First 1000 chars for debugging
            };

            await supabase
              .from('expense_claims')
              .update({
                status: 'failed',
                processing_metadata: parseFailureMetadata,
                updated_at: new Date().toISOString()
              })
              .eq('id', payload.expenseClaimId);

            console.log(`❌ Expense claim ${payload.expenseClaimId} marked as failed due to parsing error`);
          }

          throw new Error('AI processing returned invalid data format. Please try uploading the receipt again.');
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

      console.log(`✅ AI extraction successful for claim ${payload.expenseClaimId}`);

      // Log extraction summary without sensitive data
      console.log("📊 Extraction Results Summary:");
      console.log(`🏪 Vendor: ${maskSensitiveData(extractionResult.vendor_name)}`);
      console.log(`💰 Amount: [REDACTED] ${extractionResult.currency}`);
      console.log(`🗓️ Date: ${extractionResult.transaction_date}`);
      console.log(`📄 Receipt #: ${extractionResult.receipt_number ? '[PRESENT]' : 'N/A'}`);
      console.log(`🎯 Confidence: ${(extractionResult.confidence_score * 100).toFixed(1)}%`);
      console.log(`⚡ Processing time: ${pythonResult.processing_time_ms}ms`);
      if (extractionResult.line_items?.length > 0) {
        console.log(`📋 Line items: ${extractionResult.line_items.length} items extracted`);
        // Don't log detailed line item contents to prevent data leakage
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

        // Log audit event without sensitive data
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
              vendor_masked: maskSensitiveData(extractionResult.vendor_name),
              amount_present: !!extractionResult.total_amount,
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

      // Enhanced error categorization for better user experience
      let userFriendlyError = '';
      let errorCategory = 'general_failure';
      let errorCode = 'UNKNOWN';

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Categorize different types of errors
        if (errorMessage.includes('no image url') || errorMessage.includes('no image data')) {
          errorCategory = 'missing_image';
          userFriendlyError = 'No receipt image found to process. Please ensure the receipt was uploaded correctly.';
          errorCode = 'MISSING_IMAGE_DATA';
        } else if (errorMessage.includes('failed to create signed url') || errorMessage.includes('storage')) {
          errorCategory = 'storage_access';
          userFriendlyError = 'Unable to access the uploaded receipt. Please try uploading the receipt again.';
          errorCode = 'STORAGE_ACCESS_ERROR';
        } else if (errorMessage.includes('expense claim not found')) {
          errorCategory = 'data_integrity';
          userFriendlyError = 'Expense claim record not found. Please refresh the page and try again.';
          errorCode = 'CLAIM_NOT_FOUND';
        } else if (errorMessage.includes('failed to update expense claim')) {
          errorCategory = 'database_update';
          userFriendlyError = 'Failed to save processed data. Please try again or contact support if the issue persists.';
          errorCode = 'DATABASE_UPDATE_ERROR';
        } else if (errorMessage.includes('no extraction data returned')) {
          errorCategory = 'empty_result';
          userFriendlyError = 'AI processing completed but no data was extracted. Please try uploading a clearer receipt image.';
          errorCode = 'EMPTY_EXTRACTION_RESULT';
        } else if (errorMessage.includes('ai processing returned invalid data format')) {
          errorCategory = 'parsing_error';
          userFriendlyError = 'AI processing returned invalid data format. Please try uploading the receipt again.';
          errorCode = 'INVALID_DATA_FORMAT';
        } else if (errorMessage.includes('unable to extract data from this receipt')) {
          errorCategory = 'extraction_failure';
          userFriendlyError = 'Unable to extract data from this receipt. Please try uploading a clearer image or contact support.';
          errorCode = 'EXTRACTION_FAILED';
        } else {
          // General error fallback
          errorCategory = 'general_failure';
          userFriendlyError = 'An unexpected error occurred during receipt processing. Please try again or contact support if the issue persists.';
          errorCode = 'GENERAL_ERROR';
        }
      } else {
        // Non-Error objects
        userFriendlyError = 'An unexpected system error occurred. Please try again or contact support.';
      }

      // Smart failure handling based on processing context
      if (payload.expenseClaimId) {
        // Re-fetch expense claim data if not available (fallback for edge cases)
        if (!expenseClaim) {
          try {
            const { data: fetchedClaim } = await supabase
              .from('expense_claims')
              .select('processing_metadata, vendor_name, total_amount, status')
              .eq('id', payload.expenseClaimId)
              .single();
            expenseClaim = fetchedClaim;
          } catch (fetchError) {
            console.error('Failed to re-fetch expense claim data:', fetchError);
            // Continue with null expenseClaim
          }
        }

        // Check if this claim has previous successful processing data
        const hasPreviousData = expenseClaim && (
          (expenseClaim.processing_metadata?.extraction_method === 'ai' && expenseClaim.processing_metadata?.extraction_timestamp) ||
          (expenseClaim.vendor_name && expenseClaim.total_amount > 0) ||
          expenseClaim.status === 'draft' // Already had some form data
        );

        console.log(`🔍 Processing failure context - Has previous data: ${hasPreviousData}`);
        console.log(`🔍 Error category: ${errorCategory}, Error code: ${errorCode}`);

        const failureMetadata = {
          extraction_method: 'ai',
          extraction_timestamp: new Date().toISOString(),
          ai_processing_status: 'failed',
          error_category: errorCategory,
          error_code: errorCode,
          error_message: userFriendlyError,
          technical_error: error instanceof Error ? error.message : error?.toString(),
          failed_at: new Date().toISOString(),
          processing_stage: 'general_execution',
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

        try {
          await supabase
            .from('expense_claims')
            .update({
              status: targetStatus,
              processing_metadata: failureMetadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', payload.expenseClaimId);

          console.log(logMessage);
        } catch (updateError) {
          console.error('Failed to update expense claim with failure metadata:', updateError);
          // Continue to throw original error even if update fails
        }
      }

      // Throw user-friendly error for better UI experience
      throw new Error(userFriendlyError || (error instanceof Error ? error.message : 'Unknown error occurred'));
    }
  },
});