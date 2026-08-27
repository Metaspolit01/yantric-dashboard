import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { UPI_ID, UPI_PAYEE_NAME, findPackage } from '@/lib/credit-packages';

export const runtime = 'nodejs';

/**
 * POST /api/credits/buy
 * Body: { packageId: string }
 *
 * Creates a pending UPI payment order in the database and returns the UPI deep link
 * + QR payload so the frontend can display a QR code and/or a "Pay via UPI" button.
 *
 * For the free trial package, credits are granted immediately without payment.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { packageId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const pkg = findPackage(body.packageId || '');
  if (!pkg) {
    return NextResponse.json({ error: 'Invalid credit package.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Free trial: grant credits immediately, no UPI payment needed
  if (pkg.isFree) {
    // Check if user already claimed the free trial
    const { data: existingFreeTrial } = await supabase
      .from('credit_transactions')
      .select('id, created_at')
      .eq('user_id', session.userId)
      .eq('type', 'free_trial')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingFreeTrial) {
      // Check if it was claimed recently (within last 24 hours) to prevent abuse
      const hoursSinceClaim = (Date.now() - new Date(existingFreeTrial.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceClaim < 24) {
        return NextResponse.json({ 
          error: 'You have already claimed your free trial credits. Please wait 24 hours before claiming again or purchase a paid package.' 
        }, { status: 409 });
      }
    }

    // Add credits
    const { error: creditError } = await supabase.rpc('add_credits', {
      p_user_id: session.userId,
      p_amount: pkg.credits,
    });

    if (creditError) {
      console.error('Free trial add credits error:', creditError);
      return NextResponse.json({ error: 'Failed to add free trial credits.' }, { status: 500 });
    }

    // Record transaction
    await supabase.from('credit_transactions').insert({
      user_id: session.userId,
      amount: pkg.credits,
      type: 'free_trial',
      description: `Free trial — ${pkg.credits} credits`,
    });

    // Fetch updated balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', session.userId)
      .single();

    return NextResponse.json({
      freeTrial: true,
      creditsAdded: pkg.credits,
      newBalance: profile?.credits ?? 0,
      message: `${pkg.credits} free trial credits added to your account!`,
    });
  }

  // Paid package: create UPI payment order
  const { data: payment, error } = await supabase
    .from('upi_payments')
    .insert({
      user_id: session.userId,
      amount_paise: pkg.pricePaise,
      credits: pkg.credits,
      status: 'pending',
      upi_id: UPI_ID,
    })
    .select('id, amount_paise, credits, status, created_at')
    .single();

  if (error || !payment) {
    console.error('Create UPI payment error:', error);
    return NextResponse.json({ error: 'Failed to create payment order.' }, { status: 500 });
  }

  // Build UPI deep link per NPCI spec
  const txNote = `Yantric ${pkg.credits} credits - ${payment.id.slice(0, 8)}`;
  const upiParams = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: (pkg.pricePaise / 100).toFixed(2),
    tn: txNote,
    cu: 'INR',
  });
  const upiDeepLink = `upi://pay?${upiParams.toString()}`;

  return NextResponse.json({
    paymentId: payment.id,
    amountPaise: payment.amount_paise,
    credits: payment.credits,
    upiId: UPI_ID,
    upiPayeeName: UPI_PAYEE_NAME,
    upiDeepLink,
    qrValue: upiDeepLink,
    note: txNote,
    status: payment.status,
  });
}
