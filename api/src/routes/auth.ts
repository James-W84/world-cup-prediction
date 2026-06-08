import { Router } from 'express';
import passport from 'passport';
import { authController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { predictionController } from '../controllers/predictionController';
import { leagueController } from '../controllers/leagueController';
import { matchController } from '../controllers/matchController';
import { cronController } from '../controllers/cronController';
import { homeController } from '../controllers/homeController';

const router = Router();

// Auth
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/error`,
  }),
  authController.googleCallback
);
router.get('/auth/me', requireAuth, authController.me);
router.post('/auth/logout', requireAuth, authController.logout);

// Home dashboard
router.get('/home', requireAuth, homeController.getDashboard);

// Predictions
router.post('/predictions', requireAuth, predictionController.createOrUpdate);
router.get('/predictions', requireAuth, predictionController.getByMatch);
router.post('/predictions/:predictionId/submit', requireAuth, predictionController.submit);

// Leagues
router.get('/leagues', requireAuth, leagueController.getMyLeagues);
router.post('/leagues', requireAuth, leagueController.create);
router.post('/leagues/join', requireAuth, leagueController.join);
router.get('/leagues/:leagueId', requireAuth, leagueController.getDetails);
router.get('/leagues/:leagueId/leaderboard', requireAuth, leagueController.getLeaderboard);
router.get('/leagues/:leagueId/requests', requireAuth, leagueController.getJoinRequests);
router.post('/leagues/:leagueId/requests/:requestId/approve', requireAuth, leagueController.approveRequest);
router.post('/leagues/:leagueId/requests/:requestId/deny', requireAuth, leagueController.denyRequest);
router.delete('/leagues/:leagueId/members/:memberId', requireAuth, leagueController.removeMember);
router.delete('/leagues/:leagueId', requireAuth, leagueController.deleteLeague);

// Matches (public read)
router.get('/matches', matchController.getByStage);
router.get('/matches/:matchId', matchController.getById);
router.get('/matches/:matchId/predictions', requireAuth, matchController.getAllPredictions);

// Admin (API key protected)
router.post('/admin/cron/score', cronController.score);
router.post('/admin/sync', cronController.sync);

export default router;
