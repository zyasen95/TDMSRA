import type { NextApiRequest, NextApiResponse } from 'next';
import { validatePassword, createSessionToken, setSessionCookie } from '../../../lib/auth';

type LoginRequest = {
  password: string;
};

type LoginResponse = {
  success: boolean;
  error?: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoginResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { password } = req.body as LoginRequest;

    // Validate password is provided
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    // Validate password
    if (!validatePassword(password)) {
      return res.status(401).json({ success: false, error: 'Invalid access code' });
    }

    // Create session token
    const token = createSessionToken();

    // Set session cookie
    setSessionCookie(res, token);

    // Return success
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}