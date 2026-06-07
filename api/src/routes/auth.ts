import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { predictionController } from '../controllers/predictionController';
import { leagueController } from '../controllers/leagueController';
import { matchController } from '../controllers/matchController';
import { cronController } from '../controllers/cronController';

const router = Router();

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authMiddleware, authController.logout);

// Prediction routes
router.post('/predictions', authMiddleware, predictionController.createOrUpdate);
router.get('/predictions', authMiddleware, predictionController.getByMatch);
router.post('/predictions/:predictionId/submit', authMiddleware, predictionController.submit);

// League routes
router.post('/leagues', authMiddleware, leagueController.create);
router.get('/leagues/:leagueId', authMiddleware, leagueController.getDetails);
router.get('/leagues/:leagueId/leaderboard', authMiddleware, leagueController.getLeaderboard);
router.post('/leagues/join', authMiddleware, leagueController.join);

// Match routes
router.get('/matches', matchController.getByStage);
router.get('/matches/:matchId', matchController.getById);
router.get('/matches/:matchId/predictions', authMiddleware, matchController.getAllPredictions);

// Cron routes (admin)
router.post('/admin/cron/score', cronController.score);

export default router;
