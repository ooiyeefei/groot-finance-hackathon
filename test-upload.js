const fs = require('fs');
const path = require('path');

async function testDocumentUpload() {
  // Create a simple test image (1x1 white PNG)
  const testImageData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00, 
    0x01, 0x00, 0x01, 0x5C, 0xB7, 0x2B, 0x8A, 0x00, 0x00, 0x00, 0x00, 0x49, 
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);

  // Create form data
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', testImageData, {
    filename: 'test.png',
    contentType: 'image/png'
  });

  try {
    console.log('Uploading test document...');
    const uploadResponse = await fetch('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!uploadResponse.ok) {
      console.error('Upload failed:', await uploadResponse.text());
      return;
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);

    if (uploadResult.documentId) {
      console.log('Processing document...');
      const processResponse = await fetch(`http://localhost:3000/api/documents/${uploadResult.documentId}/process`, {
        method: 'POST'
      });

      if (!processResponse.ok) {
        console.error('Processing failed:', await processResponse.text());
        return;
      }

      const processResult = await processResponse.json();
      console.log('Processing result:', processResult);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testDocumentUpload();