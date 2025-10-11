/**
 * Security Test Endpoint - Tests Multi-Tenant Isolation
 * This endpoint tests various security scenarios for validation
 */

import { createBusinessContextSupabaseClient } from '@/lib/supabase-server';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { test_type, target_business_id } = body;

    const supabase = await createBusinessContextSupabaseClient();

    const results: any = {
      test_type,
      clerk_user_id: userId,
      timestamp: new Date().toISOString(),
      tests: {}
    };

    if (test_type === 'cross_tenant_expense_summary') {
      // Test 1: Try to access other business's expense summary
      const { data: expenseData, error: expenseError } = await supabase
        .rpc('get_company_expense_summary', {
          business_id_param: target_business_id
        });

      results.tests.expense_summary = {
        success: !expenseError,
        data: expenseData,
        error: expenseError?.message,
        expected_result: 'Should FAIL with authorization error'
      };
    }

    if (test_type === 'cross_tenant_analytics') {
      // Test 2: Try to access other business user's analytics
      const { data: analyticsData, error: analyticsError } = await supabase
        .rpc('get_dashboard_analytics', {
          p_user_id: target_business_id, // Using as user_id for test
          p_start_date: '2025-01-01',
          p_end_date: '2025-01-31'
        });

      results.tests.analytics = {
        success: !analyticsError,
        data: analyticsData,
        error: analyticsError?.message,
        expected_result: 'Should FAIL with authorization error'
      };
    }

    if (test_type === 'membership_validation') {
      // Test 3: Check current user's business membership
      const { data: membershipData, error: membershipError } = await supabase
        .from('business_memberships')
        .select(`
          id, role, status, business_id,
          users!inner(clerk_user_id, email, full_name)
        `)
        .eq('users.clerk_user_id', userId)
        .eq('status', 'active');

      results.tests.membership = {
        success: !membershipError,
        data: membershipData,
        error: membershipError?.message,
        expected_result: 'Should show current user membership only'
      };
    }

    return NextResponse.json({
      success: true,
      security_test_results: results
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Security test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}