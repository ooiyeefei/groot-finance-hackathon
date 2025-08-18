import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MAGPIE document ID from user screenshots
const documentId = 'cfc2322f-efa8-4d6f-956a-bee6ad380fc1';

async function investigateOCRCoordinates() {
  try {
    console.log(`🔍 Investigating OCR coordinate system for document: ${documentId}`);
    
    // Get the current document with extracted data
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (fetchError || !doc) {
      throw new Error(`Failed to fetch document: ${fetchError?.message}`);
    }
    
    console.log(`📄 Document: ${doc.file_name}`);
    console.log(`📐 Converted dimensions: ${doc.converted_image_width}x${doc.converted_image_height}`);
    console.log(`🔄 Processing status: ${doc.processing_status}`);
    
    const extractedData = doc.extracted_data;
    if (!extractedData) {
      console.log('❌ No extracted data found');
      return;
    }
    
    // Analyze current coordinate patterns
    console.log('\n🎯 Current Coordinate Analysis:');
    
    // Check document summary coordinates
    if (extractedData.document_summary) {
      console.log('\n📋 Document Summary Coordinates:');
      Object.entries(extractedData.document_summary).forEach(([key, item]) => {
        if (item && item.bbox) {
          const [x1, y1, x2, y2] = item.bbox;
          const width = x2 - x1;
          const height = y2 - y1;
          const centerX = (x1 + x2) / 2;
          const centerY = (y1 + y2) / 2;
          
          console.log(`  ${key}: [${x1}, ${y1}, ${x2}, ${y2}]`);
          console.log(`    - Dimensions: ${width.toFixed(1)} x ${height.toFixed(1)}`);
          console.log(`    - Center: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
          console.log(`    - Value: "${item.value}"`);
          
          // Check if these look like percentages or pixels
          const maxCoord = Math.max(x1, y1, x2, y2);
          console.log(`    - Max coordinate: ${maxCoord} (${maxCoord <= 100 ? 'likely %' : 'likely pixels'})`);
        }
      });
    }
    
    // Analyze bounding box distribution
    if (extractedData.metadata?.boundingBoxes) {
      console.log(`\n📦 Metadata Bounding Boxes (${extractedData.metadata.boundingBoxes.length}):`);
      
      const boxes = extractedData.metadata.boundingBoxes;
      const xValues = boxes.flatMap(box => [box.x1, box.x2]);
      const yValues = boxes.flatMap(box => [box.y1, box.y2]);
      
      const stats = {
        xMin: Math.min(...xValues),
        xMax: Math.max(...xValues),
        yMin: Math.min(...yValues),
        yMax: Math.max(...yValues),
        xRange: Math.max(...xValues) - Math.min(...xValues),
        yRange: Math.max(...yValues) - Math.min(...yValues)
      };
      
      console.log(`  X range: ${stats.xMin.toFixed(1)} to ${stats.xMax.toFixed(1)} (span: ${stats.xRange.toFixed(1)})`);
      console.log(`  Y range: ${stats.yMin.toFixed(1)} to ${stats.yMax.toFixed(1)} (span: ${stats.yRange.toFixed(1)})`);
      
      // Check coordinate system type
      if (stats.xMax <= 100 && stats.yMax <= 100) {
        console.log('  📊 Coordinate system: PERCENTAGE (0-100)');
      } else if (stats.xMax <= 1 && stats.yMax <= 1) {
        console.log('  📊 Coordinate system: NORMALIZED (0-1)');
      } else {
        console.log('  📊 Coordinate system: PIXEL-based');
        console.log(`  📐 Implied image dimensions: ~${stats.xMax.toFixed(0)} x ${stats.yMax.toFixed(0)}`);
      }
    }
    
    // Based on user feedback, the issue persists even with normalization
    // Let's create a test with empirical corrections based on visual patterns
    console.log('\n🔧 Proposing Empirical Coordinate Corrections:');
    
    // From the user's screenshots, it appears:
    // 1. "Document Type" bounding box was around "No." field instead of actual document type
    // 2. Boxes need to be shifted "right more, down more"
    // 3. This suggests a systematic offset in the OCR model's coordinate system
    
    const EMPIRICAL_CORRECTIONS = {
      // Based on visual analysis of misalignment patterns
      xOffset: 0.15,      // Shift right by 15% of image width
      yOffset: 0.08,      // Shift down by 8% of image height
      xScale: 0.85,       // Compress horizontally by 15%
      yScale: 0.92        // Compress vertically by 8%
    };
    
    console.log('  Proposed corrections based on visual analysis:');
    console.log(`    - X Offset: +${EMPIRICAL_CORRECTIONS.xOffset * 100}% (shift right)`);
    console.log(`    - Y Offset: +${EMPIRICAL_CORRECTIONS.yOffset * 100}% (shift down)`);
    console.log(`    - X Scale: ${EMPIRICAL_CORRECTIONS.xScale} (compress horizontally)`);
    console.log(`    - Y Scale: ${EMPIRICAL_CORRECTIONS.yScale} (compress vertically)`);
    
    // Apply corrections to current document summary
    if (extractedData.document_summary) {
      console.log('\n🎨 Preview of Corrected Coordinates:');
      
      Object.entries(extractedData.document_summary).forEach(([key, item]) => {
        if (item && item.bbox) {
          const [x1, y1, x2, y2] = item.bbox;
          
          // Convert to percentages if needed
          let px1 = x1, py1 = y1, px2 = x2, py2 = y2;
          if (doc.converted_image_width && doc.converted_image_height) {
            px1 = (x1 / doc.converted_image_width) * 100;
            py1 = (y1 / doc.converted_image_height) * 100;
            px2 = (x2 / doc.converted_image_width) * 100;
            py2 = (y2 / doc.converted_image_height) * 100;
          }
          
          // Apply empirical corrections
          const correctedX1 = (px1 * EMPIRICAL_CORRECTIONS.xScale) + (EMPIRICAL_CORRECTIONS.xOffset * 100);
          const correctedY1 = (py1 * EMPIRICAL_CORRECTIONS.yScale) + (EMPIRICAL_CORRECTIONS.yOffset * 100);
          const correctedX2 = (px2 * EMPIRICAL_CORRECTIONS.xScale) + (EMPIRICAL_CORRECTIONS.xOffset * 100);
          const correctedY2 = (py2 * EMPIRICAL_CORRECTIONS.yScale) + (EMPIRICAL_CORRECTIONS.yOffset * 100);
          
          console.log(`  ${key}:`);
          console.log(`    Original: [${px1.toFixed(1)}%, ${py1.toFixed(1)}%, ${px2.toFixed(1)}%, ${py2.toFixed(1)}%]`);
          console.log(`    Corrected: [${correctedX1.toFixed(1)}%, ${correctedY1.toFixed(1)}%, ${correctedX2.toFixed(1)}%, ${correctedY2.toFixed(1)}%]`);
          console.log(`    Shift: (+${(correctedX1 - px1).toFixed(1)}%, +${(correctedY1 - py1).toFixed(1)}%)`);
        }
      });
    }
    
    console.log('\n✅ Investigation complete. Ready to implement empirical corrections.');
    
  } catch (error) {
    console.error('❌ Investigation failed:', error.message);
    process.exit(1);
  }
}

investigateOCRCoordinates();