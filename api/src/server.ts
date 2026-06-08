import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import './config/passport';
import passport from 'passport';
import { config } from './config';
import { logger } from './utils/logger';
import apiRoutes from './routes/auth';
import { scheduleScoringCron } from './jobs/score-cron';

const app = express();

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionOptions: session.SessionOptions = {
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === 'production',
    httpOnly: true,
    maxAge: config.session.maxAge,
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
  },
};

const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl && !dbUrl.startsWith('file:')) {
  const PgSession = connectPgSimple(session);
  const pgPool = new Pool({ connectionString: dbUrl });
  sessionOptions.store = new PgSession({ pool: pgPool, createTableIfMissing: true });
}

app.use(session(sessionOptions));

app.use(passport.initialize());
app.use(passport.session());

app.use('/', apiRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(config.port, () => {
  logger.info(`Server running at http://localhost:${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  scheduleScoringCron();
});
