import { Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

export const authController = {
  register: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { email, username, password, confirmPassword } = req.body;

      if (!email || !username || !password || !confirmPassword) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      if (password !== confirmPassword) {
        res.status(400).json({ success: false, error: 'Passwords do not match' });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        return;
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { username }],
        },
      });

      if (existingUser) {
        res.status(409).json({ success: false, error: 'Email or username already exists' });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          leaderboardEntry: {
            create: {},
          },
        },
      });

      const accessToken = generateAccessToken(user.id, user.email);
      const refreshToken = generateRefreshToken(user.id, user.email);

      logger.info(`User registered: ${user.email}`);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error('Registration error', error);
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  },

  login: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ success: false, error: 'Email and password required' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      const accessToken = generateAccessToken(user.id, user.email);
      const refreshToken = generateRefreshToken(user.id, user.email);

      logger.info(`User logged in: ${user.email}`);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error('Login error', error);
      res.status(500).json({ success: false, error: 'Login failed' });
    }
  },

  refresh: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ success: false, error: 'Refresh token required' });
        return;
      }

      const decoded = await new Promise((resolve, reject) => {
        const jwt = require('jsonwebtoken');
        const { config } = require('../config');
        jwt.verify(refreshToken, config.jwt.secret, (err: any, decoded: any) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });

      const decoded_any = decoded as any;
      const newAccessToken = generateAccessToken(decoded_any.userId, decoded_any.email);

      res.json({
        success: true,
        data: { accessToken: newAccessToken },
      });
    } catch (error) {
      logger.error('Token refresh error', error);
      res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }
  },

  logout: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      logger.info(`User logged out: ${req.user?.email}`);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error', error);
      res.status(500).json({ success: false, error: 'Logout failed' });
    }
  },
};
