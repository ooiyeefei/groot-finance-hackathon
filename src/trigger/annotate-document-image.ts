/**
 * Trigger.dev Job Definition: Document Image Annotation (Python + OpenCV)
 * 
 * Creates annotated images with bounding boxes drawn directly on the image
 * after OCR processing is complete. Uses Python + OpenCV for professional
 * image processing and annotation quality.
 */

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from '@supabase/supabase-js';
import { python } from '@trigger.dev/python';
import { promises as fs } from 'fs';

// Initialize Supabase client with service role key for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ PHASE 4L: Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

// ✅ PHASE 4L: Domain-to-bucket mapping for multi-bucket architecture
const DOMAIN_BUCKET_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  category: string;
  text: string;
}

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Scale bounding box coordinates to match actual image dimensions
 * OCR models often assume different image sizes than our PDF converter output
 * PDF converter standardizes to 1024x1400, but OCR may assume different dimensions
 */
function scaleBoundingBoxes(
  boundingBoxes: BoundingBox[], 
  actualDimensions: ImageDimensions,
  assumedDimensions: ImageDimensions = { width: 1024, height: 1400 }
): BoundingBox[] {
  const scaleX = actualDimensions.width / assumedDimensions.width;
  const scaleY = actualDimensions.height / assumedDimensions.height;
  
  console.log(`[Annotation] Scaling coordinates: ${assumedDimensions.width}x${assumedDimensions.height} → ${actualDimensions.width}x${actualDimensions.height}`);
  console.log(`[Annotation] Scale factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);
  
  return boundingBoxes.map(box => ({
    ...box,
    x1: Math.round(box.x1 * scaleX),
    y1: Math.round(box.y1 * scaleY),
    x2: Math.round(box.x2 * scaleX),
    y2: Math.round(box.y2 * scaleY)
  }));
}

/**
 * Creates an annotated image using Python + OpenCV for professional quality
 * This is the industry standard approach for computer vision tasks
 */
/**
 * Get actual image dimensions without processing annotations
 */
async function getImageDimensions(imageUrl: string): Promise<ImageDimensions> {
  try {
    // Use a simple Python script call to get dimensions only
    const result = await python.runScript(
      "./src/python/annotate_image.py",
      [imageUrl, "[]"] // Empty bounding boxes array to just get dimensions
    );
    
    const scriptResult = JSON.parse(result.stdout);
    if (!scriptResult.success) {
      throw new Error(`Failed to get image dimensions: ${scriptResult.error}`);
    }
    
    return {
      width: scriptResult.original_size.width,
      height: scriptResult.original_size.height
    };
  } catch (error) {
    console.error(`[Annotation] Failed to get image dimensions:`, error);
    throw error;
  }
}

async function createAnnotatedImage(
  originalImageUrl: string,
  boundingBoxes: BoundingBox[]
): Promise<string> {
  console.log(`[Annotation] Starting Python + OpenCV annotation for ${boundingBoxes.length} boxes`);
  
  try {
    // Run Python script with OpenCV for professional image annotation
    const result = await python.runScript(
      "./src/python/annotate_image.py",
      [
        originalImageUrl,
        JSON.stringify(boundingBoxes)
      ]
    );
    
    // Parse the result from Python script
    const scriptResult = JSON.parse(result.stdout);
    
    if (!scriptResult.success) {
      throw new Error(`Python annotation failed: ${scriptResult.error}`);
    }
    
    console.log(`[Annotation] Python script completed successfully`);
    console.log(`[Annotation] Processed ${scriptResult.annotations_count} annotations`);
    console.log(`[Annotation] Original size: ${scriptResult.original_size.width}x${scriptResult.original_size.height}`);
    
    return scriptResult.output_path;
    
  } catch (error) {
    console.error(`[Annotation] Python script error:`, error);
    throw new Error(`Failed to run Python annotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Main Trigger.dev v3 Task Definition ---

/**
 * Smart filtering function to reduce overlapping bounding boxes
 * Prioritizes field-level boxes over row-level boxes for line items
 */
function filterBoundingBoxes(boundingBoxes: BoundingBox[]): BoundingBox[] {
  const filtered: BoundingBox[] = [];
  const rowCategories = new Set<string>();
  
  // First pass: collect all row-level categories
  boundingBoxes.forEach(box => {
    if (box.category.startsWith('line_item_row_')) {
      rowCategories.add(box.category);
    }
  });
  
  // Second pass: filter boxes intelligently
  boundingBoxes.forEach(box => {
    // Always include document-level and financial entities
    if (!box.category.startsWith('line_item_')) {
      filtered.push(box);
      return;
    }
    
    // For line items: prioritize field-level boxes, skip row-level boxes
    if (box.category.startsWith('line_item_row_')) {
      // Skip row-level boxes - we want field-level granularity
      console.log(`[Annotation] Skipping row-level box: ${box.category}`);
      return;
    }
    
    // Include field-level line item boxes (description, quantity, price, etc.)
    if (box.category.startsWith('line_item_')) {
      filtered.push(box);
    }
  });
  
  console.log(`[Annotation] Filtered ${boundingBoxes.length} boxes down to ${filtered.length} relevant annotations`);
  return filtered;
}

export const annotateDocumentImage = task({
  id: "annotate-document-image",
  run: async (payload: {
    documentId: string;
    imageStoragePath: string;
    extractedData: any;
    documentDomain: 'invoices' | 'expense_claims' | 'applications'; // ✅ PHASE 4L: Domain routing parameter
  }) => {
    console.log(`✅ Starting annotation process for document: ${payload.documentId}`);

    // ✅ PHASE 4L: Route to correct table and bucket based on domain
    const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];
    const bucketName = DOMAIN_BUCKET_MAP[payload.documentDomain];
    console.log(`🔍 Using table: ${tableName} and bucket: ${bucketName} for domain: ${payload.documentDomain}`);

    try {
      // Step 1: Extract and filter bounding boxes from OCR results
      const rawBoundingBoxes = payload.extractedData?.metadata?.boundingBoxes || [];
      
      if (rawBoundingBoxes.length === 0) {
        console.log(`[Annotation] No bounding boxes found for document: ${payload.documentId}`);
        return { 
          success: true, 
          message: 'No annotations to create - no bounding boxes found',
          documentId: payload.documentId 
        };
      }

      console.log(`[Annotation] Found ${rawBoundingBoxes.length} raw bounding boxes`);
      
      // Apply smart filtering to reduce overlapping annotations
      const boundingBoxes = filterBoundingBoxes(rawBoundingBoxes);
      
      if (boundingBoxes.length === 0) {
        console.log(`[Annotation] No bounding boxes remaining after filtering for document: ${payload.documentId}`);
        return { 
          success: true, 
          message: 'No annotations to create after filtering',
          documentId: payload.documentId 
        };
      }

      console.log(`[Annotation] Using ${boundingBoxes.length} filtered bounding boxes for annotation`);

      // Step 2: Create signed URL for original image
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4L: Route to correct bucket
        .createSignedUrl(payload.imageStoragePath, 600); // 10 minutes validity

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL for original image: ${urlError?.message}`);
      }

      console.log(`[Annotation] Created signed URL for original image`);

      // Step 3: Get actual image dimensions to fix coordinate scaling issue
      console.log(`[Annotation] Getting actual image dimensions for coordinate scaling`);
      const actualDimensions = await getImageDimensions(urlData.signedUrl);
      
      // Step 4: Scale coordinates based on actual vs assumed dimensions
      // This fixes the critical positioning mismatch where annotations appear in wrong locations
      // OCR models often assume different image sizes than our PDF converter output (1024x1400)
      const scaledBoundingBoxes = scaleBoundingBoxes(boundingBoxes, actualDimensions);
      
      console.log(`[Annotation] Applied coordinate scaling for ${scaledBoundingBoxes.length} bounding boxes`);
      
      // Step 5: Generate annotated image using scaled coordinates
      const tempImagePath = await createAnnotatedImage(
        urlData.signedUrl, 
        scaledBoundingBoxes
      );

      // Step 6: Read the annotated image from temporary file
      const annotatedImageBuffer = await fs.readFile(tempImagePath);

      // Step 7: Generate annotated storage path
      const pathParts = payload.imageStoragePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const directory = pathParts.slice(0, -1).join('/');
      const annotatedImagePath = `${directory}/annotated_${payload.documentId}_${fileName}`;

      // Step 8: Store annotated image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4L: Route to correct bucket
        .upload(annotatedImagePath, annotatedImageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      // Step 9: Clean up temporary file
      try {
        await fs.unlink(tempImagePath);
        console.log(`[Annotation] Cleaned up temporary file: ${tempImagePath}`);
      } catch (cleanupError) {
        console.warn(`[Annotation] Failed to cleanup temp file: ${cleanupError}`);
      }

      if (uploadError) {
        throw new Error(`Failed to upload annotated image: ${uploadError.message}`);
      }

      console.log(`[Annotation] Uploaded annotated image to: ${annotatedImagePath}`);

      // Step 10: Update document record with annotated image path
      const { error: updateError } = await supabase
        .from(tableName)  // ✅ PHASE 4L: Route to correct table
        .update({
          annotated_image_path: annotatedImagePath, // Store the actual annotated image path
          annotation_status: 'completed',
          annotation_processed_at: new Date().toISOString()
        })
        .eq('id', payload.documentId);

      if (updateError) {
        throw new Error(`Failed to update document with annotated image path: ${updateError.message}`);
      }

      console.log(`✅ Successfully created annotated image and updated document: ${payload.documentId}`);
      return { 
        success: true, 
        documentId: payload.documentId,
        annotationCount: boundingBoxes.length,
        annotatedImagePath
      };

    } catch (error) {
      console.error("❌ Annotation process failed.", {
        error: error instanceof Error ? error.message : 'Unknown error',
        documentId: payload.documentId
      });

      // Update document annotation status to failed
      await supabase.from(tableName).update({  // ✅ PHASE 4L: Route to correct table
        annotation_status: 'failed',
        annotation_error_message: error instanceof Error ? error.message : 'Annotation failed',
        annotation_processed_at: new Date().toISOString()
      }).eq('id', payload.documentId);

      throw error;
    }
  },
});