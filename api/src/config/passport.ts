import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../lib/prisma';
import { config } from './index';
import { logger } from '../utils/logger';

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const providerAccountId = profile.id;
        const email = profile.emails?.[0]?.value;
        const avatarUrl = profile.photos?.[0]?.value;

        if (!email) {
          return done(new Error('No email from Google profile'));
        }

        // Check if account already linked
        const existingAccount = await prisma.account.findUnique({
          where: { provider_providerAccountId: { provider: 'google', providerAccountId } },
          include: { user: true },
        });

        if (existingAccount) {
          return done(null, existingAccount.user);
        }

        // Check if user exists with same email
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          // Generate username from display name + random suffix
          const baseName = (profile.displayName || email.split('@')[0])
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const username = `${baseName}${Math.floor(Math.random() * 9000) + 1000}`;

          user = await prisma.user.create({
            data: {
              email,
              username,
              avatarUrl: avatarUrl || null,
            },
          });
        }

        // Link the Google account
        await prisma.account.create({
          data: {
            userId: user.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId,
          },
        });

        logger.info(`User authenticated via Google: ${user.email}`);
        return done(null, user);
      } catch (err) {
        logger.error('Google OAuth error', err);
        return done(err as Error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;
