import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MAGPIE document ID for testing
const documentId = 'cfc2322f-efa8-4d6f-956a-bee6ad380fc1';

// Empirical corrections based on visual analysis of misalignment patterns
const COORDINATE_CORRECTIONS = {
  // Shift coordinates to align with actual text positions
  xOffsetPercent: 15,    // Shift right by 15% of image width
  yOffsetPercent: 8,     // Shift down by 8% of image height
  xScale: 0.85,          // Compress horizontally by 15%
  yScale: 0.92           // Compress vertically by 8%
};

/**
 * Apply empirical coordinate corrections to fix systematic OCR misalignment
 */
function applyCoordinateCorrections(bbox, sourceDimensions) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return bbox;
  
  let [x1, y1, x2, y2] = bbox;
  
  // Convert to percentages if they're in pixel format
  if (sourceDimensions && sourceDimensions.width > 0 && sourceDimensions.height > 0) {
    // Check if coordinates are already percentages
    const maxCoord = Math.max(x1, y1, x2, y2);
    if (maxCoord > 100) {
      // Convert pixels to percentages
      x1 = (x1 / sourceDimensions.width) * 100;
      y1 = (y1 / sourceDimensions.height) * 100;
      x2 = (x2 / sourceDimensions.width) * 100;
      y2 = (y2 / sourceDimensions.height) * 100;
    }
  }
  
  // Apply empirical corrections based on visual analysis
  const correctedX1 = (x1 * COORDINATE_CORRECTIONS.xScale) + COORDINATE_CORRECTIONS.xOffsetPercent;
  const correctedY1 = (y1 * COORDINATE_CORRECTIONS.yScale) + COORDINATE_CORRECTIONS.yOffsetPercent;
  const correctedX2 = (x2 * COORDINATE_CORRECTIONS.xScale) + COORDINATE_CORRECTIONS.xOffsetPercent;
  const correctedY2 = (y2 * COORDINATE_CORRECTIONS.yScale) + COORDINATE_CORRECTIONS.yOffsetPercent;
  
  // Ensure coordinates stay within bounds (0-100%)
  const clampedX1 = Math.max(0, Math.min(correctedX1, 100));
  const clampedY1 = Math.max(0, Math.min(correctedY1, 100));
  const clampedX2 = Math.max(0, Math.min(correctedX2, 100));
  const clampedY2 = Math.max(0, Math.min(correctedY2, 100));
  
  console.log(`[Correction] [${x1.toFixed(1)}, ${y1.toFixed(1)}, ${x2.toFixed(1)}, ${y2.toFixed(1)}] → [${clampedX1.toFixed(1)}, ${clampedY1.toFixed(1)}, ${clampedX2.toFixed(1)}, ${clampedY2.toFixed(1)}]`);
  
  return [
    parseFloat(clampedX1.toFixed(2)),
    parseFloat(clampedY1.toFixed(2)),
    parseFloat(clampedX2.toFixed(2)),
    parseFloat(clampedY2.toFixed(2))
  ];
}

async function fixOCRCoordinateSystem() {
  try {
    console.log(`🔧 Applying empirical coordinate corrections to document: ${documentId}`);
    console.log(`📐 Corrections: X offset +${COORDINATE_CORRECTIONS.xOffsetPercent}%, Y offset +${COORDINATE_CORRECTIONS.yOffsetPercent}%`);
    console.log(`📏 Scaling: X ${COORDINATE_CORRECTIONS.xScale}, Y ${COORDINATE_CORRECTIONS.yScale}`);
    
    // Get current document data
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (fetchError || !doc) {
      throw new Error(`Failed to fetch document: ${fetchError?.message}`);
    }
    
    console.log(`📄 Processing: ${doc.file_name}`);
    const sourceDimensions = {
      width: doc.converted_image_width || 1275,
      height: doc.converted_image_height || 1650
    };
    
    const extractedData = JSON.parse(JSON.stringify(doc.extracted_data));
    
    // Apply corrections to document summary bounding boxes
    if (extractedData.document_summary) {
      console.log('\n📋 Correcting Document Summary coordinates:');
      Object.keys(extractedData.document_summary).forEach(key => {
        const item = extractedData.document_summary[key];
        if (item && item.bbox) {
          const originalBbox = [...item.bbox];
          const correctedBbox = applyCoordinateCorrections(item.bbox, sourceDimensions);
          item.bbox = correctedBbox;
          console.log(`  ${key} (${item.value}): [${originalBbox.join(',')}] → [${correctedBbox.join(',')}]`);
        }
      });
    }
    
    // Apply corrections to financial entities
    if (extractedData.financial_entities) {
      console.log('\n💰 Correcting Financial Entities coordinates:');
      extractedData.financial_entities.forEach((entity, index) => {
        if (entity.bbox) {
          const originalBbox = [...entity.bbox];
          const correctedBbox = applyCoordinateCorrections(entity.bbox, sourceDimensions);
          entity.bbox = correctedBbox;
          console.log(`  Entity ${index} (${entity.label}): [${originalBbox.join(',')}] → [${correctedBbox.join(',')}]`);
        }
      });
    }
    
    // Apply corrections to line items
    if (extractedData.line_items) {
      console.log('\n📝 Correcting Line Items coordinates:');
      extractedData.line_items.forEach((item, index) => {
        const fields = ['description', 'quantity', 'unit_price', 'line_total'];
        fields.forEach(field => {
          if (item[field] && item[field].bbox) {
            const originalBbox = [...item[field].bbox];
            const correctedBbox = applyCoordinateCorrections(item[field].bbox, sourceDimensions);
            item[field].bbox = correctedBbox;
            console.log(`  Line ${index + 1} ${field}: [${originalBbox.join(',')}] → [${correctedBbox.join(',')}]`);
          }
        });
      });
    }
    
    // Apply corrections to metadata bounding boxes
    if (extractedData.metadata && extractedData.metadata.boundingBoxes) {
      console.log('\n📦 Correcting Metadata bounding boxes:');
      extractedData.metadata.boundingBoxes.forEach((box, index) => {
        const originalCoords = [box.x1, box.y1, box.x2, box.y2];
        const correctedCoords = applyCoordinateCorrections(originalCoords, sourceDimensions);
        [box.x1, box.y1, box.x2, box.y2] = correctedCoords;
        console.log(`  BBox ${index}: [${originalCoords.join(',')}] → [${correctedCoords.join(',')}]`);
      });
    }
    
    // Update document with corrected coordinates
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        extracted_data: extractedData,
        processed_at: new Date().toISOString() // Update timestamp to reflect correction
      })
      .eq('id', documentId);
    
    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log('\n✅ Successfully applied empirical coordinate corrections!');
    console.log(`📄 Document: ${doc.file_name}`);
    console.log(`📐 Source dimensions: ${sourceDimensions.width}x${sourceDimensions.height}`);
    console.log(`🎯 Applied corrections: X offset +${COORDINATE_CORRECTIONS.xOffsetPercent}%, Y offset +${COORDINATE_CORRECTIONS.yOffsetPercent}%`);
    console.log('🔍 Test in the document analysis modal to verify alignment');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixOCRCoordinateSystem();