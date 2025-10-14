/**
 * Business Invitation System Types (Using Users Table)
 */

export interface BusinessInvitation {
  id: string
  email: string
  role: 'member' | 'admin'
  status: 'pending' | 'accepted'
  invited_at: string
  invited_by: string
  invitation_token: string
}

export interface CreateInvitationRequest {
  email: string
  role: 'employee' | 'manager' | 'admin'
  employee_id?: string
  department?: string
  job_title?: string
}

export interface InvitationResponse {
  success: boolean
  invitation?: BusinessInvitation
  error?: string
}

export interface AcceptInvitationRequest {
  token: string
}

export interface InvitationListResponse {
  success: boolean
  invitations?: BusinessInvitation[]
  total?: number
  error?: string
}

export interface InvitationStats {
  pending: number
  accepted: number
  expired: number
  revoked: number
  total: number
}