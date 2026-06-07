import { Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { config } from '../config';
import { AuthenticatedRequest, TokenPayload } from '../types';
import { logger } from '../utils/logger';

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ success: false, error: 'Invalid token' });
    } else {
      logger.error('Auth middleware error', error);
      res.status(500).json({ success: false, error: 'Authentication error' });
    }
  }
};

export const generateAccessToken = (userId: string, email: string): string => {
  const options: SignOptions = {
    expiresIn: config.jwt.expiry as StringValue,
  };
  return jwt.sign({ userId, email }, config.jwt.secret, options);
};

export const generateRefreshToken = (userId: string, email: string): string => {
  const options: SignOptions = {
    expiresIn: config.jwt.refreshExpiry as StringValue,
  };
  return jwt.sign({ userId, email, type: 'refresh' }, config.jwt.secret, options);
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    return null;
  }
};
