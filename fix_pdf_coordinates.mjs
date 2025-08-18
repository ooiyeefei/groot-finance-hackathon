import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Target PDF document from screenshots
const documentId = 'cfc2322f-efa8-4d6f-956a-bee6ad380fc1'; // MAGPIE I-2507_0535.pdf
const sourceDimensions = { width: 1275, height: 1650 }; // OCR processed PNG dimensions

// Enhanced coordinate transformation with precise correction
function transformCoordinates(bbox, sourceDimensions) {
  if (!sourceDimensions || sourceDimensions.width === 0 || sourceDimensions.height === 0) {
    return { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] };
  }
  
  let [x1, y1, x2, y2] = bbox;
  
  // Apply fine-tuned coordinate corrections based on visual analysis
  // The OCR coordinates appear to have a systematic bias
  
  // Apply corrections: The bounding boxes need to be moved to match actual text positions
  // Based on screenshot analysis, coordinates need adjustment
  const xCorrectionFactor = 0.95; // Slight compression horizontally
  const yCorrectionFactor = 0.98; // Slight compression vertically
  const xOffset = -30; // Shift left by 30 pixels
  const yOffset = 10;  // Shift down by 10 pixels
  
  // Apply corrections
  x1 = (x1 * xCorrectionFactor) + xOffset;
  y1 = (y1 * yCorrectionFactor) + yOffset;
  x2 = (x2 * xCorrectionFactor) + xOffset;
  y2 = (y2 * yCorrectionFactor) + yOffset;
  
  // Ensure coordinates stay within bounds
  x1 = Math.max(0, Math.min(x1, sourceDimensions.width));
  y1 = Math.max(0, Math.min(y1, sourceDimensions.height));
  x2 = Math.max(0, Math.min(x2, sourceDimensions.width));
  y2 = Math.max(0, Math.min(y2, sourceDimensions.height));
  
  // Convert to percentages
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

async function fixPDFCoordinates() {
  try {
    console.log(`Fixing coordinates for MAGPIE PDF document: ${documentId}`);
    
    // Get current document data
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('extracted_data, file_name')
      .eq('id', documentId)
      .single();
    
    if (fetchError || !doc) {
      throw new Error(`Failed to fetch document: ${fetchError?.message}`);
    }
    
    console.log(`Processing: ${doc.file_name}`);
    const extractedData = JSON.parse(JSON.stringify(doc.extracted_data));
    
    // Transform document summary bounding boxes
    if (extractedData.document_summary) {
      Object.keys(extractedData.document_summary).forEach(key => {
        const item = extractedData.document_summary[key];
        if (item && item.bbox) {
          const originalBbox = item.bbox;
          const transformedBbox = transformCoordinates(originalBbox, sourceDimensions);
          item.bbox = [transformedBbox.x1, transformedBbox.y1, transformedBbox.x2, transformedBbox.y2];
          console.log(`${key}: [${originalBbox.join(',')}] → [${item.bbox.join(',')}]`);
        }
      });
    }
    
    // Transform metadata bounding boxes
    if (extractedData.metadata && extractedData.metadata.boundingBoxes) {
      extractedData.metadata.boundingBoxes.forEach((box, index) => {
        const originalCoords = [box.x1, box.y1, box.x2, box.y2];
        const transformedBbox = transformCoordinates(originalCoords, sourceDimensions);
        box.x1 = transformedBbox.x1;
        box.y1 = transformedBbox.y1;
        box.x2 = transformedBbox.x2;
        box.y2 = transformedBbox.y2;
        console.log(`BBox ${index}: [${originalCoords.join(',')}] → [${box.x1},${box.y1},${box.x2},${box.y2}]`);
      });
    }
    
    // Handle financial entities if they exist
    if (extractedData.financial_entities) {
      extractedData.financial_entities.forEach((entity, index) => {
        if (entity.bbox) {
          const originalBbox = entity.bbox;
          const transformedBbox = transformCoordinates(originalBbox, sourceDimensions);
          entity.bbox = [transformedBbox.x1, transformedBbox.y1, transformedBbox.x2, transformedBbox.y2];
          console.log(`Entity ${index}: [${originalBbox.join(',')}] → [${entity.bbox.join(',')}]`);
        }
      });
    }
    
    // Update document with corrected coordinates
    const { error: updateError } = await supabase
      .from('documents')
      .update({ extracted_data: extractedData })
      .eq('id', documentId);
    
    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log('✅ Successfully updated PDF coordinates with precise transformation!');
    console.log(`Document: ${doc.file_name}`);
    console.log(`Source dimensions: ${sourceDimensions.width}x${sourceDimensions.height}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixPDFCoordinates();