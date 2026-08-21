import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

// GET /api/credits
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const [profileRes, txRes] = await Promise.all([
    supabase.from('profiles').select('credits, plan').eq('id', session.userId).single(),
    supabase.from('credit_transactions').select('*').eq('user_id', session.userId).order('created_at', { ascending: false }).limit(30),
  ]);

  return NextResponse.json({
    credits: profileRes.data?.credits ?? 0,
    plan: profileRes.data?.plan ?? 'free',
    transactions: txRes.data ?? [],
  });
}
