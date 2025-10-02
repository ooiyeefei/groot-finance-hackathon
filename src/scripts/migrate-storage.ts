/**
 * Storage Migration Script
 *
 * Migrates existing files from legacy storage structure to new standardized hierarchy:
 * Legacy: applications/file.pdf, expense-receipts/user/file.pdf, uuid/user/file.pdf
 * New: documents/{business_id}/{user_id}/{document_type}/{stage}/{filename}
 *
 * Usage:
 * npx tsx src/scripts/migrate-storage.ts --dry-run
 * npx tsx src/scripts/migrate-storage.ts --execute
 */

import { createClient } from '@supabase/supabase-js'
import { StorageMigrator, analyzeStoragePath, generateStoragePath, type DocumentType } from '@/lib/storage-paths'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface MigrationResult {
  success: boolean
  from: string
  to: string
  error?: string
  documentId?: string
}

interface MigrationStats {
  totalFiles: number
  migrated: number
  skipped: number
  errors: number
  results: MigrationResult[]
}

/**
 * Get all files from Supabase Storage bucket
 */
async function getAllStorageFiles(): Promise<string[]> {
  console.log('🔍 Scanning Supabase Storage for files...')

  const allFiles: string[] = []

  // List all files recursively
  const { data: files, error } = await supabase.storage
    .from('documents')
    .list('', {
      limit: 1000,
      offset: 0
    })

  if (error) {
    console.error('❌ Failed to list storage files:', error)
    throw error
  }

  // This is a simplified version - in reality you'd need to recursively scan directories
  console.log(`📁 Found ${files?.length || 0} top-level items`)

  // For demo purposes, let's also check specific legacy directories
  const legacyDirectories = ['applications', 'expense-receipts', 'converted', 'processed-images']

  for (const dir of legacyDirectories) {
    try {
      const { data: dirFiles } = await supabase.storage
        .from('documents')
        .list(dir, { limit: 1000 })

      if (dirFiles) {
        for (const file of dirFiles) {
          if (file.name && !file.name.endsWith('/')) {
            allFiles.push(`${dir}/${file.name}`)
          }
        }
      }
    } catch (e) {
      console.log(`⚠️  Could not scan directory ${dir}:`, e)
    }
  }

  console.log(`📂 Total files found for migration analysis: ${allFiles.length}`)
  return allFiles
}

/**
 * Get document context from database
 */
async function getDocumentContext(storagePath: string) {
  const { data: document } = await supabase
    .from('documents')
    .select('id, business_id, user_id, file_name, document_type, metadata')
    .eq('storage_path', storagePath)
    .single()

  return document
}

/**
 * Get default business and user IDs for migration
 */
async function getDefaultContext() {
  // Get default business
  const { data: defaultBusiness } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', 'default-business')
    .single()

  // Get first admin user as fallback
  const { data: adminUser } = await supabase
    .from('users')
    .select('id, clerk_user_id')
    .eq('role', 'owner')
    .limit(1)
    .single()

  return {
    businessId: defaultBusiness?.id || 'default-business',
    userId: adminUser?.clerk_user_id || 'default-user'
  }
}

/**
 * Perform file migration
 */
async function migrateFile(
  originalPath: string,
  targetPath: string,
  dryRun: boolean = true
): Promise<MigrationResult> {

  if (dryRun) {
    return {
      success: true,
      from: originalPath,
      to: targetPath
    }
  }

  try {
    // Copy file to new location
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(originalPath)

    if (downloadError || !fileData) {
      return {
        success: false,
        from: originalPath,
        to: targetPath,
        error: `Download failed: ${downloadError?.message}`
      }
    }

    // Upload to new location
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(targetPath, fileData, {
        upsert: false
      })

    if (uploadError) {
      return {
        success: false,
        from: originalPath,
        to: targetPath,
        error: `Upload failed: ${uploadError.message}`
      }
    }

    // Update database record if it exists
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        storage_path: targetPath,
        metadata: { migrated_from: originalPath, migration_date: new Date().toISOString() }
      })
      .eq('storage_path', originalPath)

    if (updateError) {
      console.warn(`⚠️  Database update failed for ${originalPath}:`, updateError.message)
    }

    return {
      success: true,
      from: originalPath,
      to: targetPath
    }

  } catch (error) {
    return {
      success: false,
      from: originalPath,
      to: targetPath,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Main migration function
 */
async function runMigration(dryRun: boolean = true): Promise<MigrationStats> {
  console.log(`🚀 Starting storage migration ${dryRun ? '(DRY RUN)' : '(LIVE EXECUTION)'}`)

  const stats: MigrationStats = {
    totalFiles: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    results: []
  }

  try {
    // Get all storage files
    const allFiles = await getAllStorageFiles()
    stats.totalFiles = allFiles.length

    // Get default context for orphaned files
    const defaultContext = await getDefaultContext()
    console.log(`🏢 Default context: business=${defaultContext.businessId}, user=${defaultContext.userId}`)

    for (const filePath of allFiles) {
      console.log(`\n📋 Analyzing: ${filePath}`)

      // Analyze current path structure
      const pathInfo = analyzeStoragePath(filePath)

      if (!pathInfo.isLegacy) {
        console.log(`✅ Already in new format, skipping`)
        stats.skipped++
        continue
      }

      // Get document context from database
      let documentContext = await getDocumentContext(filePath)

      if (!documentContext) {
        console.log(`⚠️  No database record found, using defaults`)
        documentContext = {
          id: null,
          business_id: defaultContext.businessId,
          user_id: defaultContext.userId,
          document_type: pathInfo.documentType || 'invoice',
          file_name: filePath.split('/').pop() || 'unknown',
          metadata: null
        }
      }

      // Generate target path
      let targetPath: string

      try {
        if (filePath.startsWith('applications/')) {
          const filename = filePath.split('/')[1]
          targetPath = generateStoragePath({
            businessId: documentContext.business_id,
            userId: documentContext.user_id,
            documentType: 'application_form',
            stage: 'raw',
            filename
          })
        } else if (filePath.startsWith('expense-receipts/')) {
          const pathParts = filePath.split('/')
          const userId = pathParts[1]
          const filename = pathParts[2]
          targetPath = generateStoragePath({
            businessId: documentContext.business_id,
            userId: userId,
            documentType: 'expense_receipts',
            stage: 'raw',
            filename
          })
        } else if (filePath.startsWith('converted/')) {
          // Handle conversion artifacts
          targetPath = filePath.replace('converted/', 'legacy-converted/')
        } else {
          // Legacy UUID structure: business_id/user_id/filename
          const pathParts = filePath.split('/')
          if (pathParts.length === 3) {
            const [businessId, userId, filename] = pathParts
            targetPath = generateStoragePath({
              businessId,
              userId,
              documentType: (documentContext.document_type as DocumentType) || 'invoice',
              stage: 'raw',
              filename
            })
          } else {
            throw new Error('Unsupported path structure')
          }
        }

        console.log(`📝 Target path: ${targetPath}`)

        // Perform migration
        const result = await migrateFile(filePath, targetPath, dryRun)
        stats.results.push(result)

        if (result.success) {
          stats.migrated++
          console.log(`✅ Migration ${dryRun ? 'planned' : 'completed'}`)
        } else {
          stats.errors++
          console.log(`❌ Migration failed: ${result.error}`)
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        stats.errors++
        stats.results.push({
          success: false,
          from: filePath,
          to: 'failed-to-generate',
          error: errorMsg
        })
        console.log(`❌ Path generation failed: ${errorMsg}`)
      }
    }

    // Print summary
    console.log(`\n📊 Migration Summary:`)
    console.log(`   Total files: ${stats.totalFiles}`)
    console.log(`   Migrated: ${stats.migrated}`)
    console.log(`   Skipped: ${stats.skipped}`)
    console.log(`   Errors: ${stats.errors}`)

    return stats

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2)
  const isDryRun = !args.includes('--execute')

  if (isDryRun) {
    console.log('🔍 Running in DRY-RUN mode. Use --execute to perform actual migration.')
  } else {
    console.log('⚠️  LIVE EXECUTION MODE - Files will be actually migrated!')

    // Safety confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const answer = await new Promise((resolve) => {
      readline.question('Are you sure you want to migrate files? (yes/no): ', resolve)
    })

    readline.close()

    if (answer !== 'yes') {
      console.log('❌ Migration cancelled by user.')
      process.exit(0)
    }
  }

  try {
    const stats = await runMigration(!args.includes('--execute'))

    if (stats.errors > 0) {
      console.log('\n❌ Migration completed with errors. Check the logs above.')
      process.exit(1)
    } else {
      console.log('\n✅ Migration completed successfully!')
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}