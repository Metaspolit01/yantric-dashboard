import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * GET /api/credits/payment/[id]
 * Returns the current status of a UPI payment order.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: payment, error } = await supabase
    .from('upi_payments')
    .select('id, amount_paise, credits, status, utr, created_at, paid_at')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  }

  return NextResponse.json({ payment });
}
