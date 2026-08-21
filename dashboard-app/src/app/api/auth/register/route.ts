import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '@/lib/supabase-admin';
import { signToken, createSessionCookieHeader } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if user already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() },
    });

    if (authError || !authData.user) {
      console.error('Auth create error:', authError);
      const isConflict = authError?.message?.toLowerCase().includes('already') || authError?.status === 422;
      return NextResponse.json(
        { error: authError?.message || 'Failed to create account.' },
        { status: isConflict ? 409 : 400 }
      );
    }

    // Ensure profile row exists in public.profiles
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: authData.user.email!,
      name: name.trim(),
      credits: 100,
      plan: 'free',
    }, { onConflict: 'id' });

    const token = signToken({
      userId: authData.user.id,
      email: authData.user.email!,
      name: name.trim(),
    });

    const response = NextResponse.json({
      success: true,
      user: { id: authData.user.id, email: authData.user.email, name: name.trim() },
    });

    response.headers.set('Set-Cookie', createSessionCookieHeader(token));
    return response;

  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
