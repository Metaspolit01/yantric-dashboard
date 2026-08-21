import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * POST /api/credits/verify-utr
 * Body: { paymentId: string, utr: string }
 *
 * Verifies a UPI payment by its UTR (Unique Transaction Reference).
 *
 * Security measures:
 * 1. User must be authenticated and own the payment order.
 * 2. UTR is validated: 10-22 digit numeric string (standard UPI UTR format).
 * 3. The UPI payment must be in "pending" status.
 * 4. A partial unique index on upi_payments.utr prevents the same UTR from
 *    being used twice (database-level idempotency).
 * 5. Credits are added via the SECURITY DEFINER add_credits() function.
 * 6. A credit_transaction ledger entry is recorded.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { paymentId?: string; utr?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const paymentId = (body.paymentId || '').trim();
  const utr = (body.utr || '').trim();

  if (!paymentId || !utr) {
    return NextResponse.json({ error: 'Payment ID and UTR are required.' }, { status: 400 });
  }

  // UTR validation: 10-22 digit numeric (standard UPI reference number)
  if (!/^\d{10,22}$/.test(utr)) {
    return NextResponse.json({
      error: 'Invalid UTR. Please enter the 12-digit transaction reference number from your UPI app.',
    }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Fetch the payment order — must belong to this user and be pending
  const { data: payment, error: fetchError } = await supabase
    .from('upi_payments')
    .select('id, user_id, amount_paise, credits, status, utr')
    .eq('id', paymentId)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  }

  if (payment.status === 'paid') {
    return NextResponse.json({ error: 'This payment has already been verified.' }, { status: 409 });
  }

  if (payment.status === 'failed') {
    return NextResponse.json({ error: 'This payment order has been cancelled.' }, { status: 409 });
  }

  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'Payment order is not in a verifiable state.' }, { status: 409 });
  }

  // 2. Check if UTR was already used by ANY other payment
  const { data: existingUtr } = await supabase
    .from('upi_payments')
    .select('id')
    .eq('utr', utr)
    .neq('id', paymentId)
    .maybeSingle();

  if (existingUtr) {
    return NextResponse.json({
      error: 'This UTR has already been used for another payment. Each UTR can only be used once.',
    }, { status: 409 });
  }

  // 3. Mark payment as paid (the unique index will reject duplicate UTRs)
  const { error: updateError } = await supabase
    .from('upi_payments')
    .update({
      status: 'paid',
      utr: utr,
      paid_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('status', 'pending');

  if (updateError) {
    if (updateError.code === '23505') {
      return NextResponse.json({
        error: 'This UTR has already been used. Please check your UTR and try again.',
      }, { status: 409 });
    }
    console.error('Update payment error:', updateError);
    return NextResponse.json({ error: 'Failed to verify payment.' }, { status: 500 });
  }

  // 4. Add credits to the user's profile via SECURITY DEFINER function
  const { error: creditError } = await supabase.rpc('add_credits', {
    p_user_id: session.userId,
    p_amount: payment.credits,
  });

  if (creditError) {
    console.error('Add credits error:', creditError);
    // Attempt to revert payment status to avoid credit loss
    await supabase
      .from('upi_payments')
      .update({ status: 'pending', utr: null, paid_at: null })
      .eq('id', paymentId);
    return NextResponse.json({ error: 'Failed to add credits. Please contact support.' }, { status: 500 });
  }

  // 5. Record the credit transaction in the ledger
  await supabase.from('credit_transactions').insert({
    user_id: session.userId,
    amount: payment.credits,
    type: 'purchase',
    description: `UPI purchase — ${payment.credits} credits (UTR: ${utr})`,
    upi_payment_id: paymentId,
  });

  // 6. Fetch updated balance
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', session.userId)
    .single();

  return NextResponse.json({
    success: true,
    creditsAdded: payment.credits,
    newBalance: profile?.credits ?? 0,
    message: `${payment.credits} credits added to your account.`,
  });
}
