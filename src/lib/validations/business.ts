/**
 * Business Management Validation Schemas
 *
 * Zod schemas for business account creation, team management, and invitations.
 */

import { z } from 'zod'
import {
  currencySchema,
  emailSchema,
  uuidSchema,
  documentIdSchema,
  phoneNumberSchema,
  urlSchema,
  taxIdSchema
} from './common'

/**
 * User role in business schema
 */
export const businessRoleSchema = z.enum(['admin', 'manager', 'employee'], {
  errorMap: () => ({
    message: 'Role must be one of: admin, manager, employee'
  })
})

/**
 * Membership status schema
 */
export const membershipStatusSchema = z.enum([
  'active',
  'suspended',
  'inactive',
  'pending'
], {
  errorMap: () => ({
    message: 'Status must be one of: active, suspended, inactive, pending'
  })
})

/**
 * Invitation status schema
 */
export const invitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'expired',
  'revoked'
], {
  errorMap: () => ({
    message: 'Status must be one of: pending, accepted, declined, expired, revoked'
  })
})

/**
 * Create business schema
 */
export const createBusinessSchema = z.object({
  name: z.string()
    .min(1, 'Business name is required')
    .max(200, 'Business name too long'),

  tax_id: taxIdSchema,

  address: z.string()
    .max(500, 'Address too long')
    .optional(),

  contact_email: emailSchema.optional(),

  contact_phone: phoneNumberSchema,

  website: urlSchema,

  home_currency: currencySchema.default('SGD'),

  allowed_currencies: z.array(currencySchema)
    .default(['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR']),

  industry: z.string()
    .max(100, 'Industry too long')
    .optional(),

  description: z.string()
    .max(1000, 'Description too long')
    .optional()
})

/**
 * Update business profile schema
 */
export const updateBusinessProfileSchema = createBusinessSchema.partial()

/**
 * Upload business logo schema
 */
export const uploadBusinessLogoSchema = z.object({
  file: z.instanceof(File, { message: 'Logo file is required' })
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
      'Logo must be JPEG, PNG, or WebP'
    )
    .refine(
      (file) => file.size <= 5 * 1024 * 1024, // 5MB
      'Logo must be less than 5MB'
    )
})

/**
 * Switch business context schema
 */
export const switchBusinessSchema = z.object({
  // Accept both UUID (legacy Supabase) and Convex ID formats
  business_id: z.string().min(1, 'Business ID is required').max(100, 'Business ID too long')
})

/**
 * Send team invitation schema
 */
export const sendInvitationSchema = z.object({
  email: emailSchema,

  role: businessRoleSchema,

  // Accept both UUID (legacy Supabase) and Convex ID formats
  business_id: documentIdSchema,

  // Optional fields for employee profile setup
  employee_id: z.string().max(50, 'Employee ID too long').optional().nullable(),
  department: z.string().max(100, 'Department too long').optional().nullable(),
  job_title: z.string().max(100, 'Job title too long').optional().nullable(),

  message: z.string()
    .max(500, 'Message too long')
    .optional()
})

/**
 * Accept invitation schema
 */
export const acceptInvitationSchema = z.object({
  token: z.string()
    .min(1, 'Invitation token is required'),

  fullName: z.string()
    .min(1, 'Full name is required')
    .max(200, 'Full name too long')
    .optional()
})

/**
 * Invitation ID parameter schema
 */
export const invitationIdParamSchema = z.object({
  invitationId: documentIdSchema
})

/**
 * List invitations query schema
 */
export const listInvitationsQuerySchema = z.object({
  type: z.enum(['sent', 'received']).optional(),

  status: invitationStatusSchema.optional()
})

/**
 * Update membership schema
 */
export const updateMembershipSchema = z.object({
  role: businessRoleSchema.optional(),

  status: membershipStatusSchema.optional()
})

/**
 * Membership ID parameter schema
 */
export const membershipIdParamSchema = z.object({
  membershipId: documentIdSchema
})

/**
 * Remove team member schema
 */
export const removeMemberSchema = z.object({
  reason: z.string()
    .max(500, 'Reason too long')
    .optional()
})

/**
 * Business settings schema
 */
export const updateBusinessSettingsSchema = z.object({
  // Financial settings
  fiscal_year_start: z.number()
    .int()
    .min(1)
    .max(12)
    .optional(),

  default_payment_terms: z.number()
    .int()
    .positive()
    .optional(),

  // Feature flags
  enable_expense_claims: z.boolean().optional(),

  enable_invoicing: z.boolean().optional(),

  enable_ai_assistant: z.boolean().optional(),

  enable_analytics: z.boolean().optional(),

  // Approval workflows
  require_manager_approval: z.boolean().optional(),

  auto_approve_threshold: z.number().positive().optional(),

  // Notifications
  notification_preferences: z.object({
    email_on_new_expense: z.boolean().optional(),
    email_on_approval_needed: z.boolean().optional(),
    email_on_reimbursement: z.boolean().optional(),
    slack_webhook_url: urlSchema.optional()
  }).optional(),

  // Compliance
  require_receipts: z.boolean().optional(),

  max_expense_without_receipt: z.number().positive().optional()
})

/**
 * Type exports
 */
export type BusinessRole = z.infer<typeof businessRoleSchema>
export type MembershipStatus = z.infer<typeof membershipStatusSchema>
export type InvitationStatus = z.infer<typeof invitationStatusSchema>
export type CreateBusinessRequest = z.infer<typeof createBusinessSchema>
export type UpdateBusinessProfileRequest = z.infer<typeof updateBusinessProfileSchema>
export type UploadBusinessLogoRequest = z.infer<typeof uploadBusinessLogoSchema>
export type SwitchBusinessRequest = z.infer<typeof switchBusinessSchema>
export type SendInvitationRequest = z.infer<typeof sendInvitationSchema>
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>
export type UpdateMembershipRequest = z.infer<typeof updateMembershipSchema>
export type RemoveMemberRequest = z.infer<typeof removeMemberSchema>
export type UpdateBusinessSettingsRequest = z.infer<typeof updateBusinessSettingsSchema>
