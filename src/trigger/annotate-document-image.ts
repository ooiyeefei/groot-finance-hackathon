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

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  category: string;
  text: string;
}

/**
 * Creates an annotated image using Python + OpenCV for professional quality
 * This is the industry standard approach for computer vision tasks
 */
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

export const annotateDocumentImage = task({
  id: "annotate-document-image",
  run: async (payload: { 
    documentId: string; 
    imageStoragePath: string;
    extractedData: any;
  }) => {
    console.log(`✅ Starting annotation process for document: ${payload.documentId}`);

    try {
      // Step 1: Extract bounding boxes from OCR results
      const boundingBoxes = payload.extractedData?.metadata?.boundingBoxes || [];
      
      if (boundingBoxes.length === 0) {
        console.log(`[Annotation] No bounding boxes found for document: ${payload.documentId}`);
        return { 
          success: true, 
          message: 'No annotations to create - no bounding boxes found',
          documentId: payload.documentId 
        };
      }

      console.log(`[Annotation] Found ${boundingBoxes.length} bounding boxes to annotate`);

      // Step 2: Create signed URL for original image
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(payload.imageStoragePath, 600); // 10 minutes validity

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL for original image: ${urlError?.message}`);
      }

      console.log(`[Annotation] Created signed URL for original image`);

      // Step 3: Generate annotated image using Python + OpenCV
      const tempImagePath = await createAnnotatedImage(
        urlData.signedUrl, 
        boundingBoxes
      );

      // Step 4: Read the annotated image from temporary file
      const annotatedImageBuffer = await fs.readFile(tempImagePath);

      // Step 5: Generate annotated storage path
      const pathParts = payload.imageStoragePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const directory = pathParts.slice(0, -1).join('/');
      const annotatedImagePath = `${directory}/annotated_${payload.documentId}_${fileName}`;

      // Step 6: Store annotated image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(annotatedImagePath, annotatedImageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      // Step 7: Clean up temporary file
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

      // Step 8: Update document record with annotated image path  
      const { error: updateError } = await supabase
        .from('documents')
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
      await supabase.from('documents').update({
        annotation_status: 'failed',
        annotation_error_message: error instanceof Error ? error.message : 'Annotation failed',
        annotation_processed_at: new Date().toISOString()
      }).eq('id', payload.documentId);
      
      throw error;
    }
  },
});