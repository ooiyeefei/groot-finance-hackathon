/**
 * Gemini Vision Pro Receipt Extraction API
 * Implements Kevin's Tier 1 processing with multi-tier fallback architecture
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Gemini configuration using official SDK
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

interface GeminiExtractionResult {
  vendor_name: string | null
  total_amount: number | null
  currency: string | null
  transaction_date: string | null
  description: string | null
  line_items: Array<{
    description: string
    quantity: number
    unit_price: number
    total_amount: number
  }>
  tax_amount: number | null
  tax_rate: number | null
  receipt_number: string | null
  confidence_score: number
  extraction_method: 'gemini' | 'colnomic' | 'gpt4'
  processing_tier: 1 | 2 | 3
  requires_validation: boolean
  missing_fields: string[]
  suggested_category?: string | null
  category_confidence?: number
  category_reason?: string
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!GEMINI_API_KEY) {
      console.error('[Receipt Extraction API] GEMINI_API_KEY not configured')
      // Fallback to existing ColNomic system
      return await fallbackToColNomic(request, userId)
    }

    const formData = await request.formData()
    const file = formData.get('receipt') as File
    const documentId = formData.get('document_id') as string

    if (!file && !documentId) {
      return NextResponse.json(
        { success: false, error: 'Receipt file or document ID required' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    let imageData: string
    let document: any

    if (documentId) {
      // Get existing document
      const { data: existingDoc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('user_id', userId)
        .single()

      if (docError || !existingDoc) {
        return NextResponse.json(
          { success: false, error: 'Document not found' },
          { status: 404 }
        )
      }

      document = existingDoc

      // Download image from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(document.storage_path)

      if (downloadError) {
        console.error('[Receipt Extraction API] Failed to download file:', downloadError)
        return await fallbackToColNomic(request, userId)
      }

      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      imageData = buffer.toString('base64')
    } else {
      // Process new file upload
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      imageData = buffer.toString('base64')

      // Create document record first
      const fileName = `receipt-${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`
      const filePath = `receipts/${userId}/${fileName}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('[Receipt Extraction API] Upload failed:', uploadError)
        return NextResponse.json(
          { success: false, error: 'File upload failed' },
          { status: 500 }
        )
      }

      // Create document record
      const { data: newDoc, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: filePath,
          processing_status: 'processing',
          document_type: 'receipt',
          processing_tier: 1
        })
        .select()
        .single()

      if (docError || !newDoc) {
        console.error('[Receipt Extraction API] Document creation failed:', docError)
        return NextResponse.json(
          { success: false, error: 'Failed to create document record' },
          { status: 500 }
        )
      }

      document = newDoc
    }

    // Tier 1: Gemini Vision Pro Processing
    const startTime = Date.now()
    console.log(`[Receipt Extraction API] Starting Gemini Vision Pro processing for document ${document.id}`)

    try {
      const geminiResult = await processWithGeminiVision(imageData, file?.type || document.file_type)
      const processingTime = Date.now() - startTime

      // Get user's business ID for category matching
      const { data: employeeProfile } = await supabase
        .from('employee_profiles')
        .select('business_id')
        .eq('user_id', userId)
        .single()

      // Perform auto-categorization if we have business context
      if (employeeProfile?.business_id && geminiResult.vendor_name && geminiResult.description) {
        try {
          const { data: matchingCategories } = await supabase
            .rpc('get_matching_categories', {
              business_id_param: employeeProfile.business_id,
              vendor_name_param: geminiResult.vendor_name,
              description_param: geminiResult.description,
              amount_param: geminiResult.total_amount
            })

          if (matchingCategories && matchingCategories.length > 0) {
            const bestMatch = matchingCategories[0]
            geminiResult.suggested_category = bestMatch.category_code
            geminiResult.category_confidence = Math.min(bestMatch.match_score / 100, 1.0)
            geminiResult.category_reason = `Matched vendor "${geminiResult.vendor_name}" and description "${geminiResult.description}"`
            
            console.log(`[Receipt Extraction API] Auto-categorized as "${bestMatch.category_name}" with ${Math.round(bestMatch.match_score)}% confidence`)
          }
        } catch (categorizationError) {
          console.error('[Receipt Extraction API] Auto-categorization failed:', categorizationError)
          // Don't fail the extraction if categorization fails
        }
      }

      // Update document with consolidated OCR results
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          processing_status: geminiResult.requires_validation ? 'requires_validation' : 'completed',
          confidence_score: geminiResult.confidence_score,
          extracted_data: geminiResult,
          processing_metadata: {
            extraction_method: geminiResult.extraction_method,
            confidence_score: geminiResult.confidence_score,
            extracted_data: geminiResult,
            processing_time_ms: processingTime,
            processing_tier: geminiResult.processing_tier,
            extracted_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id)

      if (updateError) {
        console.error('[Receipt Extraction API] Failed to update document with OCR results:', updateError)
      }

      console.log(`[Receipt Extraction API] Gemini processing completed in ${processingTime}ms with ${Math.round(geminiResult.confidence_score * 100)}% confidence`)

      // If confidence is low, trigger background enhancement
      if (geminiResult.confidence_score < 0.85) {
        console.log(`[Receipt Extraction API] Low confidence (${Math.round(geminiResult.confidence_score * 100)}%), triggering background enhancement`)
        
        try {
          await tasks.trigger('enhance-receipt-extraction', {
            documentId: document.id,
            fallbackMethod: 'colnomic',
            currentResult: geminiResult
          })
        } catch (taskError) {
          console.error('[Receipt Extraction API] Failed to trigger enhancement task:', taskError)
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          document_id: document.id,
          processing_complete: !geminiResult.requires_validation,
          processing_time_ms: processingTime,
          confidence_score: geminiResult.confidence_score,
          extraction_method: geminiResult.extraction_method,
          processing_tier: geminiResult.processing_tier,
          expense_data: geminiResult,
          requires_validation: geminiResult.requires_validation,
          missing_fields: geminiResult.missing_fields,
          suggested_category: geminiResult.suggested_category,
          category_confidence: geminiResult.category_confidence,
          category_reason: geminiResult.category_reason
        }
      })

    } catch (geminiError) {
      console.error('[Receipt Extraction API] Gemini processing failed:', geminiError)
      
      // Fallback to Tier 2: ColNomic processing
      console.log(`[Receipt Extraction API] Falling back to ColNomic processing for document ${document.id}`)
      
      try {
        await tasks.trigger('process-document-ocr', {
          documentId: document.id,
          processingTier: 2,
          fallbackReason: 'gemini_failed'
        })

        return NextResponse.json({
          success: true,
          data: {
            document_id: document.id,
            processing_complete: false,
            processing_tier: 2,
            extraction_method: 'colnomic',
            message: 'Processing with fallback method. Please check back in a few moments.'
          }
        })
      } catch (fallbackError) {
        console.error('[Receipt Extraction API] Fallback processing failed:', fallbackError)
        
        return NextResponse.json(
          { success: false, error: 'All processing methods failed' },
          { status: 500 }
        )
      }
    }

  } catch (error) {
    console.error('[Receipt Extraction API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process receipt'
      },
      { status: 500 }
    )
  }
}

async function processWithGeminiVision(imageData: string, mimeType: string): Promise<GeminiExtractionResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not found in environment variables')
  }

  // Initialize Google AI SDK
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

  const prompt = `
Analyze this receipt/invoice image and extract structured financial data. You are an expert OCR system specialized in Southeast Asian receipts (Thailand, Singapore, Malaysia, Indonesia, Philippines, Vietnam).

Extract the following information and return ONLY a valid JSON object with these exact fields:

{
  "vendor_name": "Exact business name from receipt",
  "total_amount": 123.45,
  "currency": "SGD/USD/THB/MYR/IDR/PHP/VND/CNY/EUR",
  "transaction_date": "YYYY-MM-DD",
  "description": "Brief description of purchase",
  "line_items": [
    {
      "description": "Item name",
      "quantity": 1,
      "unit_price": 12.34,
      "total_amount": 12.34
    }
  ],
  "tax_amount": 12.34,
  "tax_rate": 7.0,
  "receipt_number": "Receipt/Invoice number if visible",
  "confidence_score": 0.95,
  "extraction_method": "gemini",
  "processing_tier": 1,
  "requires_validation": false,
  "missing_fields": [],
  "suggested_category": null,
  "category_confidence": null,
  "category_reason": null
}

Important guidelines:
1. Extract exact amounts and dates as they appear
2. For Southeast Asian currencies, be precise with decimal places
3. If text is unclear, set confidence_score lower (0.6-0.8)
4. Set requires_validation to true if confidence < 0.85
5. Include line_items only if clearly itemized on receipt
6. Detect currency symbols: $ (SGD/USD), ฿ (THB), RM (MYR), Rp (IDR), ₱ (PHP), ₫ (VND), ¥ (CNY), € (EUR)
7. For receipt_number, search thoroughly for ANY of these patterns (case-insensitive):
   - "Receipt No", "Receipt Number", "Receipt #", "REC NO", "REC#"
   - "Reference No", "Ref No", "REF#", "Reference Number"
   - "Invoice No", "Invoice Number", "INV NO", "INV#"
   - "Transaction ID", "Trans ID", "TXN ID", "Transaction No"
   - "Batch No", "Batch Number", "BATCH#"
   - "Order No", "Order Number", "ORD#"
   - "Bill No", "Bill Number", "BILL#"
   - "Voucher No", "Voucher Number"
   - Any standalone number sequence that appears to be a receipt identifier (look for 6+ digit numbers)
   - Check both top and bottom of receipt - receipt numbers often appear multiple times
8. Add fields to missing_fields array if not clearly visible
9. For dates, convert to ISO format (YYYY-MM-DD)
10. Leave suggested_category, category_confidence, and category_reason as null (will be populated by auto-categorization system)

Return ONLY the JSON object, no additional text or explanation.`

  try {
    // Convert base64 to proper format for Google AI SDK
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType,
      },
    }

    // Generate content using the official SDK
    const result = await model.generateContent([prompt, imagePart])
    const response = await result.response
    const extractedText = response.text()
    
    console.log('[Gemini SDK] Raw response:', extractedText)
    
    // Clean up the response text to extract JSON
    const jsonStart = extractedText.indexOf('{')
    const jsonEnd = extractedText.lastIndexOf('}')
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No JSON object found in response')
    }
    
    const jsonStr = extractedText.substring(jsonStart, jsonEnd + 1)
    const parsedResult = JSON.parse(jsonStr)
    
    // Validate and set defaults for required fields
    return {
      vendor_name: parsedResult.vendor_name || null,
      total_amount: typeof parsedResult.total_amount === 'number' ? parsedResult.total_amount : null,
      currency: parsedResult.currency || 'SGD',
      transaction_date: parsedResult.transaction_date || null,
      description: parsedResult.description || null,
      line_items: Array.isArray(parsedResult.line_items) ? parsedResult.line_items : [],
      tax_amount: typeof parsedResult.tax_amount === 'number' ? parsedResult.tax_amount : null,
      tax_rate: typeof parsedResult.tax_rate === 'number' ? parsedResult.tax_rate : null,
      receipt_number: parsedResult.receipt_number || null,
      confidence_score: typeof parsedResult.confidence_score === 'number' ? 
        Math.min(Math.max(parsedResult.confidence_score, 0), 1) : 0.7,
      extraction_method: 'gemini',
      processing_tier: 1,
      requires_validation: parsedResult.requires_validation !== false ? 
        (parsedResult.confidence_score < 0.85) : parsedResult.requires_validation,
      missing_fields: Array.isArray(parsedResult.missing_fields) ? parsedResult.missing_fields : [],
      suggested_category: undefined, // Will be populated by auto-categorization
      category_confidence: undefined,
      category_reason: undefined
    }
    
  } catch (parseError) {
    console.error('[Gemini SDK] Failed to parse JSON response:', parseError)
    throw new Error('Failed to parse Gemini extraction result')
  }
}

async function fallbackToColNomic(request: NextRequest, userId: string) {
  console.log('[Receipt Extraction API] Using ColNomic fallback')
  
  // Forward to existing ColNomic endpoint
  try {
    const formData = await request.formData()
    
    const response = await fetch(`${request.nextUrl.origin}/api/expense-claims/upload-receipt`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': request.headers.get('Authorization') || '',
        'Cookie': request.headers.get('Cookie') || ''
      }
    })

    const result = await response.json()
    
    if (result.success) {
      // Update the processing tier to indicate fallback
      const supabase = await createAuthenticatedSupabaseClient(userId)
      await supabase
        .from('documents')
        .update({ processing_tier: 2 })
        .eq('id', result.data.document_id)
        
      return NextResponse.json({
        ...result,
        data: {
          ...result.data,
          processing_tier: 2,
          extraction_method: 'colnomic'
        }
      })
    }
    
    return NextResponse.json(result, { status: response.status })
  } catch (error) {
    console.error('[Receipt Extraction API] ColNomic fallback failed:', error)
    return NextResponse.json(
      { success: false, error: 'All processing methods failed' },
      { status: 500 }
    )
  }
}