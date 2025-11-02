import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSessionCookie } from '../../../lib/auth';

type LogoutResponse = {
  success: boolean;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<LogoutResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false });
  }

  try {
    // Clear the session cookie
    clearSessionCookie(res);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false });
  }
}