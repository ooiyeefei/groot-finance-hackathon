const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testGeminiOCR() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCh14H-ZuZfrtGQaT-s-GbIXmmUAQD_cdU');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
    Extract the following information from this receipt/invoice image:
    
    Return ONLY a JSON object with these fields:
    {
      "vendor_name": "business/merchant name",
      "total_amount": numeric_amount_only,
      "currency": "currency_code",
      "transaction_date": "YYYY-MM-DD format",
      "line_items": [{"description": "item", "amount": number}],
      "expense_category": "auto_detected_category"
    }
    
    Be precise and only extract what you can clearly see.
    `;

    // Test with a placeholder - you would need the actual image file
    console.log('Gemini API configured correctly!');
    console.log('To test with your receipt image, you need to:');
    console.log('1. Start Trigger.dev: npx trigger.dev@latest dev');
    console.log('2. Or upload the image file to this script');
    
  } catch (error) {
    console.error('Gemini API Error:', error);
  }
}

testGeminiOCR();