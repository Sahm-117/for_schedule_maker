import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL || 'https://vnmeeqvwqaeczjlvzoul.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Keep-Alive Endpoint
 * Prevents Supabase database from shutting down due to inactivity
 * Should be called by a cron job every 5 days
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Simple query to keep database active using Supabase client
    const { count, error } = await supabase
      .from('Week')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Database pinged successfully',
      timestamp: new Date().toISOString(),
      weekCount: count || 0
    });
  } catch (error) {
    console.error('Keep-alive error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
