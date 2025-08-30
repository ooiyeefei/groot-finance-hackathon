import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transactionId } = await params;
    const body = await request.json();
    const { status, due_date, payment_date, payment_method, notes } = body;

    // Validate status
    const validStatuses = ['pending', 'awaiting_payment', 'paid', 'overdue', 'cancelled', 'disputed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (status) updateData.status = status;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (payment_date !== undefined) updateData.payment_date = payment_date;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (notes !== undefined) updateData.notes = notes;

    // Update transaction with RLS policy enforcement
    const { data: transaction, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId)
      .eq('user_id', userId) // Enforce user ownership
      .select('*')
      .single();

    if (error) {
      console.error('Transaction status update error:', error);
      return NextResponse.json({ error: 'Failed to update transaction status' }, { status: 500 });
    }

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(transaction);

  } catch (error) {
    console.error('Transaction status update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}