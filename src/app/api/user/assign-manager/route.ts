/**
 * Manager Assignment API
 * PUT /api/user/assign-manager - Assign or update manager for an employee
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'

interface AssignManagerRequest {
  employee_id: string
  manager_id: string | null
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to assign managers'
      }, { status: 403 })
    }

    const body = await request.json() as AssignManagerRequest
    const { employee_id, manager_id } = body

    if (!employee_id) {
      return NextResponse.json({
        success: false,
        error: 'Employee ID is required'
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Validate that the employee exists and belongs to the same business
    const { data: employee, error: employeeError } = await supabase
      .from('employee_profiles')
      .select('id, user_id, business_id')
      .eq('user_id', employee_id)
      .eq('business_id', userContext.profile.business_id)
      .single()

    if (employeeError || !employee) {
      return NextResponse.json({
        success: false,
        error: 'Employee not found or access denied'
      }, { status: 404 })
    }

    // If manager_id is provided, validate that the manager exists and has appropriate permissions
    let managerEmployeeProfileId = null
    if (manager_id) {
      const { data: manager, error: managerError } = await supabase
        .from('employee_profiles')
        .select('id, user_id, role_permissions, business_id')
        .eq('user_id', manager_id)
        .eq('business_id', userContext.profile.business_id)
        .single()

      if (managerError || !manager) {
        return NextResponse.json({
          success: false,
          error: 'Manager not found or access denied'
        }, { status: 404 })
      }

      // Verify that the assigned user has manager or admin permissions
      if (!manager.role_permissions?.manager && !manager.role_permissions?.admin) {
        return NextResponse.json({
          success: false,
          error: 'Assigned user must have manager or admin permissions'
        }, { status: 400 })
      }

      // Use the employee_profiles.id for the foreign key constraint
      managerEmployeeProfileId = manager.id
    }

    // Update the employee's manager assignment
    const { error: updateError } = await supabase
      .from('employee_profiles')
      .update({
        manager_id: managerEmployeeProfileId,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', employee_id)
      .eq('business_id', userContext.profile.business_id)

    if (updateError) {
      console.error('[AssignManager API] Update error:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update manager assignment'
      }, { status: 500 })
    }

    // Log the assignment change
    console.log(`[AssignManager API] Manager assignment updated: ${employee_id} → ${managerEmployeeProfileId || 'none'}`)

    return NextResponse.json({
      success: true,
      message: manager_id
        ? 'Manager assigned successfully'
        : 'Manager assignment removed successfully'
    })

  } catch (error) {
    console.error('[AssignManager API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}