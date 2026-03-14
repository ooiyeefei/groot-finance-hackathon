/**
 * Account Deletion API
 * POST /api/v1/users/account/delete
 *
 * Initiates full account deletion for the authenticated user.
 * 1. Checks eligibility (blocks sole owners with team members)
 * 2. Exports user data → ZIP → S3 (per business)
 * 3. Emails business owners with 7-day download link
 * 4. Cancels Stripe subscriptions for owned businesses
 * 5. Deletes/anonymizes all user data in Convex
 * 6. Deletes the user from Clerk (auth provider)
 */

import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'
import { getStripe } from '@/lib/stripe/client'
import { uploadFile } from '@/lib/aws-s3'
import { emailService } from '@/lib/services/email-service'
import { generateFlatExport } from '@/domains/exports/lib/export-engine'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://finance.hellogroot.com'

const EXPENSE_FIELDS = [
  { sourceField: 'transactionDate', targetColumn: 'Date', order: 1 },
  { sourceField: 'vendorName', targetColumn: 'Vendor', order: 2 },
  { sourceField: 'totalAmount', targetColumn: 'Amount', order: 3 },
  { sourceField: 'currency', targetColumn: 'Currency', order: 4 },
  { sourceField: 'expenseCategory', targetColumn: 'Category', order: 5 },
  { sourceField: 'description', targetColumn: 'Description', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

const INVOICE_FIELDS = [
  { sourceField: 'invoiceType', targetColumn: 'Type', order: 1 },
  { sourceField: 'invoiceNumber', targetColumn: 'Invoice #', order: 2 },
  { sourceField: 'invoiceDate', targetColumn: 'Date', order: 3 },
  { sourceField: 'entityName', targetColumn: 'Vendor/Customer', order: 4 },
  { sourceField: 'totalAmount', targetColumn: 'Amount', order: 5 },
  { sourceField: 'currency', targetColumn: 'Currency', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

const LEAVE_FIELDS = [
  { sourceField: 'startDate', targetColumn: 'Start Date', order: 1 },
  { sourceField: 'endDate', targetColumn: 'End Date', order: 2 },
  { sourceField: 'totalDays', targetColumn: 'Days', order: 3 },
  { sourceField: 'notes', targetColumn: 'Reason', order: 4 },
  { sourceField: 'status', targetColumn: 'Status', order: 5 },
]

const ACCOUNTING_FIELDS = [
  { sourceField: 'documentNumber', targetColumn: 'Document #', order: 1 },
  { sourceField: 'transactionDate', targetColumn: 'Date', order: 2 },
  { sourceField: 'description', targetColumn: 'Description', order: 3 },
  { sourceField: 'transactionType', targetColumn: 'Type', order: 4 },
  { sourceField: 'originalAmount', targetColumn: 'Amount', order: 5 },
  { sourceField: 'originalCurrency', targetColumn: 'Currency', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

const PROFILE_COLUMNS = ['Email', 'Full Name', 'Currency', 'Timezone', 'Language', 'Account Created']

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '-')
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Resolve Clerk user to Convex user
    const user = await client.query(api.functions.users.getByClerkId, {
      clerkUserId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Step 1: Check eligibility and get subscription IDs (BEFORE deletion)
    const eligibility = await client.action(
      api.functions.users.checkAccountDeletionStatus,
      { userId: user._id as Id<"users"> }
    )

    if (!eligibility.canDelete) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete account while you are the sole owner of businesses with other members',
          data: { blockedBusinesses: eligibility.blockedBusinesses },
        },
        { status: 409 }
      )
    }

    // Step 2: Export user data → ZIP → S3 (before deletion destroys the data)
    // Use the same query the "Download My Data" feature uses
    let dataExportError: string | null = null
    try {
      const myData = await client.query(api.functions.exportJobs.getMyDataExport)

      if (myData && myData.businesses.length > 0) {
        const JSZip = (await import('jszip')).default
        const dateStr = new Date().toISOString().split('T')[0]

        // For each business, create a ZIP and upload to S3
        for (const business of myData.businesses.filter(Boolean)) {
          if (!business) continue

          const zip = new JSZip()
          const rootFolder = `${sanitizeFolderName(user.fullName || user.email)}-data-${dateStr}`

          // Profile CSV
          const profileRow = [
            myData.profile.email || '',
            myData.profile.fullName || '',
            myData.profile.homeCurrency || '',
            myData.profile.timezone || '',
            myData.profile.language || '',
            myData.profile.createdAt || '',
          ]
          const profileCsv = PROFILE_COLUMNS.join(',') + '\n' + profileRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
          zip.file(`${rootFolder}/profile.csv`, profileCsv)

          // Module CSVs
          const modules = [
            { key: 'expense_claims', fields: EXPENSE_FIELDS, data: business.modules.expense_claims },
            { key: 'invoices', fields: INVOICE_FIELDS, data: business.modules.invoices },
            { key: 'leave_requests', fields: LEAVE_FIELDS, data: business.modules.leave_requests },
            { key: 'journal_entries', fields: ACCOUNTING_FIELDS, data: business.modules.journal_entries },
          ] as const

          for (const mod of modules) {
            if (mod.data && mod.data.length > 0) {
              const csv = generateFlatExport(
                mod.data as Record<string, unknown>[],
                mod.fields as unknown as Array<{ sourceField: string; targetColumn: string; order: number }>,
                ','
              )
              zip.file(`${rootFolder}/${mod.key}.csv`, csv)
            }
          }

          // Generate ZIP blob
          const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

          // Upload to S3: account-deletions/{businessId}/{userId}/data-export-{date}.zip
          const s3Path = `${business.businessId}/${user._id}/data-export-${dateStr}.zip`
          const uploadResult = await uploadFile(
            'account_deletions',
            s3Path,
            zipBuffer,
            'application/zip'
          )

          if (!uploadResult.success) {
            console.error(`Failed to upload deletion data export for business ${business.businessId}:`, uploadResult.error)
            continue
          }

          // Create download token and record in Convex
          const downloadToken = randomBytes(32).toString('hex')
          const expiresAt = Date.now() + SEVEN_DAYS_MS

          await client.mutation(api.functions.users.createDeletionDataExport, {
            businessId: business.businessId as Id<"businesses">,
            deletedUserEmail: user.email,
            deletedUserName: user.fullName || user.email,
            s3Key: uploadResult.key,
            downloadToken,
            expiresAt,
          })

          // Email business owners about the departure
          const downloadUrl = `${APP_URL}/api/v1/users/account/data-export/${downloadToken}`

          // Get business owners to notify
          const businessMembers = await client.query(api.functions.memberships.getBusinessMembers, {
            businessId: business.businessId as Id<"businesses">,
          })

          if (businessMembers) {
            const owners = businessMembers.filter(
              (m: { role: string; userId: string; status: string }) =>
                m.role === 'owner' && m.userId !== (user._id as string) && m.status === 'active'
            )

            for (const owner of owners) {
              try {
                const ownerUser = await client.query(api.functions.users.getById, {
                  id: owner.userId as string,
                })

                if (ownerUser?.email) {
                  await emailService.sendAccountDeletionNotification({
                    recipientEmail: ownerUser.email,
                    recipientName: ownerUser.fullName || ownerUser.email,
                    deletedUserName: user.fullName || user.email,
                    deletedUserEmail: user.email,
                    businessName: business.businessName,
                    businessId: business.businessId as string,
                    downloadUrl,
                    expiryDays: 7,
                  })
                }
              } catch (emailError) {
                console.error(`Failed to send deletion notification to owner ${owner.userId}:`, emailError)
              }
            }
          }
        }
      }
    } catch (exportError) {
      // Data export is best-effort — don't block deletion if it fails
      dataExportError = exportError instanceof Error ? exportError.message : 'Export failed'
      console.error('Failed to export user data before deletion:', exportError)
    }

    // Step 3: Cancel Stripe subscriptions BEFORE database cleanup
    if (eligibility.hasActiveSubscription && eligibility.stripeSubscriptionIds.length > 0) {
      const stripe = getStripe()
      for (const subscriptionId of eligibility.stripeSubscriptionIds) {
        try {
          await stripe.subscriptions.cancel(subscriptionId)
        } catch (stripeError: unknown) {
          // Handle already-cancelled subscriptions gracefully
          const isAlreadyCancelled = stripeError instanceof Error &&
            'code' in stripeError &&
            (stripeError as { code?: string }).code === 'resource_missing'
          if (!isAlreadyCancelled) {
            console.error(`Failed to cancel Stripe subscription ${subscriptionId}:`, stripeError)
          }
        }
      }
    }

    // Step 4: Delete/anonymize all user data in Convex
    const result = await client.action(
      api.functions.users.deleteUserAccount,
      { userId: user._id as Id<"users"> }
    )

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          data: 'data' in result ? result.data : undefined,
        },
        { status: 409 }
      )
    }

    // Step 5: Delete user from Clerk (auth provider)
    // If this fails, the user is already anonymized in Convex — they can't log in
    try {
      const clerk = await clerkClient()
      await clerk.users.deleteUser(clerkUserId)
    } catch (clerkError) {
      console.error(
        'Failed to delete user from Clerk (user already anonymized in DB):',
        clerkError
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
      ...(dataExportError && { warning: 'Data export partially failed, but account was deleted' }),
    })
  } catch (error) {
    console.error('Error in POST /api/v1/users/account/delete:', error)
    return NextResponse.json(
      { success: false, error: 'Account deletion failed. Please try again.' },
      { status: 500 }
    )
  }
}
