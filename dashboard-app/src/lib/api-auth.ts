import type { NextRequest } from 'next/server';

/**
 * Shared helpers for internal (agent-worker ↔ dashboard) API authentication
 * and call billing configuration.
 */

/** Shared secret between the Python worker and this dashboard. */
export function getAgentApiSecret(): string {
  return process.env.YANTRIC_AGENT_API_SECRET || '';
}

/**
 * True when the request carries the internal worker bearer secret.
 * Dashboard session cookies are checked separately by callers that allow both.
 */
export function hasValidAgentSecret(req: NextRequest): boolean {
  const secret = getAgentApiSecret();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Credits charged per minute of call time — single source of truth. */
export function getCreditsPerMinute(): number {
  const parsed = parseInt(process.env.CREDITS_PER_MINUTE || '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
