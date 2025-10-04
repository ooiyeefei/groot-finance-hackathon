1. Initial Business Setup (First Admin)

  Step 1: Environment Setup
  # Add to your .env.local
  INITIAL_ADMIN_KEY=super-secret-key-only-you-know-2025

  Step 2: First User Signs Up
  - User goes to your normal Clerk signup at /sign-up
  - Gets employee role by default (this is correct and secure)

  Step 3: Promote to Admin
  You now have 2 options:

  Option A: Use the Admin Setup UI
  - Navigate to /admin/setup
  - Enter the admin key
  - Becomes finance admin instantly

  Option B: API Call
  curl -X POST http://localhost:3000/api/user/assign-admin \
    -H "Content-Type: application/json" \
    -d '{
      "user_id": "user_2abc123def456",
      "admin_key": "super-secret-key-only-you-know-2025"
    }'

  2. Manager Signup Process (After Admin Exists)

  For All Future Users:
  1. Normal Signup → Everyone gets employee role by default ✅
  2. Admin Promotes Them → Via Team Management at /manager/team

  Team Management Features:
  - ✅ View all business employees
  - ✅ Promote: Employee → Manager → Finance
  - ✅ Real-time role updates with Clerk sync
  - ✅ Comprehensive permission management

  3. Available URLs

  Admin Setup:
  - /admin/setup - Initial admin assignment UI

  Manager Features:
  - /manager/approvals - Expense approval dashboard
  - /manager/team - Team member role management (finance only)
  - /manager/categories - Expense category management

  4. Role Hierarchy & Automatic Features

  Employee (Default):
  - Submit expense claims
  - Upload receipts
  - View own transactions

  Manager (Promoted by Admin):
  - All employee permissions ✅
  - Approve/reject expenses ✅
  - Manage categories ✅
  - View team expenses ✅
  - Sidebar shows manager menu items automatically

  Finance Admin (Highest Level):
  - All manager permissions ✅
  - Assign roles to other users ✅
  - Full system access ✅
  - Team management capabilities ✅

  5. Security & Best Practices

  ✅ Default Employee Role - Everyone starts as employee for security
  ✅ Admin Key Protection - Only you know the initial admin key
  ✅ Clerk Integration - Roles sync to privateMetadata for enhanced security
  ✅ Middleware Protection - Routes protected at middleware level
  ✅ Database Consistency - Permissions stored in business database
  ✅ UI Auto-Updates - Manager features appear based on permissions

  ✅ Multi-Tenant SaaS Flow:

  1. You (SaaS Owner): Use MASTER_ADMIN_KEY to create business admins
  2. Business Admin: Gets finance role, manages their team via /manager/team
  3. Employees: Sign up as employee, get promoted by business admin
  4. Role Storage: Active roles in Clerk privateMetadata, users table as backup

  ✅ Database Structure:

  -- businesses table now contains categories
  businesses {
    id,
    name,
    custom_expense_categories: JSONB -- Array of category objects
  }

  -- users table keeps enum for potential future use
  users {
    role: user_role -- owner/admin/member/viewer (legacy)
  }

  -- employee_profiles links to businesses
  employee_profiles {
    business_id,
    role_permissions: { employee, manager, finance }
  }

  ✅ Clerk Integration:

  - Active roles: Stored in privateMetadata.role and privateMetadata.permissions for enhanced security
  - Session access: Available via sessionClaims.metadata (configured via JWT template)
  - Client access: Available via user.sessionClaims.metadata (not directly accessible for security)
  - Security: Only backend can update privateMetadata, client access via JWT claims only

  📋 Required JWT Template Configuration:

  In your Clerk Dashboard, create a JWT template named "supabase" with the following claims:
  ```json
  {
    "aud": "authenticated",
    "exp": {{exp}},
    "iat": {{iat}},
    "iss": "{{iss}}",
    "sub": "{{user.id}}",
    "metadata": {
      "role": "{{user.private_metadata.role}}",
      "permissions": {{user.private_metadata.permissions}}
    },
    "user_metadata": {}
  }
  ```

  This template ensures that role data from private metadata is securely exposed in JWT claims for client-side access.

  🚀 Steps to Test Admin Access:

  1. Visit the admin setup page:
  http://localhost:3000/admin/setup
  2. Sign in with your Clerk account if not already signed in
  3. Enter the master admin key: <in env.local file>
  4. Click "Assign Admin Privileges"
  5. Refresh the page to see updated permissions
  6. Navigate to admin features:
    - http://localhost:3000/manager/team (Team management)
    - Any other admin-only routes

  Current Implementation

  Environment Variable Storage:
  # In .env.local
  MASTER_ADMIN_KEY=finanseal_master_2025_secure_key

  Validation in Code (src/app/api/user/assign-admin/route.ts:25-35):
  const validAdminKey = process.env.MASTER_ADMIN_KEY
  if (!validAdminKey || admin_key !== validAdminKey) {
    return NextResponse.json(
      { success: false, error: 'Invalid master admin key' },
      { status: 403 }
    )
  }

  To Change the Master Key

  1. Update Environment Variable:
  # Change this line in .env.local
  MASTER_ADMIN_KEY=your_new_secure_master_key_2026
  2. Restart the Application:
  # Kill the current dev server and restart
  npm run dev
  3. Use New Key for Future Admin Assignments:
    - The /admin/setup form will now require the new key
    - Old key becomes invalid immediately

  Security Benefits

  ✅ Server-side validation only - Key never exposed to client
  ✅ No database storage - Can't be compromised via SQL injection✅ Environment-based -
  Different keys per environment (dev/staging/prod)
  ✅ Immediate rotation - Change takes effect on app restart
  ✅ SaaS owner control - Only you have access to production environment variables


  ---
  Current Flow (Single-User Default)

  // In ensureEmployeeProfile()
  const { data: defaultBusiness } = await supabase
    .from('businesses')
    .select('id')
    .limit(1)
    .single()

  This creates a separate business for each user, which isn't ideal for team collaboration.

  Recommended Business Onboarding Flow

  Option 1: Invitation-Based System

  1. Business Admin invites users via email
  2. Invitation link contains business_id and invite_token
  3. New user signs up via Clerk with the invitation context
  4. Employee profile gets created with the correct business_id

  Option 2: Business Registration Flow

  1. First user creates a business during signup (becomes admin)
  2. Subsequent users enter a business code/ID to join existing business
  3. Admin approval required for new team members

  Implementation Approach

  Let me show you how to implement Option 1 (invitation-based):

  1. Create Invitation System

  // src/lib/business-invites.ts
  export interface BusinessInvite {
    id: string
    business_id: string
    email: string
    role: UserRole
    invite_token: string
    expires_at: string
    created_by: string
  }

  export async function sendBusinessInvite(
    businessId: string,
    email: string,
    role: UserRole,
    invitedBy: string
  ) {
    // Create invite record with token
    // Send email with signup link: /signup?invite=TOKEN
  }

  2. Update Employee Profile Creation

  // Update ensureEmployeeProfile() to accept businessId
  export async function ensureEmployeeProfile(
    userId: string,
    businessId?: string,
    inviteToken?: string
  ): Promise<EmployeeProfile | null> {

    if (inviteToken) {
      // Validate invite and get business_id
      const invite = await validateInviteToken(inviteToken)
      businessId = invite.business_id
    }

    if (!businessId) {
      // Create new business for first-time business owner
      businessId = await createNewBusiness(userId)
    }

    // Create employee profile with correct business_id
  }

  3. Signup Flow with Invitation Context

  // src/app/signup/page.tsx
  export default function SignupPage({ searchParams }: { searchParams: { invite?: string } }) {
    const inviteToken = searchParams.invite

    // Pass invite context to Clerk signup
    return (
      <SignUp
        forceRedirectUrl={`/onboarding?invite=${inviteToken}`}
      />
    )
  }

  Quick Implementation

  Would you like me to:

  1. Create the invitation system with database tables and API endpoints?
  2. Update the employee profile logic to handle business assignment?
  3. Build the signup/onboarding flow for business context?

  Or do you prefer a simpler approach where users manually enter a business code during signup?

  The invitation system is more user-friendly and secure, but requires more implementation
  work. What's your preference?