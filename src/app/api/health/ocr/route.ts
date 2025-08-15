import { NextRequest, NextResponse } from 'next/server'
import { getAIServiceFactory } from '@/lib/ai-services'
import { DocumentContext } from '@/lib/ai-services/types'

export async function GET(request: NextRequest) {
  try {
    console.log('[OCR Health] Starting OCR service health check')
    
    const aiFactory = getAIServiceFactory()
    const ocrService = aiFactory.getOCRService()
    
    // Check OCR service health
    const healthResult = await ocrService.checkHealth()
    
    console.log('[OCR Health] Health check result:', healthResult)
    
    return NextResponse.json({
      success: true,
      service: 'OCR',
      health: healthResult,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[OCR Health] Health check failed:', error)
    
    return NextResponse.json({
      success: false,
      service: 'OCR',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[OCR Test] Starting test OCR processing')
    
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
    
    console.log('[OCR Test] Processing test document...')
    const result = await ocrService.processDocument(testContext)
    
    console.log('[OCR Test] OCR processing successful:', result)
    
    return NextResponse.json({
      success: true,
      message: 'Test OCR processing completed',
      result: result,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[OCR Test] Test OCR processing failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Test OCR processing failed',
      errorDetails: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}