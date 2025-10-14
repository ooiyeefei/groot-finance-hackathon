/**
 * Gemini OCR Service
 * Core service for processing receipt/invoice images using Google's Gemini API
 * Based on expert recommendations for multimodal image understanding
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai'
import { 
  GeminiOCRRequest, 
  GeminiOCRResponse, 
  GeminiOCRError, 
  GeminiProcessingResult,
  GeminiOCRConfig,
  ExpensePromptConfig
} from '@/domains/invoices/types/gemini-ocr'
import { ExpenseCategory } from '@/domains/expense-claims/types'
import { 
  DocumentType, 
  IndustryContext, 
  DOCUMENT_SCHEMAS, 
  KNOWN_VENDOR_PATTERNS,
  EnhancedExtractionResponse 
} from '@/domains/invoices/types/enhanced-document-types'

export class GeminiOCRService {
  private genAI: GoogleGenAI
  private config: GeminiOCRConfig

  constructor(apiKey: string, config: Partial<GeminiOCRConfig> = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    this.genAI = new GoogleGenAI({ apiKey })
    this.config = {
      model: 'gemini-2.5-flash',
      timeoutMs: 60000, // Increased to 60 seconds for complex documents
      retryAttempts: 3,
      confidenceThreshold: 0.7,
      temperature: 0.1, // Low temperature for consistent extraction
      ...config
    }
  }

  /**
   * Process receipt/invoice image and extract structured expense data
   */
  async processReceipt(request: GeminiOCRRequest): Promise<GeminiProcessingResult> {
    const startTime = Date.now()

    try {
      console.log(`[Gemini OCR] 🚀 Starting processing: ${request.documentType} with model ${this.config.model}`)
      console.log(`[Gemini OCR] Request validation:`, {
        hasImageData: !!request.imageBase64,
        imageSize: request.imageBase64 ? `${Math.round(Buffer.from(request.imageBase64, 'base64').length / 1024)}KB` : 'N/A',
        mimeType: request.mimeType,
        documentType: request.documentType,
        timestamp: new Date().toISOString()
      })

      // Enhanced input validation
      if (!request.imageBase64 || request.imageBase64.trim().length === 0) {
        console.error('[Gemini OCR] ❌ Invalid request: Empty image data')
        return {
          success: false,
          error: {
            error: 'Empty or invalid image data provided',
            error_type: 'invalid_input',
            debug_info: {
              hasImageBase64: !!request.imageBase64,
              imageBase64Length: request.imageBase64?.length || 0
            }
          },
          processing_time_ms: Date.now() - startTime
        }
      }

      if (!request.mimeType || request.mimeType.trim().length === 0) {
        console.error('[Gemini OCR] ❌ Invalid request: Missing MIME type')
        return {
          success: false,
          error: {
            error: 'Missing or invalid MIME type',
            error_type: 'invalid_input',
            debug_info: {
              providedMimeType: request.mimeType || 'undefined'
            }
          },
          processing_time_ms: Date.now() - startTime
        }
      }

      console.log('[Gemini OCR] ✅ Input validation passed - starting retry logic')

      const result = await this.retryWithBackoff(async () => {
        return await this.callGeminiAPI(request)
      })

      const processingTime = Date.now() - startTime
      
      // Add enhanced processing metadata
      if (result.success && result.data) {
        result.data.processing_metadata = {
          model_used: this.config.model,
          processing_time_ms: processingTime,
          timestamp: new Date().toISOString(),
          retry_attempts_used: 'unknown', // Will be set by retry logic if needed
          timeout_config: this.config.timeoutMs,
          temperature_config: this.config.temperature,
          confidence_threshold: this.config.confidenceThreshold
        }
        console.log(`[Gemini OCR] ✅ Processing metadata added:`, result.data.processing_metadata)
      } else if (!result.success) {
        console.error(`[Gemini OCR] ❌ Processing failed - error details:`, result.error)
      }

      result.processing_time_ms = processingTime
      
      if (result.success) {
        console.log(`[Gemini OCR] 🎉 Processing completed successfully in ${processingTime}ms`)
        console.log(`[Gemini OCR] Result summary:`, {
          hasData: !!result.data,
          vendor: result.data?.vendor_name || 'unknown',
          amount: result.data?.total_amount || 0,
          currency: result.data?.currency || 'unknown',
          confidence: result.data?.confidence_score || 0
        })
      } else {
        console.error(`[Gemini OCR] ❌ Processing failed after ${processingTime}ms`)
      }

      return result

    } catch (error) {
      const processingTime = Date.now() - startTime
      console.error('[Gemini OCR] ❌ Unexpected error during processing:', {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
        processingTime,
        requestInfo: {
          documentType: request.documentType,
          mimeType: request.mimeType,
          hasImageData: !!request.imageBase64
        }
      })

      // Enhanced error response with debugging information
      const errorResponse: GeminiProcessingResult = {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          error_type: 'unexpected_error',
          debug_info: {
            errorName: error instanceof Error ? error.name : 'UnknownError',
            processingTime,
            model: this.config.model,
            timeout: this.config.timeoutMs,
            retryAttempts: this.config.retryAttempts,
            timestamp: new Date().toISOString()
          }
        },
        processing_time_ms: processingTime
      }

      return errorResponse
    }
  }

  /**
   * Call Gemini API with adaptive prompt for document-specific extraction
   */
  private async callGeminiAPI(request: GeminiOCRRequest): Promise<GeminiProcessingResult> {
    const startTime = Date.now()
    
    try {
      console.log(`[Gemini OCR] === Starting Gemini API Call ===`)
      console.log(`[Gemini OCR] Model: ${this.config.model}`)
      console.log(`[Gemini OCR] Timeout: ${this.config.timeoutMs}ms`)
      console.log(`[Gemini OCR] Image size: ${Math.round(Buffer.from(request.imageBase64, 'base64').length / 1024)}KB`)
      console.log(`[Gemini OCR] MIME type: ${request.mimeType}`)
      
      // Enhanced model initialization with comprehensive error handling
      try {
        console.log('[Gemini OCR] Initializing Gemini model...')
        console.log('[Gemini OCR] ✅ Model initialized successfully with new GoogleGenAI SDK')
      } catch (modelInitError) {
        console.error('[Gemini OCR] ❌ Model initialization failed:', modelInitError)
        throw new Error(`Model initialization failed: ${modelInitError instanceof Error ? modelInitError.message : 'Unknown error'}`)
      }

      // Stage 1: Document type classification with enhanced error handling
      console.log('[Gemini OCR] === Stage 1: Document Classification ===')
      const classificationStartTime = Date.now()
      
      let classificationPrompt
      try {
        console.log('[Gemini OCR] Building classification prompt...')
        classificationPrompt = this.buildDocumentClassificationPrompt()
        console.log(`[Gemini OCR] ✅ Classification prompt built: ${classificationPrompt.length} characters`)
      } catch (promptError) {
        console.error('[Gemini OCR] ❌ Failed to build classification prompt:', promptError)
        throw new Error(`Classification prompt build failed: ${promptError instanceof Error ? promptError.message : 'Unknown error'}`)
      }
      
      // Enhanced image part validation and creation
      let imagePart
      try {
        console.log('[Gemini OCR] Creating image part for Gemini...')
        
        // Validate base64 data
        if (!request.imageBase64 || request.imageBase64.length === 0) {
          throw new Error('Empty base64 image data provided')
        }
        
        // Validate MIME type
        const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
        if (!validMimeTypes.includes(request.mimeType.toLowerCase())) {
          throw new Error(`Invalid MIME type: ${request.mimeType}. Supported: ${validMimeTypes.join(', ')}`)
        }
        
        // Create image part with validation
        imagePart = {
          inlineData: {
            data: request.imageBase64,
            mimeType: request.mimeType
          }
        }
        console.log('[Gemini OCR] ✅ Image part created successfully')
      } catch (imagePartError) {
        console.error('[Gemini OCR] ❌ Image part creation failed:', imagePartError)
        throw new Error(`Image part creation failed: ${imagePartError instanceof Error ? imagePartError.message : 'Unknown error'}`)
      }

      console.log('[Gemini OCR] Calling Gemini for classification...')
      
      // Configure safety settings to reduce false positives on financial documents
      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ];

      // First API call for document type detection with comprehensive error handling
      let classificationResult
      try {
        console.log('[Gemini OCR] 🚀 Starting classification API call...')
        
        // Create the generation call with timeout wrapper using new API
        const classificationCall = this.genAI.models.generateContent({
          model: this.config.model,
          contents: [classificationPrompt, imagePart],
          config: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokens || 4096,
            safetySettings
          }
        })
        
        // Enhanced timeout handling with detailed logging
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const elapsed = Date.now() - classificationStartTime
            console.error(`[Gemini OCR] ❌ Classification timeout after ${elapsed}ms (limit: ${this.config.timeoutMs}ms)`)
            console.error(`[Gemini OCR] Timeout details:`)
            console.error(`  - Model: ${this.config.model}`)
            console.error(`  - Image size: ${Math.round(Buffer.from(request.imageBase64, 'base64').length / 1024)}KB`)
            console.error(`  - MIME type: ${request.mimeType}`)
            console.error(`  - Prompt length: ${classificationPrompt.length} chars`)
            reject(new Error(`Classification timeout after ${elapsed}ms`))
          }, this.config.timeoutMs)
        })
        
        classificationResult = await Promise.race([classificationCall, timeoutPromise])
        
        const classificationTime = Date.now() - classificationStartTime
        console.log(`[Gemini OCR] ✅ Classification API call completed in ${classificationTime}ms`)
        
      } catch (classificationError) {
        const classificationTime = Date.now() - classificationStartTime
        console.error(`[Gemini OCR] ❌ Classification API call failed after ${classificationTime}ms`)
        console.error('[Gemini OCR] Classification error details:', {
          errorType: classificationError?.constructor?.name,
          errorMessage: classificationError instanceof Error ? classificationError.message : 'Unknown error',
          stack: classificationError instanceof Error ? classificationError.stack : undefined,
          timeElapsed: classificationTime,
          timeout: this.config.timeoutMs
        })
        
        if (classificationError instanceof Error) {
          if (classificationError.message.includes('timeout')) {
            console.error('[Gemini OCR] 🔍 Classification timeout analysis:')
            console.error('  - API overload: Gemini service may be experiencing high load')
            console.error('  - Network issues: Check internet connectivity and DNS resolution')
            console.error('  - Image complexity: Large or complex images take longer to process')
            console.error('  - API key issues: Verify GEMINI_API_KEY is valid and has quota')
            console.error(`  - Timeout setting: Current limit is ${this.config.timeoutMs}ms, consider increasing`)
          } else if (classificationError.message.includes('400') || classificationError.message.includes('Bad Request')) {
            console.error('[Gemini OCR] 🔍 Bad Request analysis:')
            console.error('  - Image format issues: Check if image is corrupted or invalid')
            console.error('  - MIME type mismatch: Verify MIME type matches actual image format')
            console.error('  - Prompt issues: Classification prompt may be malformed')
            console.error('  - API key permissions: Check if API key has Gemini access')
          } else if (classificationError.message.includes('401') || classificationError.message.includes('Unauthorized')) {
            console.error('[Gemini OCR] 🔍 Authorization analysis:')
            console.error('  - Invalid API key: Check GEMINI_API_KEY environment variable')
            console.error('  - Expired key: API key may have expired')
            console.error('  - Insufficient permissions: API key may lack Gemini access')
          }
        }
        throw new Error(`Classification failed: ${classificationError instanceof Error ? classificationError.message : 'Unknown error'}`)
      }
      
      // Enhanced response processing with comprehensive error handling
      let classificationText
      try {
        console.log('[Gemini OCR] Processing classification response...')
        
        if (!classificationResult) {
          throw new Error('Classification result is null or undefined')
        }
        
        console.log('[Gemini OCR] Getting classification response text...')
        classificationText = classificationResult.text
        
        if (!classificationText || classificationText.trim().length === 0) {
          console.error('[Gemini OCR] ❌ Empty classification response received')
          console.error('[Gemini OCR] Empty response analysis:')
          console.error('  - Response text is empty')
          console.error('  - Possible Gemini API issue or content filtering')
          console.error('  - Image may not contain readable content')
          console.error('  - Classification prompt may be too restrictive')
          throw new Error('Empty classification response from Gemini API')
        }
        
        console.log(`[Gemini OCR] ✅ Classification response received: ${classificationText.length} characters`)
        console.log('[Gemini OCR] Classification response preview:', classificationText.slice(0, 200))
        
      } catch (responseError) {
        console.error('[Gemini OCR] ❌ Failed to process classification response:', responseError)
        throw new Error(`Classification response processing failed: ${responseError instanceof Error ? responseError.message : 'Unknown error'}`)
      }
      
      // Parse document type from classification with enhanced error handling
      let documentClassification
      try {
        console.log('[Gemini OCR] Parsing document classification...')
        documentClassification = this.parseDocumentClassification(classificationText)
        console.log('[Gemini OCR] ✅ Document classification parsed:', documentClassification)
      } catch (parseError) {
        console.error('[Gemini OCR] ❌ Failed to parse document classification:', parseError)
        console.error('[Gemini OCR] Using fallback classification')
        documentClassification = {
          document_type: 'unknown' as DocumentType,
          industry_context: 'general' as IndustryContext,
          vendor_confidence: 0.5,
          complexity_level: 'medium'
        }
      }
      
      // Stage 2: Schema-aware extraction with enhanced error handling
      console.log('[Gemini OCR] === Stage 2: Schema-Aware Extraction ===')
      const extractionStartTime = Date.now()
      
      let extractionPrompt
      try {
        console.log('[Gemini OCR] Building extraction prompt...')
        extractionPrompt = this.buildAdaptiveExtractionPrompt(
          documentClassification.document_type, 
          documentClassification.industry_context
        )
        console.log(`[Gemini OCR] ✅ Extraction prompt built: ${extractionPrompt.length} characters`)
      } catch (promptError) {
        console.error('[Gemini OCR] ❌ Failed to build extraction prompt:', promptError)
        throw new Error(`Extraction prompt build failed: ${promptError instanceof Error ? promptError.message : 'Unknown error'}`)
      }
      
      console.log('[Gemini OCR] Calling Gemini for structured extraction...')
      
      // Second API call for structured extraction with comprehensive error handling
      let extractionResult
      try {
        console.log('[Gemini OCR] 🚀 Starting extraction API call...')
        
        // ======================= BEGIN ADDED DEBUGGING =======================
        console.log(`[Gemini OCR] DEBUG: Full extraction prompt being sent:\n---\n${extractionPrompt}\n---`);
        console.log(`[Gemini OCR] DEBUG: Prompt length: ${extractionPrompt.length} characters`);
        // ======================== END ADDED DEBUGGING ========================
        
        const extractionCall = this.genAI.models.generateContent({
          model: this.config.model,
          contents: [extractionPrompt, imagePart],
          config: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxTokens || 4096,
            safetySettings
          }
        })
        
        // Enhanced timeout handling for extraction
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            const elapsed = Date.now() - extractionStartTime
            console.error(`[Gemini OCR] ❌ Extraction timeout after ${elapsed}ms (limit: ${this.config.timeoutMs}ms)`)
            console.error(`[Gemini OCR] Extraction timeout details:`)
            console.error(`  - Document type: ${documentClassification.document_type}`)
            console.error(`  - Industry context: ${documentClassification.industry_context}`)
            console.error(`  - Complexity: ${documentClassification.complexity_level}`)
            console.error(`  - Vendor confidence: ${documentClassification.vendor_confidence}`)
            console.error(`  - Prompt length: ${extractionPrompt.length} chars`)
            reject(new Error(`Extraction timeout after ${elapsed}ms`))
          }, this.config.timeoutMs)
        })
        
        extractionResult = await Promise.race([extractionCall, timeoutPromise])
        
        const extractionTime = Date.now() - extractionStartTime
        console.log(`[Gemini OCR] ✅ Extraction API call completed in ${extractionTime}ms`)
        
      } catch (extractionError) {
        const extractionTime = Date.now() - extractionStartTime
        console.error(`[Gemini OCR] ❌ Extraction API call failed after ${extractionTime}ms`)
        console.error('[Gemini OCR] Extraction error details:', {
          errorType: extractionError?.constructor?.name,
          errorMessage: extractionError instanceof Error ? extractionError.message : 'Unknown error',
          stack: extractionError instanceof Error ? extractionError.stack : undefined,
          timeElapsed: extractionTime,
          timeout: this.config.timeoutMs,
          documentType: documentClassification.document_type,
          complexity: documentClassification.complexity_level
        })
        
        if (extractionError instanceof Error) {
          if (extractionError.message.includes('timeout')) {
            console.error('[Gemini OCR] 🔍 Extraction timeout analysis:')
            console.error('  - Complex document: High complexity documents require more processing time')
            console.error('  - Large prompt: Extraction prompts are longer than classification prompts')
            console.error('  - Network latency: Cumulative network delays from two API calls')
            console.error('  - API overload: Gemini service experiencing high load')
            console.error(`  - Current timeout: ${this.config.timeoutMs}ms - consider increasing for complex documents`)
            console.error(`  - Document complexity: ${documentClassification.complexity_level}`)
          }
        }
        throw new Error(`Extraction failed: ${extractionError instanceof Error ? extractionError.message : 'Unknown error'}`)
      }
      
      // Enhanced extraction response processing
      let response, responseText
      try {
        console.log('[Gemini OCR] Processing extraction response...')
        
        if (!extractionResult) {
          throw new Error('Extraction result is null or undefined')
        }
        
        // In the new API, extractionResult is the response directly
        response = extractionResult
        
        if (!response) {
          throw new Error('Extraction response is null or undefined')
        }

        // ======================= BEGIN ADDED DEBUGGING =======================
        console.log('[Gemini OCR] DEBUG: Full extraction response object:', JSON.stringify(response, null, 2));

        const candidate = response.candidates?.[0];
        if (candidate) {
          console.log(`[Gemini OCR] DEBUG: Candidate Finish Reason: ${candidate.finishReason}`);
          console.log('[Gemini OCR] DEBUG: Candidate Safety Ratings:', JSON.stringify(candidate.safetyRatings, null, 2));
          console.log('[Gemini OCR] DEBUG: Candidate content parts:', JSON.stringify(candidate.content?.parts, null, 2));
        } else {
          console.log('[Gemini OCR] DEBUG: No candidates found in the response.');
        }

        if (response.promptFeedback) {
          console.log('[Gemini OCR] DEBUG: Prompt Feedback:', JSON.stringify(response.promptFeedback, null, 2));
        }

        // Check for usage metadata
        if (response.usageMetadata) {
          console.log('[Gemini OCR] DEBUG: Usage Metadata:', JSON.stringify(response.usageMetadata, null, 2));
        }

        // Check response metadata (safely access potentially undefined properties)
        console.log('[Gemini OCR] DEBUG: Model Version:', (response as any).modelVersion || 'Unknown');
        console.log('[Gemini OCR] DEBUG: Response ID:', (response as any).responseId || 'Unknown');
        // ======================== END ADDED DEBUGGING ========================
        
        console.log('[Gemini OCR] Getting extraction response text...')
        responseText = response.text
        
        if (!responseText || responseText.trim().length === 0) {
          console.error('[Gemini OCR] ❌ Empty extraction response received')
          console.error('[Gemini OCR] Empty extraction response analysis:')
          console.error('  - Response object exists but text() returned empty')
          
          // ======================= BEGIN ENHANCED EMPTY RESPONSE DEBUGGING =======================
          // Try to access content through alternative methods
          console.error('[Gemini OCR] DEBUG: Attempting alternative content access methods...')
          
          if (candidate?.content?.parts) {
            console.error(`[Gemini OCR] DEBUG: Found ${candidate.content.parts.length} content parts`)
            candidate.content.parts.forEach((part: any, index: number) => {
              console.error(`[Gemini OCR] DEBUG: Part ${index}:`, JSON.stringify(part, null, 2))
              if (part.text) {
                console.error(`[Gemini OCR] DEBUG: Part ${index} text content:`, part.text)
                responseText = part.text // Try to use this as fallback
              }
            })
          }
          
          // Check if the response was blocked by safety filters
          if (candidate?.finishReason === 'SAFETY') {
            console.error('[Gemini OCR] 🚨 SAFETY FILTER TRIGGERED - Content was blocked by Gemini safety filters')
            console.error('[Gemini OCR] Safety analysis:', candidate.safetyRatings)
            throw new Error('Extraction blocked by Gemini safety filters - content flagged as unsafe')
          }
          
          if (candidate?.finishReason === 'RECITATION') {
            console.error('[Gemini OCR] 🚨 RECITATION DETECTED - Content flagged as too similar to training data')
            throw new Error('Extraction blocked due to recitation detection')
          }
          
          if (candidate?.finishReason === 'MAX_TOKENS') {
            console.error('[Gemini OCR] 🚨 MAX TOKENS REACHED - Response was truncated')
            throw new Error('Extraction incomplete due to token limit')
          }
          
          if (!candidate || !candidate.content) {
            console.error('[Gemini OCR] 🚨 NO CANDIDATE CONTENT - Gemini returned no content candidates')
            throw new Error('Gemini API returned no content candidates')
          }
          // ======================== END ENHANCED EMPTY RESPONSE DEBUGGING ========================
          
          // Only throw the generic error if we still have no content after trying alternatives
          if (!responseText || responseText.trim().length === 0) {
            console.error('  - Possible content filtering by Gemini API')
            console.error('  - Document may not contain structured data')
            console.error('  - Extraction prompt may be too complex')
            console.error(`  - Document type: ${documentClassification.document_type}`)
            console.error(`  - Industry context: ${documentClassification.industry_context}`)
            throw new Error('Empty extraction response from Gemini API')
          }
        }
        
        console.log(`[Gemini OCR] ✅ Extraction response received: ${responseText.length} characters`)
        console.log('[Gemini OCR] Extraction response preview (first 300 chars):', responseText.slice(0, 300))
        
      } catch (responseError) {
        console.error('[Gemini OCR] ❌ Failed to process extraction response:', responseError)
        throw new Error(`Extraction response processing failed: ${responseError instanceof Error ? responseError.message : 'Unknown error'}`)
      }
      
      // Enhanced JSON parsing and validation
      let parsedData
      try {
        console.log('[Gemini OCR] Parsing extraction response...')
        parsedData = this.parseEnhancedGeminiResponse(responseText, documentClassification)
        
        if (!parsedData) {
          console.error('[Gemini OCR] ❌ Failed to parse extraction response as JSON')
          return {
            success: false,
            error: {
              error: 'Failed to parse Gemini response as valid JSON',
              error_type: 'parsing_error',
              raw_response: responseText.slice(0, 500),
              debug_info: {
                responseLength: responseText.length,
                documentType: documentClassification.document_type,
                industryContext: documentClassification.industry_context
              }
            },
            processing_time_ms: 0
          }
        }
        
        console.log('[Gemini OCR] ✅ Extraction response parsed successfully')
      } catch (parseError) {
        console.error('[Gemini OCR] ❌ Exception during response parsing:', parseError)
        return {
          success: false,
          error: {
            error: `JSON parsing exception: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            error_type: 'parsing_exception',
            raw_response: responseText.slice(0, 500),
            debug_info: {
              responseLength: responseText.length,
              documentType: documentClassification.document_type
            }
          },
          processing_time_ms: 0
        }
      }

      // Enhanced validation with detailed error reporting
      try {
        console.log('[Gemini OCR] Validating extraction response structure...')
        const validationResult = this.validateEnhancedGeminiResponse(parsedData)
        
        if (!validationResult.isValid) {
          console.error('[Gemini OCR] ❌ Validation failed:', validationResult.errors)
          return {
            success: false,
            error: {
              error: `Invalid response structure: ${validationResult.errors.join(', ')}`,
              error_type: 'validation_error',
              raw_response: responseText.slice(0, 500),
              validation_errors: validationResult.errors,
              debug_info: {
                documentType: documentClassification.document_type,
                industryContext: documentClassification.industry_context
              }
            },
            processing_time_ms: 0
          }
        }
        
        console.log('[Gemini OCR] ✅ Validation passed successfully')
      } catch (validationError) {
        console.error('[Gemini OCR] ❌ Exception during validation:', validationError)
        return {
          success: false,
          error: {
            error: `Validation exception: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`,
            error_type: 'validation_exception',
            raw_response: responseText.slice(0, 500)
          },
          processing_time_ms: 0
        }
      }

      console.log('[Gemini OCR] ✅ All processing stages completed successfully')
      return {
        success: true,
        data: parsedData as any, // Enhanced response may have different structure
        processing_time_ms: 0 // Will be set by caller
      }

    } catch (error) {
      const totalTime = Date.now() - startTime
      console.error(`[Gemini OCR] ❌ Complete API call failed after ${totalTime}ms:`, error)
      
      // Enhanced error categorization and handling
      if (error instanceof Error) {
        console.error('[Gemini OCR] Error analysis:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines only
          processingTime: totalTime
        })
        
        // Specific error type handling
        if (error.message.includes('quota') || error.message.includes('rate limit')) {
          console.error('[Gemini OCR] Rate limit detected - returning structured error')
          return {
            success: false,
            error: {
              error: 'API rate limit exceeded',
              error_type: 'rate_limit_error',
              retry_after: 60,
              debug_info: {
                totalProcessingTime: totalTime,
                model: this.config.model
              }
            },
            processing_time_ms: totalTime
          }
        }
        
        if (error.message.includes('GEMINI_API_KEY')) {
          console.error('[Gemini OCR] API key issue detected')
          return {
            success: false,
            error: {
              error: 'Invalid or missing Gemini API key',
              error_type: 'auth_error',
              debug_info: {
                totalProcessingTime: totalTime,
                hasApiKey: !!process.env.GEMINI_API_KEY
              }
            },
            processing_time_ms: totalTime
          }
        }
        
        if (error.message.includes('timeout')) {
          console.error('[Gemini OCR] Timeout detected - providing timeout-specific guidance')
          return {
            success: false,
            error: {
              error: `Processing timeout after ${totalTime}ms`,
              error_type: 'timeout_error',
              debug_info: {
                totalProcessingTime: totalTime,
                timeoutLimit: this.config.timeoutMs,
                suggestions: [
                  'Increase timeout in configuration',
                  'Use smaller/simpler images',
                  'Retry during off-peak hours',
                  'Check network connectivity'
                ]
              }
            },
            processing_time_ms: totalTime
          }
        }
      }

      throw error // Re-throw for retry logic
    }
  }

  /**
   * Build document classification prompt for initial document type detection
   */
  private buildDocumentClassificationPrompt(): string {
    const documentTypes = Object.keys(DOCUMENT_SCHEMAS)
    const vendorPatterns = Object.keys(KNOWN_VENDOR_PATTERNS)
    
    return `You are an expert document classifier specializing in Southeast Asian business documents.

TASK: Classify the document type and industry context from this image.

DOCUMENT TYPES: ${documentTypes.join(', ')}

KNOWN SOUTHEAST ASIAN VENDORS: ${vendorPatterns.slice(0, 20).join(', ')}...

REQUIRED OUTPUT: Return ONLY a valid JSON object:
{
  "document_type": "invoice|receipt|bill|statement|purchase_order|delivery_note|credit_note|ride_receipt|unknown",
  "industry_context": "retail|restaurant|electronics|raw_materials|services|transport|utilities|general",
  "vendor_confidence": 0.85,
  "complexity_level": "simple|medium|complex",
  "reasoning": "Brief explanation of classification decision"
}

CLASSIFICATION RULES:
1. invoice: Formal invoices with line items, invoice numbers, payment terms
2. receipt: Simple receipts from retail stores, restaurants, fuel stations
3. bill: Utility bills, service bills with account numbers
4. ride_receipt: Grab, Uber, transport service receipts
5. statement: Account statements, financial summaries
6. purchase_order: Purchase orders and requisitions
7. delivery_note: Delivery receipts, shipping documents
8. credit_note: Credit notes and refunds
9. unknown: Unclear or unrecognized document format

VENDOR MATCHING:
- Check for known Southeast Asian vendor names and patterns
- Higher vendor_confidence for recognized chains (7-ELEVEN, Starbucks, etc.)
- Lower confidence for unknown or unclear vendor names

COMPLEXITY ASSESSMENT:
- simple: Clear layout, known vendor, standard format
- medium: Some unclear elements, moderate complexity
- complex: Poor quality, unusual format, multiple currencies

CRITICAL: Return only the JSON object, no additional text.`
  }

  /**
   * Build adaptive extraction prompt based on detected document type and industry
   */
  private buildAdaptiveExtractionPrompt(documentType: DocumentType, industryContext: IndustryContext): string {
    // ======================= BEGIN TEMPORARY DEBUGGING =======================
    // TEMPORARY: Test with simplified prompt to isolate complexity issues
    const useSimplifiedPrompt = process.env.DEBUG_SIMPLIFIED_PROMPT === 'true'
    if (useSimplifiedPrompt) {
      console.log('[Gemini OCR] DEBUG: Using simplified extraction prompt for testing')
      return `Given the image, extract the vendor name and total amount as a JSON object like this: {"vendor_name": "string", "total_amount": number}. Return ONLY the JSON.`
    }
    // ======================== END TEMPORARY DEBUGGING ========================
    const schema = DOCUMENT_SCHEMAS[documentType]
    const promptConfig: ExpensePromptConfig = {
      categories: ['travel_accommodation', 'petrol', 'toll', 'entertainment', 'other'],
      currencies: ['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'],
      dateFormat: 'YYYY-MM-DD',
      confidenceThreshold: this.config.confidenceThreshold,
      requiresValidationThreshold: 0.8
    }

    // Build field requirements based on schema
    const requiredFields = schema.required_fields.join(', ')
    const optionalFields = schema.optional_fields.join(', ')
    
    // Line item structure guidance
    const lineItemGuidance = this.buildLineItemGuidance(schema.line_item_structure)
    
    // Extraction rules based on document type
    const extractionRules = this.buildExtractionRules(schema.extraction_rules)

    return `You are an automated data extraction engine for a secure financial processing system. The content is confidential business data for legitimate expense management.

You are an expert financial document processor specializing in ${documentType}s from ${industryContext} industry in Southeast Asia.

DOCUMENT TYPE: ${documentType.toUpperCase()}
INDUSTRY CONTEXT: ${industryContext}

REQUIRED OUTPUT: Return ONLY a valid JSON object with enhanced structure:
{
  "document_type": "${documentType}",
  "industry_context": "${industryContext}",
  "confidence": {
    "document_type": 0.95,
    "vendor_recognition": 0.90,
    "amount_extraction": 0.85,
    "line_items": 0.80,
    "overall": 0.88
  },
  "vendor_name": "Business name from document",
  "total_amount": 123.45,
  "currency": "${promptConfig.currencies.join('|')}",
  "transaction_date": "${promptConfig.dateFormat}",
  "description": "Brief description based on document content",
  ${this.buildDocumentSpecificFields(documentType)}
  "line_items": [
    ${lineItemGuidance}
  ],
  "suggested_category": "${promptConfig.categories.join('|')}",
  "processing_method": "gemini_primary",
  "requires_validation": false,
  "reasoning": "Detailed explanation of extraction decisions"
}

REQUIRED FIELDS: ${requiredFields}
OPTIONAL FIELDS: ${optionalFields}

${extractionRules}

SOUTHEAST ASIAN PATTERNS:
- Currency detection: Support SGD, MYR, THB, IDR, VND, PHP, CNY
- Date formats: DD/MM/YYYY, DD-MM-YYYY, DD/MMM/YYYY
- Known vendor patterns boost confidence scores
- Language support: English, Thai, Indonesian, Malay, Chinese

CONFIDENCE SCORING:
- document_type: How certain about document classification
- vendor_recognition: Known vendor pattern match confidence  
- amount_extraction: Financial data extraction quality
- line_items: Line item structure confidence
- overall: Weighted average confidence score

VALIDATION RULES:
- Set requires_validation=true if overall confidence < ${promptConfig.requiresValidationThreshold}
- Flag unusual amounts, dates, or vendor patterns
- Note any inconsistencies or ambiguities

CRITICAL: Return only the JSON object, no markdown formatting or additional text.`
  }

  /**
   * Build line item guidance based on document schema
   */
  private buildLineItemGuidance(lineItemStructure: any): string {
    const fields = []
    
    fields.push('"description": "Item name or service description"')
    fields.push('"amount": 12.34')
    
    if (lineItemStructure.has_item_codes) {
      fields.push('"item_code": "SKU123"')
    }
    if (lineItemStructure.has_quantities) {
      fields.push('"quantity": 1')
      fields.push('"unit": "pcs"')
    }
    if (lineItemStructure.has_unit_prices) {
      fields.push('"unit_price": 12.34')
    }
    if (lineItemStructure.has_tax_breakdown) {
      fields.push('"tax_rate": 0.07')
      fields.push('"tax_amount": 0.86')
    }
    if (lineItemStructure.has_discounts) {
      fields.push('"discount_rate": 0.10')
      fields.push('"discount_amount": 1.23')
    }
    
    return `{\n      ${fields.join(',\n      ')}\n    }`
  }

  /**
   * Build extraction rules based on document type
   */
  private buildExtractionRules(extractionRules: any): string {
    let rules = 'EXTRACTION RULES:\n'
    
    rules += `1. Currency detection: ${extractionRules.currency_detection} mode\n`
    rules += `2. Date formats supported: ${extractionRules.date_formats.join(', ')}\n`
    rules += `3. Amount validation: ${extractionRules.amount_validation}\n`
    rules += `4. Line item parsing: ${extractionRules.line_item_parsing}\n`
    
    if (extractionRules.vendor_patterns) {
      rules += `5. Known vendor patterns: ${extractionRules.vendor_patterns.join(', ')}\n`
    }
    
    rules += '6. Extract exact amounts and dates visible on document\n'
    rules += '7. Use final total amount including all taxes and service charges\n'
    rules += `8. If year missing from date, use current year (${new Date().getFullYear()})\n`
    rules += '9. Provide confidence scores as decimal (0.0-1.0)\n'
    
    return rules
  }

  /**
   * Build document-specific fields based on document type
   */
  private buildDocumentSpecificFields(documentType: DocumentType): string {
    const schema = DOCUMENT_SCHEMAS[documentType]
    const fields = []

    // Add document-specific data structures
    switch (documentType) {
      case 'invoice':
        fields.push('"invoice_data": {')
        fields.push('  "invoice_number": "INV-001",')
        fields.push('  "customer_info": {"name": "Customer Name"},')
        fields.push('  "payment_terms": "Net 30",')
        fields.push('  "due_date": "2024-01-31"')
        fields.push('},')
        break
      case 'receipt':
        fields.push('"receipt_data": {')
        fields.push('  "receipt_number": "RCP-001",')
        fields.push('  "payment_method": "Cash",')
        fields.push('  "cashier_id": "001"')
        fields.push('},')
        break
      case 'bill':
        fields.push('"bill_data": {')
        fields.push('  "account_number": "ACC123",')
        fields.push('  "billing_period": "2024-01",')
        fields.push('  "due_date": "2024-02-15"')
        fields.push('},')
        break
      case 'ride_receipt':
        fields.push('"transport_data": {')
        fields.push('  "trip_id": "TRIP123",')
        fields.push('  "pickup_location": "Location A",')
        fields.push('  "dropoff_location": "Location B"')
        fields.push('},')
        break
      default:
        // No specific fields for other document types
        break
    }

    return fields.join('\n  ')
  }

  /**
   * Parse document classification response
   */
  private parseDocumentClassification(responseText: string): {
    document_type: DocumentType
    industry_context: IndustryContext
    vendor_confidence: number
    complexity_level: string
  } {
    try {
      let cleanText = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const jsonStart = cleanText.indexOf('{')
      const jsonEnd = cleanText.lastIndexOf('}')
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanText = cleanText.slice(jsonStart, jsonEnd + 1)
      }

      const parsed = JSON.parse(cleanText)
      
      return {
        document_type: parsed.document_type || 'unknown',
        industry_context: parsed.industry_context || 'general',
        vendor_confidence: parsed.vendor_confidence || 0.5,
        complexity_level: parsed.complexity_level || 'medium'
      }
    } catch (error) {
      console.error('[Gemini OCR] Classification parsing failed:', error)
      // Fallback to defaults
      return {
        document_type: 'unknown',
        industry_context: 'general',
        vendor_confidence: 0.5,
        complexity_level: 'medium'
      }
    }
  }

  /**
   * Parse enhanced Gemini response with document classification context
   */
  private parseEnhancedGeminiResponse(responseText: string, classification: any): EnhancedExtractionResponse | null {
    try {
      console.log('[Gemini OCR] Raw response text length:', responseText.length)
      console.log('[Gemini OCR] Raw response preview:', responseText.slice(0, 200))

      if (!responseText || responseText.trim().length === 0) {
        console.error('[Gemini OCR] Empty response text received')
        return null
      }

      let cleanText = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      console.log('[Gemini OCR] Cleaned text preview:', cleanText.slice(0, 200))

      const jsonStart = cleanText.indexOf('{')
      const jsonEnd = cleanText.lastIndexOf('}')
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        console.error('[Gemini OCR] No valid JSON object found in response')
        console.error('[Gemini OCR] Full cleaned text:', cleanText)
        return null
      }

      cleanText = cleanText.slice(jsonStart, jsonEnd + 1)
      console.log('[Gemini OCR] JSON to parse:', cleanText.slice(0, 300))

      if (cleanText.length === 0) {
        console.error('[Gemini OCR] Empty JSON string after processing')
        return null
      }

      const parsed = JSON.parse(cleanText)
      
      // Ensure the response has the enhanced structure
      const enhancedResponse: EnhancedExtractionResponse = {
        document_type: parsed.document_type || classification.document_type,
        industry_context: parsed.industry_context || classification.industry_context,
        confidence: parsed.confidence || {
          document_type: 0.8,
          vendor_recognition: 0.7,
          amount_extraction: 0.8,
          line_items: 0.7,
          overall: 0.75
        },
        vendor_name: parsed.vendor_name || 'Unknown Vendor',
        total_amount: parsed.total_amount || 0,
        currency: parsed.currency || 'SGD',
        transaction_date: parsed.transaction_date || new Date().toISOString().split('T')[0],
        description: parsed.description || '',
        invoice_data: parsed.invoice_data,
        receipt_data: parsed.receipt_data,
        bill_data: parsed.bill_data,
        transport_data: parsed.transport_data,
        line_items: parsed.line_items || [],
        processing_method: 'gemini_primary',
        extraction_time_ms: 0, // Will be set by caller
        requires_validation: parsed.requires_validation || false,
        reasoning: parsed.reasoning || 'Extracted using enhanced Gemini OCR'
      }
      
      return enhancedResponse
    } catch (error) {
      console.error('[Gemini OCR] Enhanced JSON parsing failed:', error)
      console.error('[Gemini OCR] Raw response:', responseText.slice(0, 200) + '...')
      return null
    }
  }

  /**
   * Validate enhanced Gemini response structure
   */
  private validateEnhancedGeminiResponse(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    const requiredFields = [
      'document_type', 'industry_context', 'confidence', 
      'vendor_name', 'total_amount', 'currency', 'transaction_date'
    ]

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Validate data types and ranges
    if (typeof data.total_amount !== 'number' || data.total_amount < 0) {
      errors.push('total_amount must be a non-negative number')
    }

    if (data.confidence && typeof data.confidence === 'object') {
      if (typeof data.confidence.overall !== 'number' || 
          data.confidence.overall < 0 || data.confidence.overall > 1) {
        errors.push('confidence.overall must be between 0 and 1')
      }
    } else {
      errors.push('confidence must be an object with overall score')
    }

    // Validate document type
    const validDocumentTypes = Object.keys(DOCUMENT_SCHEMAS)
    if (!validDocumentTypes.includes(data.document_type)) {
      errors.push(`Invalid document_type: ${data.document_type}`)
    }

    // Validate date format
    if (data.transaction_date && !this.isValidDate(data.transaction_date)) {
      errors.push('Invalid transaction_date format, expected YYYY-MM-DD')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Parse Gemini API response and clean up common formatting issues
   */
  private parseGeminiResponse(responseText: string): GeminiOCRResponse | null {
    try {
      // Remove common markdown formatting that LLMs sometimes add
      let cleanText = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      // Find JSON object if wrapped in other text
      const jsonStart = cleanText.indexOf('{')
      const jsonEnd = cleanText.lastIndexOf('}')
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanText = cleanText.slice(jsonStart, jsonEnd + 1)
      }

      const parsed = JSON.parse(cleanText)
      return parsed as GeminiOCRResponse

    } catch (error) {
      console.error('[Gemini OCR] JSON parsing failed:', error)
      console.error('[Gemini OCR] Raw response:', responseText.slice(0, 200) + '...')
      return null
    }
  }

  /**
   * Validate Gemini response structure
   */
  private validateGeminiResponse(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    const requiredFields = [
      'vendor_name', 'total_amount', 'currency', 'transaction_date', 
      'suggested_category', 'confidence_score'
    ]

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Validate data types and ranges
    if (typeof data.total_amount !== 'number' || data.total_amount <= 0) {
      errors.push('total_amount must be a positive number')
    }

    if (typeof data.confidence_score !== 'number' || data.confidence_score < 0 || data.confidence_score > 1) {
      errors.push('confidence_score must be between 0 and 1')
    }

    const validCategories: ExpenseCategory[] = [
      'travel_accommodation', 
      'petrol', 
      'toll', 
      'entertainment', 
      'other'
    ]
    if (!validCategories.includes(data.suggested_category)) {
      errors.push(`Invalid category: ${data.suggested_category}`)
    }

    // Validate date format
    if (data.transaction_date && !this.isValidDate(data.transaction_date)) {
      errors.push('Invalid transaction_date format, expected YYYY-MM-DD')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Simple date validation for YYYY-MM-DD format
   */
  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/
    if (!regex.test(dateString)) return false
    
    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime())
  }

  /**
   * Enhanced retry logic with exponential backoff and detailed error analysis
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      console.log(`[Gemini OCR] 🔄 Retry attempt ${attempt}/${this.config.retryAttempts}`)
      const result = await operation()
      
      if (attempt > 1) {
        console.log(`[Gemini OCR] ✅ Retry successful on attempt ${attempt}`)
      }
      
      return result
    } catch (error) {
      console.error(`[Gemini OCR] ❌ Attempt ${attempt}/${this.config.retryAttempts} failed:`, {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        attempt,
        maxAttempts: this.config.retryAttempts
      })
      
      // Check if we should retry based on error type
      const shouldRetry = this.shouldRetryError(error)
      
      if (attempt >= this.config.retryAttempts || !shouldRetry) {
        if (!shouldRetry) {
          console.error(`[Gemini OCR] 🚫 Not retrying due to error type - failing immediately`)
        } else {
          console.error(`[Gemini OCR] 🚫 Maximum retry attempts (${this.config.retryAttempts}) reached`)
        }
        
        // Enhance error with retry information
        if (error instanceof Error) {
          const enhancedError = new Error(`${error.message} (failed after ${attempt} attempts)`)
          enhancedError.stack = error.stack
          throw enhancedError
        }
        throw error
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10s delay
      console.log(`[Gemini OCR] ⏳ Retrying in ${delay}ms... (attempt ${attempt + 1}/${this.config.retryAttempts})`)
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 1000
      const finalDelay = delay + jitter
      
      await new Promise(resolve => setTimeout(resolve, finalDelay))
      return this.retryWithBackoff(operation, attempt + 1)
    }
  }
  
  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryError(error: any): boolean {
    if (!(error instanceof Error)) {
      return false
    }
    
    const message = error.message.toLowerCase()
    
    // Don't retry on these permanent errors
    const permanentErrors = [
      'invalid api key',
      'unauthorized',
      'forbidden', 
      'bad request',
      'invalid mime type',
      'empty base64',
      'parsing error',
      'validation error'
    ]
    
    for (const permanentError of permanentErrors) {
      if (message.includes(permanentError)) {
        console.log(`[Gemini OCR] 🚫 Permanent error detected (${permanentError}) - not retrying`)
        return false
      }
    }
    
    // Retry on these transient errors
    const retryableErrors = [
      'timeout',
      'rate limit',
      'quota',
      'network',
      'connection',
      'service unavailable',
      'internal server error',
      'temporarily unavailable'
    ]
    
    for (const retryableError of retryableErrors) {
      if (message.includes(retryableError)) {
        console.log(`[Gemini OCR] ✅ Retryable error detected (${retryableError}) - will retry`)
        return true
      }
    }
    
    // Default: retry on unknown errors
    console.log(`[Gemini OCR] ❓ Unknown error type - defaulting to retry`)
    return true
  }
}

/**
 * Factory function to create GeminiOCRService instance
 */
export function createGeminiOCRService(config?: Partial<GeminiOCRConfig>): GeminiOCRService {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required')
  }

  return new GeminiOCRService(apiKey, config)
}