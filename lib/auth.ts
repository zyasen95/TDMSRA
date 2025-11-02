import { serialize, parse } from 'cookie';
import { NextApiRequest, NextApiResponse } from 'next';

const SESSION_COOKIE_NAME = 'msra_demo_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-change-in-production';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo123';

/**
 * Validate the provided password against the environment variable
 */
export function validatePassword(password: string): boolean {
  return password === DEMO_PASSWORD;
}

/**
 * Create a simple session token (basic implementation)
 * In production, use a proper JWT library or session management solution
 */
export function createSessionToken(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `${timestamp}-${random}`;
}

/**
 * Set the session cookie
 */
export function setSessionCookie(res: NextApiResponse, token: string) {
  const cookie = serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });

  res.setHeader('Set-Cookie', cookie);
}

/**
 * Clear the session cookie
 */
export function clearSessionCookie(res: NextApiResponse) {
  const cookie = serialize(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  res.setHeader('Set-Cookie', cookie);
}

/**
 * Get the session token from cookies
 */
export function getSessionToken(req: NextApiRequest): string | undefined {
  const cookies = parse(req.headers.cookie || '');
  return cookies[SESSION_COOKIE_NAME];
}

/**
 * Check if a session token is valid
 * In this simple implementation, any non-empty token is valid
 * In production, you'd verify JWT signatures, check expiry, etc.
 */
export function isValidSession(token: string | undefined): boolean {
  return !!token && token.length > 0;
}

/**
 * Middleware helper to check authentication
 * Returns the session token if valid, undefined otherwise
 */
export function requireAuth(req: NextApiRequest): string | undefined {
  const token = getSessionToken(req);
  return isValidSession(token) ? token : undefined;
}