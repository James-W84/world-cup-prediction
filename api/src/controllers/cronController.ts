import { Request, Response } from 'express';
import { scoreCompletedMatches, scoreGroupTableBonuses } from '../jobs/score-cron';
import { syncMatchesFromApi } from '../jobs/sync-matches';
import { config } from '../config';
import { logger } from '../utils/logger';

function checkApiKey(req: Request, res: Response): boolean {
  if (req.headers['x-api-key'] !== config.cron.apiKey) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

export const cronController = {
  score: async (req: Request, res: Response): Promise<void> => {
    if (!checkApiKey(req, res)) return;
    try {
      const [matchResult, tableResult] = await Promise.all([
        scoreCompletedMatches(),
        scoreGroupTableBonuses(),
      ]);
      res.json({ success: true, data: { matchResult, tableResult } });
    } catch (error) {
      logger.error('Cron scoring failed', error);
      res.status(500).json({ success: false, error: 'Scoring failed' });
    }
  },

  sync: async (req: Request, res: Response): Promise<void> => {
    if (!checkApiKey(req, res)) return;
    try {
      const result = await syncMatchesFromApi();
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Match sync failed', error);
      res.status(500).json({ success: false, error: 'Sync failed' });
    }
  },
};
