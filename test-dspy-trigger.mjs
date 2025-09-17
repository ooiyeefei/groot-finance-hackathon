import { tasks } from '@trigger.dev/sdk/v3';

// Test the DSPy extraction task directly
const testPayload = {
  receiptText: "Receipt from test\nAmount: $25.50\nDate: 2024-12-10\nVendor: STARBUCKS",
  receiptImageUrl: null,
  documentId: null,
  userId: "test_user_123",
  imageMetadata: {
    confidence: 0.85,
    quality: 'good',
    textLength: 69
  },
  forcedProcessingMethod: 'auto',
  requestId: 'test-' + Date.now()
};

console.log('🚀 Triggering DSPy extraction task...');
console.log('Payload:', JSON.stringify(testPayload, null, 2));

try {
  const result = await tasks.trigger('dspy-receipt-extraction', testPayload);
  console.log('✅ Task triggered successfully:', result.id);
} catch (error) {
  console.error('❌ Task trigger failed:', error.message);
}
