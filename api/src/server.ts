import express, { Express } from 'express';
import { config } from './config';
import { logger } from './utils/logger';
import apiRoutes from './routes/auth';

const app: Express = express();
const port = typeof config.port === 'number' ? config.port : parseInt(String(config.port), 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err: any, _req: any, res: any) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(port, () => {
  logger.info(`🚀 Server is running at http://localhost:${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
