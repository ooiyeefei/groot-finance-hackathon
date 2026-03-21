'use client'

/**
 * Image Attachment Input
 *
 * Paperclip button + file picker for attaching images to chat messages.
 * Validates file type (JPEG/PNG/HEIC/PDF) and size (max 10MB) client-side.
 * Shows preview thumbnails with individual remove buttons.
 */

import { useRef, useCallback } from 'react'
import { Paperclip, X, FileImage } from 'lucide-react'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
]

export interface AttachedFile {
  file: File
  previewUrl: string | null // null for PDFs
  id: string
}

interface ImageAttachmentInputProps {
  attachedFiles: AttachedFile[]
  onFilesSelected: (files: AttachedFile[]) => void
  onRemoveFile: (id: string) => void
  disabled?: boolean
}

export function ImageAttachmentInput({
  attachedFiles,
  onFilesSelected,
  onRemoveFile,
  disabled = false,
}: ImageAttachmentInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      const validFiles: AttachedFile[] = []

      for (const file of files) {
        // Validate type
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: Unsupported format. Use JPEG, PNG, HEIC, or PDF.`)
          continue
        }
        // Validate size
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`)
          continue
        }

        // Create preview URL for images (not PDFs)
        const previewUrl = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : null

        validFiles.push({
          file,
          previewUrl,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        })
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles)
      }

      // Reset input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [onFilesSelected]
  )

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {/* Attachment button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        aria-label="Attach image"
        title="Attach receipt photo"
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {/* Preview thumbnails (rendered above the textarea by the parent) */}
    </>
  )
}

/** Preview strip shown above the textarea when files are attached */
export function AttachmentPreviewStrip({
  attachedFiles,
  onRemoveFile,
  uploadingIds,
}: {
  attachedFiles: AttachedFile[]
  onRemoveFile: (id: string) => void
  uploadingIds?: Set<string>
}) {
  if (attachedFiles.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachedFiles.map((af) => (
        <div
          key={af.id}
          className="relative group w-16 h-16 rounded-lg border border-border overflow-hidden bg-muted"
        >
          {af.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={af.previewUrl}
              alt={af.file.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="w-6 h-6 text-muted-foreground" />
            </div>
          )}

          {/* Uploading indicator */}
          {uploadingIds?.has(af.id) && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Remove button */}
          {!uploadingIds?.has(af.id) && (
            <button
              type="button"
              onClick={() => onRemoveFile(af.id)}
              className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`Remove ${af.file.name}`}
            >
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          )}

          {/* Filename tooltip */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[9px] text-white truncate">{af.file.name}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
