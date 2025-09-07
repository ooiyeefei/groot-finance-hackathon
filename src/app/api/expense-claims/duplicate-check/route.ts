/**
 * Receipt Duplicate Detection API
 * Multi-layer detection using image hashing and metadata patterns
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import crypto from 'crypto'

interface DuplicateCheckResult {
  duplicate_found: boolean
  similarity_score: number
  existing_claim_id?: string
  existing_document_id?: string
  details: string
  match_type: 'image_hash' | 'metadata_pattern' | 'fuzzy_match' | 'none'
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('receipt_image') as File
    const vendorName = formData.get('vendor_name') as string
    const amount = parseFloat(formData.get('amount') as string)
    const transactionDate = formData.get('transaction_date') as string

    if (!file && !vendorName) {
      return NextResponse.json(
        { success: false, error: 'Receipt image or metadata required' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    let duplicateResult: DuplicateCheckResult = {
      duplicate_found: false,
      similarity_score: 0,
      details: 'No duplicates found',
      match_type: 'none'
    }

    // Image-based duplicate detection
    if (file) {
      const imageBuffer = Buffer.from(await file.arrayBuffer())
      const imageHash = generatePerceptualHash(imageBuffer)
      
      duplicateResult = await checkImageDuplicates(supabase, userId, imageHash)
    }

    // If no image match and we have metadata, check metadata patterns
    if (!duplicateResult.duplicate_found && vendorName && amount && transactionDate) {
      const metadataResult = await checkMetadataDuplicates(
        supabase, 
        userId, 
        vendorName, 
        amount, 
        transactionDate
      )
      
      if (metadataResult.duplicate_found && metadataResult.similarity_score > duplicateResult.similarity_score) {
        duplicateResult = metadataResult
      }
    }

    console.log(`[Duplicate Check API] Checked for duplicates - Found: ${duplicateResult.duplicate_found}, Score: ${duplicateResult.similarity_score}`)

    return NextResponse.json({
      success: true,
      data: duplicateResult
    })

  } catch (error) {
    console.error('[Duplicate Check API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check for duplicates'
      },
      { status: 500 }
    )
  }
}

// Generate perceptual hash for image similarity
function generatePerceptualHash(imageBuffer: Buffer): string {
  // Simple hash for now - in production, use a proper perceptual hashing library
  // like 'phash' or implement difference hash (dHash)
  const hash = crypto.createHash('md5').update(imageBuffer).digest('hex')
  
  // For basic duplicate detection, we'll use file hash
  // TODO: Implement actual perceptual hashing for better similarity detection
  return hash
}

async function checkImageDuplicates(
  supabase: any, 
  userId: string, 
  imageHash: string
): Promise<DuplicateCheckResult> {
  try {
    // Check for exact image hash matches
    const { data: exactMatches, error: hashError } = await supabase
      .from('documents')
      .select(`
        *,
        claim:expense_claims!inner(id, status, created_at)
      `)
      .eq('image_hash', imageHash)
      .eq('user_id', userId)
      .neq('claim.status', 'rejected') // Don't flag rejected claims as duplicates
      .not('image_hash', 'is', null)

    if (hashError) {
      console.error('[Duplicate Check] Hash query error:', hashError)
      return {
        duplicate_found: false,
        similarity_score: 0,
        details: 'Error checking image duplicates',
        match_type: 'none'
      }
    }

    if (exactMatches && exactMatches.length > 0) {
      const match = exactMatches[0]
      return {
        duplicate_found: true,
        similarity_score: 1.0, // Exact image match
        existing_claim_id: match.claim?.id,
        existing_document_id: match.document?.id,
        details: `Identical receipt image found from ${new Date(match.created_at).toLocaleDateString()}`,
        match_type: 'image_hash'
      }
    }

    // TODO: Implement fuzzy image matching for similar (but not identical) images
    // This would involve comparing perceptual hashes with a similarity threshold

    return {
      duplicate_found: false,
      similarity_score: 0,
      details: 'No similar images found',
      match_type: 'none'
    }

  } catch (error) {
    console.error('[Duplicate Check] Image check error:', error)
    return {
      duplicate_found: false,
      similarity_score: 0,
      details: 'Error checking image duplicates',
      match_type: 'none'
    }
  }
}

async function checkMetadataDuplicates(
  supabase: any,
  userId: string,
  vendorName: string,
  amount: number,
  transactionDate: string
): Promise<DuplicateCheckResult> {
  try {
    const dateRange = 7 // Check within 7 days
    const amountTolerance = 0.01 // 1% tolerance for amount differences
    
    const startDate = new Date(transactionDate)
    startDate.setDate(startDate.getDate() - dateRange)
    
    const endDate = new Date(transactionDate)
    endDate.setDate(endDate.getDate() + dateRange)

    // Check for similar vendor + amount + date combinations
    const { data: metadataMatches, error: metadataError } = await supabase
      .from('documents')
      .select(`
        *,
        claim:expense_claims!inner(id, status, created_at, business_purpose),
        transaction:transactions(vendor_name, original_amount, transaction_date)
      `)
      .eq('user_id', userId)
      .gte('transaction.transaction_date', startDate.toISOString().split('T')[0])
      .lte('transaction.transaction_date', endDate.toISOString().split('T')[0])
      .neq('claim.status', 'rejected')
      .not('ocr_metadata', 'is', null)

    if (metadataError) {
      console.error('[Duplicate Check] Metadata query error:', metadataError)
      return {
        duplicate_found: false,
        similarity_score: 0,
        details: 'Error checking metadata duplicates',
        match_type: 'none'
      }
    }

    if (!metadataMatches || metadataMatches.length === 0) {
      return {
        duplicate_found: false,
        similarity_score: 0,
        details: 'No metadata matches found',
        match_type: 'none'
      }
    }

    // Calculate similarity scores for each match
    let bestMatch: any = null
    let highestScore = 0

    for (const match of metadataMatches) {
      const transaction = Array.isArray(match.transaction) ? match.transaction[0] : match.transaction
      const score = calculateMetadataSimilarity({
        vendor_name: vendorName,
        amount,
        transaction_date: transactionDate
      }, {
        vendor_name: transaction?.vendor_name,
        amount: transaction?.original_amount,
        transaction_date: transaction?.transaction_date
      })

      if (score > highestScore) {
        highestScore = score
        bestMatch = match
      }
    }

    // Consider it a duplicate if similarity is above 80%
    if (highestScore > 0.8 && bestMatch) {
      const transaction = Array.isArray(bestMatch.transaction) ? bestMatch.transaction[0] : bestMatch.transaction
      return {
        duplicate_found: true,
        similarity_score: highestScore,
        existing_claim_id: bestMatch.claim?.id,
        existing_document_id: bestMatch.id,
        details: `Similar expense found: ${transaction?.vendor_name} on ${transaction?.transaction_date} for $${transaction?.original_amount}`,
        match_type: 'metadata_pattern'
      }
    }

    return {
      duplicate_found: false,
      similarity_score: highestScore,
      details: `Closest match: ${Math.round(highestScore * 100)}% similar`,
      match_type: 'none'
    }

  } catch (error) {
    console.error('[Duplicate Check] Metadata check error:', error)
    return {
      duplicate_found: false,
      similarity_score: 0,
      details: 'Error checking metadata duplicates',
      match_type: 'none'
    }
  }
}

function calculateMetadataSimilarity(
  expense1: { vendor_name: string, amount: number, transaction_date: string },
  expense2: { vendor_name: string, amount: number, transaction_date: string }
): number {
  let score = 0
  let factors = 0

  // Vendor name similarity (40% weight)
  if (expense1.vendor_name && expense2.vendor_name) {
    const vendorSimilarity = calculateStringSimilarity(
      expense1.vendor_name.toLowerCase(),
      expense2.vendor_name.toLowerCase()
    )
    score += vendorSimilarity * 0.4
    factors += 0.4
  }

  // Amount similarity (40% weight)
  if (expense1.amount && expense2.amount) {
    const amountDiff = Math.abs(expense1.amount - expense2.amount)
    const avgAmount = (expense1.amount + expense2.amount) / 2
    const amountSimilarity = Math.max(0, 1 - (amountDiff / avgAmount))
    score += amountSimilarity * 0.4
    factors += 0.4
  }

  // Date proximity (20% weight)
  if (expense1.transaction_date && expense2.transaction_date) {
    const date1 = new Date(expense1.transaction_date).getTime()
    const date2 = new Date(expense2.transaction_date).getTime()
    const daysDiff = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24)
    const dateSimilarity = Math.max(0, 1 - (daysDiff / 7)) // 7-day window
    score += dateSimilarity * 0.2
    factors += 0.2
  }

  return factors > 0 ? score / factors : 0
}

// Levenshtein distance for string similarity
function calculateStringSimilarity(str1: string, str2: string): number {
  const matrix = []
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0) return len2 === 0 ? 1 : 0
  if (len2 === 0) return 0

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)
  return 1 - (distance / maxLen)
}