import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Import your existing auth logic here
  // This will be a serverless function

  res.status(200).json({ message: 'Login endpoint converted to Vercel' });
}