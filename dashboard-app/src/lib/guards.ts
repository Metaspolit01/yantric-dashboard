import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

/**
 * Server-side auth guard.
 * Call this at the top of any server component/page that requires auth.
 * Redirects to /login if no valid session.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

/**
 * Returns session if logged in, null if guest.
 * Does NOT redirect, allowing guests to view/navigate pages.
 */
export async function getOptionalSession() {
  return await getSession();
}

/**
 * Redirect authenticated users away from auth pages (login/register).
 */
export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }
}
