import { NextRequest, NextResponse } from 'next/server'
import { getAIServiceFactory } from '@/lib/ai-services'
import { DocumentContext } from '@/lib/ai-services/types'

export async function POST(request: NextRequest) {
  try {
    console.log('[Test OCR] Starting test OCR processing')
    
    // Create a simple test image (1x1 white PNG as base64)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAQAFAAECs8LEgAAAABJRU5ErkJggg=='
    const testImageBuffer = Buffer.from(testImageBase64, 'base64')
    
    // Create test document context
    const testContext: DocumentContext = {
      id: 'test-document',
      buffer: testImageBuffer,
      fileName: 'test.png',
      fileType: 'image/png',
      fileSize: testImageBuffer.length
    }
    
    const aiFactory = getAIServiceFactory()
    const ocrService = aiFactory.getOCRService()
    
    console.log('[Test OCR] Processing test document...')
    const result = await ocrService.processDocument(testContext)
    
    console.log('[Test OCR] OCR processing successful:', result)
    
    return NextResponse.json({
      success: true,
      message: 'Test OCR processing completed',
      result: result,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[Test OCR] Test OCR processing failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Test OCR processing failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}