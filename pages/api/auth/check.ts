import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '../../../lib/auth';

type CheckResponse = {
  authenticated: boolean;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckResponse>
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ authenticated: false });
  }

  try {
    // Check if user has valid session
    const token = requireAuth(req);
    const authenticated = !!token;

    return res.status(200).json({ authenticated });
  } catch (error) {
    console.error('Check auth error:', error);
    return res.status(500).json({ authenticated: false });
  }
}