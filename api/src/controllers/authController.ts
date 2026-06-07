import { Request, Response } from 'express';
import { logger } from '../utils/logger';

export const authController = {
  googleCallback: (_req: Request, res: Response): void => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/auth/callback?success=true`);
  },

  me: (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl,
        totalPoints: req.user.totalPoints,
      },
    });
  },

  logout: (req: Request, res: Response): void => {
    req.logout((err) => {
      if (err) {
        logger.error('Logout error', err);
        res.status(500).json({ success: false, error: 'Logout failed' });
        return;
      }
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
      });
    });
  },
};
