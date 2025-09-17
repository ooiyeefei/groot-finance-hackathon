/**
 * Individual Vendor API Endpoints
 * Handles vendor verification, risk updates, and audit logging
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { UpdateVendorRequest, VendorVerificationRequest } from '@/types/expense-claims'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Get single vendor
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const supabase = await createAuthenticatedSupabaseClient()
    
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: vendor
    })

  } catch (error) {
    console.error('[Vendor API] Get error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Update vendor
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body: UpdateVendorRequest = await request.json()
    const supabase = await createAuthenticatedSupabaseClient()

    // Get current vendor for audit trail
    const { data: currentVendor, error: fetchError } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentVendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    // Update vendor
    const { data: updatedVendor, error: updateError } = await supabase
      .from('vendors')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[Vendor API] Update error:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update vendor' },
        { status: 500 }
      )
    }

    // Log significant changes in audit trail
    const significantChanges = ['verification_status', 'risk_level']
    const changes = Object.keys(body).filter(key => 
      significantChanges.includes(key) && 
      body[key as keyof UpdateVendorRequest] !== currentVendor[key]
    )

    if (changes.length > 0) {
      const changeDetails = changes.reduce((acc, key) => {
        acc[`${key}_changed`] = {
          from: currentVendor[key],
          to: body[key as keyof UpdateVendorRequest]
        }
        return acc
      }, {} as Record<string, any>)

      await supabase
        .from('audit_events')
        .insert({
          business_id: currentVendor.business_id,
          actor_user_id: userId,
          event_type: 'vendor.updated',
          target_entity_type: 'vendor',
          target_entity_id: id,
          details: {
            vendor_name: currentVendor.name,
            changes: changeDetails,
            updated_fields: changes
          }
        })
    }

    return NextResponse.json({
      success: true,
      data: updatedVendor,
      message: 'Vendor updated successfully'
    })

  } catch (error) {
    console.error('[Vendor API] Update error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Delete vendor (soft delete by updating metadata)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const supabase = await createAuthenticatedSupabaseClient()

    // Check if vendor is referenced by any transactions
    const { data: referencedTransactions, error: checkError } = await supabase
      .from('transactions')
      .select('id')
      .eq('vendor_id', id)
      .limit(1)

    if (checkError) {
      console.error('[Vendor API] Reference check error:', checkError)
      return NextResponse.json(
        { success: false, error: 'Failed to check vendor references' },
        { status: 500 }
      )
    }

    if (referencedTransactions && referencedTransactions.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot delete vendor that is referenced by transactions. Consider archiving instead.' 
        },
        { status: 409 }
      )
    }

    // Get vendor for audit trail
    const { data: vendor, error: fetchError } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !vendor) {
      return NextResponse.json(
        { success: false, error: 'Vendor not found' },
        { status: 404 }
      )
    }

    // Soft delete by marking in metadata
    const { error: deleteError } = await supabase
      .from('vendors')
      .update({
        metadata: {
          ...vendor.metadata,
          deleted_at: new Date().toISOString(),
          deleted_by: userId
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (deleteError) {
      console.error('[Vendor API] Delete error:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete vendor' },
        { status: 500 }
      )
    }

    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        business_id: vendor.business_id,
        actor_user_id: userId,
        event_type: 'vendor.deleted',
        target_entity_type: 'vendor',
        target_entity_id: id,
        details: {
          vendor_name: vendor.name,
          deletion_reason: 'Manual deletion via API'
        }
      })

    return NextResponse.json({
      success: true,
      message: 'Vendor deleted successfully'
    })

  } catch (error) {
    console.error('[Vendor API] Delete error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}