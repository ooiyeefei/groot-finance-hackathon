/**
 * Image Compression Utility for PWA Receipt Capture
 * Optimizes images before upload to reduce file size and improve performance
 */

import imageCompression from 'browser-image-compression'

/**
 * Compression options for receipt images
 * Optimized for readability while maintaining reasonable file size
 */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, // Maximum file size in MB (receipts don't need 2MB+)
  maxWidthOrHeight: 1920, // Maximum dimension in pixels
  useWebWorker: true, // Use web worker for better performance
  initialQuality: 0.8, // Initial quality (0-1) — still very readable for receipts
  fileType: 'image/jpeg' as const, // Convert to JPEG for better compression
}

/**
 * Progress callback type for compression
 */
export type CompressionProgressCallback = (progress: number) => void

/**
 * Compresses a receipt image while maintaining readability
 * @param file - The original image file
 * @param onProgress - Optional callback for compression progress (0-100)
 * @returns Compressed image file
 */
export async function compressReceiptImage(
  file: File,
  onProgress?: CompressionProgressCallback
): Promise<File> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image')
    }

    // Small files don't need compression
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB < 0.5) {
      // Files smaller than 500KB don't need compression
      return file
    }

    // Compress the image
    const compressedBlob = await imageCompression(file, {
      ...COMPRESSION_OPTIONS,
      onProgress: onProgress
        ? (progress) => onProgress(Math.round(progress))
        : undefined,
    })

    // Create new File object with compressed data
    const compressedFile = new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, '.jpg'), // Change extension to .jpg
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }
    )

    // Log compression results
    const originalSizeMB = (file.size / (1024 * 1024)).toFixed(2)
    const compressedSizeMB = (compressedFile.size / (1024 * 1024)).toFixed(2)
    const reductionPercent = (
      ((file.size - compressedFile.size) / file.size) *
      100
    ).toFixed(1)

    console.log('[Image Compression]', {
      original: `${originalSizeMB}MB`,
      compressed: `${compressedSizeMB}MB`,
      reduction: `${reductionPercent}%`,
    })

    return compressedFile
  } catch (error) {
    console.error('[Image Compression] Failed:', error)
    // Return original file if compression fails
    return file
  }
}

/**
 * Estimates the final compressed size without actually compressing
 * Useful for showing users expected results before compression
 * @param file - The original image file
 * @returns Estimated compressed size in MB
 */
export function estimateCompressedSize(file: File): number {
  const fileSizeMB = file.size / (1024 * 1024)

  // Small files won't be compressed
  if (fileSizeMB < 0.5) {
    return fileSizeMB
  }

  // Rough estimation: JPEG compression usually achieves 40-60% size reduction
  const estimatedReduction = 0.5
  const estimatedSize = Math.min(fileSizeMB * estimatedReduction, COMPRESSION_OPTIONS.maxSizeMB)

  return parseFloat(estimatedSize.toFixed(2))
}

/**
 * Checks if a file needs compression
 * @param file - The image file to check
 * @returns true if compression is recommended
 */
export function shouldCompressImage(file: File): boolean {
  const fileSizeMB = file.size / (1024 * 1024)
  return fileSizeMB >= 0.5 // Compress files 500KB or larger
}
