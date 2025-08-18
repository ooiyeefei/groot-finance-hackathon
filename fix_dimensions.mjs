import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const documentId = '9011679d-4cff-4b98-b8a7-e67359876ebd';
const storagePath = 'cc5fdbbc-1459-43ad-9736-3cc65649d23b/user_31B9ml2Dwl2q8qxYFS4E13ABXSe/1755440922083_whatsapp_image_2025-08-17_at_2.07.42_pm.jpeg';

// Original pixel coordinates before any normalization (from database inspection)
const originalCoordinates = {
  document_summary: {
    vendor_name: { bbox: [100, 80, 400, 120] },
    total_amount: { bbox: [850, 750, 950, 780] },
    document_type: { bbox: [50, 150, 150, 170] },
    transaction_date: { bbox: [700, 300, 800, 320] }
  }
};

// Function to get JPEG dimensions from buffer
function getJPEGDimensions(data) {
  let i = 2; // Skip SOI marker
  
  while (i < data.length) {
    // Look for SOF markers (Start of Frame)
    if (data[i] === 0xFF && (data[i + 1] === 0xC0 || data[i + 1] === 0xC2)) {
      // SOF marker found, dimensions are at offset 5 and 7 from marker
      const height = (data[i + 5] << 8) | data[i + 6];
      const width = (data[i + 7] << 8) | data[i + 8];
      return { width, height };
    }
    
    // Skip to next marker
    if (data[i] === 0xFF) {
      const length = (data[i + 2] << 8) | data[i + 3];
      i += length + 2;
    } else {
      i++;
    }
  }
  
  return null;
}

// Normalize bounding box coordinates to percentages with offset correction
function normalizeBbox(bbox, sourceDimensions, applyOffset = true) {
  if (!sourceDimensions || sourceDimensions.width === 0 || sourceDimensions.height === 0) {
    return { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] };
  }
  
  let [x1, y1, x2, y2] = bbox;
  
  // Apply offset corrections based on observed misalignment
  // The bounding boxes need to be shifted right and down - using smaller, more precise offsets
  if (applyOffset) {
    // Calculate offset as percentage of image dimensions - reduced from 25%/15% to 10%/5%
    const xOffsetPixels = sourceDimensions.width * 0.10;  // Shift right by 10% of width
    const yOffsetPixels = sourceDimensions.height * 0.05; // Shift down by 5% of height
    
    x1 += xOffsetPixels;
    y1 += yOffsetPixels;  
    x2 += xOffsetPixels;
    y2 += yOffsetPixels;
    
    // Ensure coordinates stay within image bounds
    x1 = Math.max(0, Math.min(x1, sourceDimensions.width));
    y1 = Math.max(0, Math.min(y1, sourceDimensions.height));
    x2 = Math.max(0, Math.min(x2, sourceDimensions.width));
    y2 = Math.max(0, Math.min(y2, sourceDimensions.height));
    
    console.log(`Applied offset: +${xOffsetPixels.toFixed(0)}px right, +${yOffsetPixels.toFixed(0)}px down`);
  }
  
  const x1Percent = (x1 / sourceDimensions.width) * 100;
  const y1Percent = (y1 / sourceDimensions.height) * 100;
  const x2Percent = (x2 / sourceDimensions.width) * 100;
  const y2Percent = (y2 / sourceDimensions.height) * 100;
  
  return {
    x1: parseFloat(x1Percent.toFixed(2)),
    y1: parseFloat(y1Percent.toFixed(2)),
    x2: parseFloat(x2Percent.toFixed(2)),
    y2: parseFloat(y2Percent.toFixed(2))
  };
}

async function fixDocument() {
  try {
    console.log('Getting signed URL for image...');
    
    // Get signed URL for the image
    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 600);
    
    if (urlError || !urlData?.signedUrl) {
      throw new Error(`Failed to get signed URL: ${urlError?.message}`);
    }
    
    console.log('Downloading image to detect dimensions...');
    
    // Download image and detect dimensions
    const response = await fetch(urlData.signedUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    
    const buffer = await response.buffer();
    const uint8Array = new Uint8Array(buffer);
    
    // Detect JPEG dimensions
    let dimensions = null;
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      dimensions = getJPEGDimensions(uint8Array);
      console.log(`Detected JPEG dimensions: ${dimensions?.width}x${dimensions?.height}`);
    }
    
    if (!dimensions) {
      throw new Error('Could not detect image dimensions');
    }
    
    // Get current document data
    console.log('Fetching current document data...');
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('extracted_data')
      .eq('id', documentId)
      .single();
    
    if (fetchError || !doc) {
      throw new Error(`Failed to fetch document: ${fetchError?.message}`);
    }
    
    const extractedData = doc.extracted_data;
    
    // Normalize document summary bounding boxes using original coordinates
    if (extractedData.document_summary) {
      Object.keys(extractedData.document_summary).forEach(key => {
        const item = extractedData.document_summary[key];
        if (item && originalCoordinates.document_summary[key]) {
          // Use original pixel coordinates instead of potentially corrupted ones
          const originalBbox = originalCoordinates.document_summary[key].bbox;
          const normalizedBbox = normalizeBbox(originalBbox, dimensions);
          item.bbox = [normalizedBbox.x1, normalizedBbox.y1, normalizedBbox.x2, normalizedBbox.y2];
          console.log(`Restored and normalized ${key}: [${originalBbox.join(',')}] -> [${item.bbox.join(',')}]`);
        }
      });
    }
    
    // Normalize metadata bounding boxes
    if (extractedData.metadata && extractedData.metadata.boundingBoxes) {
      extractedData.metadata.boundingBoxes.forEach((box, index) => {
        const originalCoords = [box.x1, box.y1, box.x2, box.y2];
        const normalizedBbox = normalizeBbox(originalCoords, dimensions);
        box.x1 = normalizedBbox.x1;
        box.y1 = normalizedBbox.y1;
        box.x2 = normalizedBbox.x2;
        box.y2 = normalizedBbox.y2;
        console.log(`Normalized bbox ${index}: [${box.x1},${box.y1},${box.x2},${box.y2}]`);
      });
    }
    
    // Normalize financial entities bounding boxes
    if (extractedData.financial_entities) {
      extractedData.financial_entities.forEach((entity, index) => {
        if (entity.bbox) {
          const normalizedBbox = normalizeBbox(entity.bbox, dimensions);
          entity.bbox = [normalizedBbox.x1, normalizedBbox.y1, normalizedBbox.x2, normalizedBbox.y2];
          console.log(`Normalized financial entity ${index}: [${entity.bbox.join(',')}]`);
        }
      });
    }
    
    // Update document with dimensions and normalized coordinates
    console.log('Updating document with dimensions and normalized coordinates...');
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        converted_image_width: dimensions.width,
        converted_image_height: dimensions.height,
        extracted_data: extractedData
      })
      .eq('id', documentId);
    
    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log('✅ Successfully updated document with normalized coordinates!');
    console.log(`Image dimensions: ${dimensions.width}x${dimensions.height}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixDocument();