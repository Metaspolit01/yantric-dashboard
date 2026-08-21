import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
