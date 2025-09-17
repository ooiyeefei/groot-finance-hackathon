#!/usr/bin/env node

/**
 * Test DSPy Structured Output Implementation
 * 
 * This script tests the fixed DSPy implementation directly with structured output
 * using the new Pydantic models and JSONAdapter configuration.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

console.log('🚀 Testing DSPy Structured Output Implementation');
console.log('=====================================');

// Test receipt data - Shell petrol station (the problematic one from user screenshots)
const testReceiptText = `
SHELL PETROL STATION
123 MAIN STREET
SINGAPORE 123456

Date: 27/JUL/2025
Time: 14:30

PETROL 95 OCTANE
20.50 L @ RM 2.45/L
Total: RM 50.23

GST: RM 4.52
DISCOUNT: RM 5.52

TOTAL AMOUNT: RM 91.23

Payment Method: Credit Card
Card Number: ****1234
Auth Code: 123456

Thank you for your business!
Receipt No: R123456789
`;

const imageMetadata = {
  confidence: 0.9,
  quality: 'excellent',
  textLength: testReceiptText.length
};

// Inline Python script that matches the implementation in dspy-receipt-extraction.ts
const pythonScript = `
# Hybrid DSPy Receipt Extraction with Structured Output Testing
import dspy
import os
import json
import re
import sys
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import traceback

# Test data - passed from Node.js
receipt_text = """${testReceiptText.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"""
image_metadata = ${JSON.stringify(imageMetadata)}

print("🔍 Testing DSPy Structured Output with:", file=sys.stderr)
print(f"📝 Receipt text length: {len(receipt_text)} chars", file=sys.stderr)
print(f"🖼️ Image metadata: {json.dumps(image_metadata)}", file=sys.stderr)

# Pydantic models for structured receipt processing
class ExtractedLineItem(BaseModel):
    description: str = Field(..., description="Item description/name")
    quantity: Optional[float] = Field(None, description="Quantity purchased")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total amount for this line item")

class ExtractedReceiptData(BaseModel):
    vendor_name: str = Field(..., description="The name of the merchant or store")
    transaction_date: str = Field(..., description="Transaction date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="Currency code in ISO 4217 format")
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax and tips")
    tax_amount: Optional[float] = Field(None, description="Total tax amount")
    receipt_number: Optional[str] = Field(None, description="Receipt or invoice number")
    line_items: List[ExtractedLineItem] = Field(default_factory=list, description="Individual purchased items")
    extraction_quality: Literal['high', 'medium', 'low'] = Field(..., description="Quality assessment")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")
    missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")
    processing_method: Literal['dspy', 'manual_entry'] = Field(default='dspy')
    model_used: Optional[str] = Field(None, description="AI model used for extraction")

class ExtractionReasoning(BaseModel):
    step1_vendor_analysis: str = Field(..., description="Reasoning for vendor identification")
    step2_date_identification: str = Field(..., description="Reasoning for date extraction")
    step3_amount_parsing: str = Field(..., description="Reasoning for amount extraction")
    step4_tax_calculation: str = Field(..., description="Reasoning for tax analysis")
    step5_line_items_extraction: str = Field(..., description="Reasoning for line items extraction")
    step6_validation_checks: str = Field(..., description="Reasoning for validation")
    final_confidence_assessment: str = Field(..., description="Overall confidence reasoning")

class DSPyExtractionResult(BaseModel):
    thinking: ExtractionReasoning = Field(..., description="Chain-of-thought reasoning")
    extracted_data: ExtractedReceiptData = Field(..., description="Structured extracted data")
    processing_complete: bool = Field(..., description="Whether processing completed successfully")
    needs_manual_review: bool = Field(..., description="Whether manual review is recommended")
    suggested_corrections: List[str] = Field(default_factory=list, description="Suggested improvements")

# Response model for consistent output
class ScriptResponse(BaseModel):
    success: bool = Field(..., description="Whether the script executed successfully")
    data: Optional[Dict[str, Any]] = Field(None, description="Extraction result data")
    error: Optional[str] = Field(None, description="Error message if failed")
    debug_info: Optional[Dict[str, Any]] = Field(None, description="Debug information")

# DSPy Signature with Structured Output
class StructuredReceiptSignature(dspy.Signature):
    """Advanced structured extraction with complete Pydantic validation"""
    receipt_text: str = dspy.InputField(desc="OCR text from receipt")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data")

try:
    print("🔧 Configuring DSPy with structured output...", file=sys.stderr)
    
    # Configure DSPy with Gemini and JSONAdapter
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not found")
    
    # Use DSPy's native Gemini integration with JSONAdapter
    lm = dspy.LM("gemini/gemini-2.5-flash", api_key=api_key)
    dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())
    
    print("✅ DSPy configured with Gemini 2.5 Flash + JSONAdapter", file=sys.stderr)
    
    # Initialize structured predictor
    structured_extractor = dspy.ChainOfThought(StructuredReceiptSignature)
    
    print("🔍 Running structured DSPy extraction...", file=sys.stderr)
    
    # Run the prediction - should return validated Pydantic objects!
    prediction = structured_extractor(receipt_text=receipt_text)
    
    print("✅ DSPy extraction completed!", file=sys.stderr)
    print(f"🔧 Prediction type: {type(prediction)}", file=sys.stderr)
    
    # With structured output, extracted_data should be a validated ExtractedReceiptData object
    extracted_data = prediction.extracted_data
    
    print(f"🏪 Vendor: {extracted_data.vendor_name}", file=sys.stderr)
    print(f"💰 Amount: {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
    print(f"🗓️ Date: {extracted_data.transaction_date}", file=sys.stderr)
    print(f"🎯 Confidence: {extracted_data.confidence_score * 100:.1f}%", file=sys.stderr)
    
    # Build full result structure
    reasoning = ExtractionReasoning(
        step1_vendor_analysis=f"Structured processing identified: {extracted_data.vendor_name}",
        step2_date_identification=f"Date extracted: {extracted_data.transaction_date}",
        step3_amount_parsing=f"Amount: {extracted_data.total_amount} {extracted_data.currency}",
        step4_tax_calculation=f"Tax: {extracted_data.tax_amount or 'N/A'}",
        step5_line_items_extraction=f"Line items: {len(extracted_data.line_items)} found",
        step6_validation_checks="Structured validation passed",
        final_confidence_assessment=f"Structured confidence: {extracted_data.confidence_score}"
    )
    
    result = DSPyExtractionResult(
        thinking=reasoning,
        extracted_data=extracted_data,
        processing_complete=True,
        needs_manual_review=extracted_data.confidence_score < 0.7,
        suggested_corrections=[]
    )
    
    # Convert to output format
    output_data = {
        "success": True,
        "vendor_name": extracted_data.vendor_name,
        "total_amount": extracted_data.total_amount,
        "currency": extracted_data.currency,
        "transaction_date": extracted_data.transaction_date,
        "description": f"{extracted_data.vendor_name} - {extracted_data.transaction_date}",
        "line_items": [
            {
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_amount": item.line_total
            }
            for item in extracted_data.line_items
        ],
        "tax_amount": extracted_data.tax_amount,
        "receipt_number": extracted_data.receipt_number,
        "confidence_score": extracted_data.confidence_score,
        "extraction_method": "dspy_structured",
        "processing_tier": 1,
        "requires_validation": result.needs_manual_review,
        "extraction_quality": extracted_data.extraction_quality,
        "reasoning_steps": {
            "step1_vendor_analysis": result.thinking.step1_vendor_analysis,
            "step2_date_identification": result.thinking.step2_date_identification,
            "step3_amount_parsing": result.thinking.step3_amount_parsing,
            "step4_tax_calculation": result.thinking.step4_tax_calculation,
            "step5_line_items_extraction": result.thinking.step5_line_items_extraction,
            "step6_validation_checks": result.thinking.step6_validation_checks,
            "final_confidence_assessment": result.thinking.final_confidence_assessment
        },
        "suggested_corrections": result.suggested_corrections
    }
    
    response = ScriptResponse(
        success=True,
        data=output_data,
        debug_info={
            "model_used": extracted_data.model_used or "gemini-2.5-flash-structured",
            "processing_method": "structured_dspy",
            "pydantic_validation": True
        }
    )
    
except Exception as e:
    print(f"❌ Structured DSPy extraction failed: {str(e)}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    
    response = ScriptResponse(
        success=False,
        error=str(e),
        debug_info={"error_type": type(e).__name__}
    )

# CRITICAL: Only this line outputs to stdout - everything else goes to stderr
print(response.model_dump_json())
`;

async function testDSpyStructured() {
  try {
    console.log('📋 Test Parameters:');
    console.log(`   Receipt text: ${testReceiptText.length} characters`);
    console.log(`   Image metadata: ${JSON.stringify(imageMetadata)}`);
    console.log('');

    console.log('🐍 Running Python DSPy test...');
    
    // Save Python script to temporary file
    const fs = await import('fs/promises');
    const tempScript = './temp_dspy_test.py';
    
    await fs.writeFile(tempScript, pythonScript);
    console.log('📝 Python script written to temp file');

    // Execute Python script
    const { spawn } = await import('child_process');
    const python = spawn('python3', [tempScript], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise((resolve, reject) => {
      python.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });
    });

    // Clean up temp file
    await fs.unlink(tempScript);

    console.log('🔍 Python stderr output:');
    console.log(stderr);
    console.log('');

    console.log('📤 Python stdout result:');
    console.log(stdout);
    console.log('');

    // Parse the result
    const result = JSON.parse(stdout.trim());
    
    console.log('✅ DSPy Structured Output Test Results:');
    console.log('==========================================');
    
    if (result.success) {
      console.log('🎉 SUCCESS! Structured DSPy extraction worked!');
      console.log('');
      console.log('📊 Extracted Data:');
      console.log(`   Vendor: ${result.data.vendor_name}`);
      console.log(`   Amount: ${result.data.total_amount} ${result.data.currency}`);
      console.log(`   Date: ${result.data.transaction_date}`);
      console.log(`   Receipt #: ${result.data.receipt_number || 'N/A'}`);
      console.log(`   Confidence: ${(result.data.confidence_score * 100).toFixed(1)}%`);
      console.log(`   Quality: ${result.data.extraction_quality}`);
      console.log(`   Method: ${result.data.extraction_method}`);
      console.log('');
      
      if (result.data.line_items && result.data.line_items.length > 0) {
        console.log('🛍️ Line Items:');
        result.data.line_items.forEach((item, idx) => {
          console.log(`   ${idx + 1}. ${item.description}: ${item.total_amount} (qty: ${item.quantity || 'N/A'})`);
        });
        console.log('');
      }
      
      console.log('🧠 Reasoning Steps:');
      Object.entries(result.data.reasoning_steps).forEach(([step, reasoning]) => {
        console.log(`   ${step}: ${reasoning}`);
      });
      
    } else {
      console.log('❌ FAILED! DSPy extraction encountered an error:');
      console.log(`   Error: ${result.error}`);
      console.log(`   Debug: ${JSON.stringify(result.debug_info, null, 2)}`);
    }

  } catch (error) {
    console.error('💥 Test execution failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDSpyStructured();